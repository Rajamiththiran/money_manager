// File: src-tauri/src/commands/categories.rs
use crate::models::category::{Category, CategoryWithChildren, CreateCategoryInput};
use crate::AppState;
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_categories(state: State<'_, AppState>) -> Result<Vec<Category>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, parent_id, name, type FROM categories ORDER BY name")
        .map_err(|e| format!("Query error: {}", e))?;

    let cats = stmt
        .query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                category_type: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to fetch categories: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(cats)
}

#[tauri::command]
pub fn get_categories_with_children(
    state: State<'_, AppState>,
) -> Result<Vec<CategoryWithChildren>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Get all categories
    let mut stmt = conn
        .prepare("SELECT id, parent_id, name, type FROM categories ORDER BY name")
        .map_err(|e| format!("Query error: {}", e))?;

    let all_cats: Vec<Category> = stmt
        .query_map([], |row| {
            Ok(Category {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                category_type: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to fetch categories: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    // Build parent → children structure
    let parents: Vec<&Category> = all_cats.iter().filter(|c| c.parent_id.is_none()).collect();

    let result: Vec<CategoryWithChildren> = parents
        .iter()
        .map(|parent| {
            let children: Vec<Category> = all_cats
                .iter()
                .filter(|c| c.parent_id == Some(parent.id))
                .cloned()
                .collect();

            CategoryWithChildren {
                category: (*parent).clone(),
                children,
            }
        })
        .collect();

    Ok(result)
}

#[tauri::command]
pub fn create_category(
    state: State<'_, AppState>,
    input: CreateCategoryInput,
) -> Result<Category, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Validate type
    if input.category_type != "INCOME" && input.category_type != "EXPENSE" {
        return Err("Category type must be INCOME or EXPENSE".to_string());
    }

    // Validate parent exists if provided
    if let Some(parent_id) = input.parent_id {
        let exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM categories WHERE id = ?1",
                params![parent_id],
                |row| row.get::<_, i64>(0),
            )
            .map(|c| c > 0)
            .unwrap_or(false);

        if !exists {
            return Err("Parent category not found".to_string());
        }
    }

    conn.execute(
        "INSERT INTO categories (parent_id, name, type) VALUES (?1, ?2, ?3)",
        params![input.parent_id, input.name, input.category_type],
    )
    .map_err(|e| format!("Failed to create category: {}", e))?;

    let cat_id = conn.last_insert_rowid();

    let cat = conn
        .query_row(
            "SELECT id, parent_id, name, type FROM categories WHERE id = ?1",
            params![cat_id],
            |row| {
                Ok(Category {
                    id: row.get(0)?,
                    parent_id: row.get(1)?,
                    name: row.get(2)?,
                    category_type: row.get(3)?,
                })
            },
        )
        .map_err(|e| format!("Failed to fetch created category: {}", e))?;

    Ok(cat)
}

#[tauri::command]
pub fn update_category(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    parent_id: Option<i64>,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut set_clauses: Vec<String> = Vec::new();

    if let Some(ref n) = name {
        set_clauses.push(format!("name = '{}'", n.replace('\'', "''")));
    }

    if let Some(pid) = parent_id {
        if pid == id {
            return Err("A category cannot be its own parent".to_string());
        }
        set_clauses.push(format!("parent_id = {}", pid));
    }

    if set_clauses.is_empty() {
        return Err("No fields to update".to_string());
    }

    let query = format!(
        "UPDATE categories SET {} WHERE id = {}",
        set_clauses.join(", "),
        id
    );

    let rows = conn
        .execute(&query, [])
        .map_err(|e| format!("Failed to update category: {}", e))?;

    if rows == 0 {
        return Err("Category not found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn delete_category(state: State<'_, AppState>, category_id: i64) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Check for child categories
    let child_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM categories WHERE parent_id = ?1",
            params![category_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if child_count > 0 {
        return Err(format!(
            "Cannot delete category with {} subcategories. Delete them first.",
            child_count
        ));
    }

    // Check for transactions
    let txn_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE category_id = ?1",
            params![category_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if txn_count > 0 {
        return Err(format!(
            "Cannot delete category with {} transactions.",
            txn_count
        ));
    }

    // Check for budgets
    let budget_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM budgets WHERE category_id = ?1",
            params![category_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if budget_count > 0 {
        return Err("Cannot delete category with active budgets.".to_string());
    }

    let rows = conn
        .execute("DELETE FROM categories WHERE id = ?1", params![category_id])
        .map_err(|e| format!("Failed to delete category: {}", e))?;

    if rows == 0 {
        return Err("Category not found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn get_recent_categories(
    state: State<'_, AppState>,
    transaction_type: String,
    limit: Option<i32>,
) -> Result<Vec<Category>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let max_items = limit.unwrap_or(5);

    let mut stmt = conn
        .prepare(
            "SELECT c.id, c.parent_id, c.name, c.type
             FROM categories c
             INNER JOIN transactions t ON t.category_id = c.id
             WHERE t.type = ?1
             GROUP BY c.id
             ORDER BY MAX(t.created_at) DESC
             LIMIT ?2",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let cats = stmt
        .query_map(params![transaction_type, max_items], |row| {
            Ok(Category {
                id: row.get(0)?,
                parent_id: row.get(1)?,
                name: row.get(2)?,
                category_type: row.get(3)?,
            })
        })
        .map_err(|e| format!("Failed to fetch recent categories: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(cats)
}
