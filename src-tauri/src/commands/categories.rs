// File: src-tauri/src/commands/categories.rs
use crate::models::category::{
    Category, CategoryWithChildren, CreateCategoryInput, UpdateCategoryInput,
};
use sqlx::{Row, SqlitePool};
use tauri::State;

#[tauri::command]
pub async fn get_categories(pool: State<'_, SqlitePool>) -> Result<Vec<Category>, String> {
    let rows = sqlx::query("SELECT id, parent_id, name, type FROM categories ORDER BY type, name")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch categories: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| Category {
            id: row.get("id"),
            parent_id: row.get("parent_id"),
            name: row.get("name"),
            category_type: row.get("type"),
        })
        .collect())
}

#[tauri::command]
pub async fn get_categories_with_children(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<CategoryWithChildren>, String> {
    // Get all parent categories (where parent_id IS NULL)
    let parent_rows = sqlx::query(
        "SELECT id, parent_id, name, type FROM categories WHERE parent_id IS NULL ORDER BY type, name"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch parent categories: {}", e))?;

    let mut results = Vec::new();

    for parent_row in parent_rows.iter() {
        let parent_id: i64 = parent_row.get("id");
        let parent = Category {
            id: parent_id,
            parent_id: parent_row.get("parent_id"),
            name: parent_row.get("name"),
            category_type: parent_row.get("type"),
        };

        // Get children for this parent
        let child_rows = sqlx::query(
            "SELECT id, parent_id, name, type FROM categories WHERE parent_id = ? ORDER BY name",
        )
        .bind(parent_id)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch child categories: {}", e))?;

        let children: Vec<Category> = child_rows
            .iter()
            .map(|row| Category {
                id: row.get("id"),
                parent_id: row.get("parent_id"),
                name: row.get("name"),
                category_type: row.get("type"),
            })
            .collect();

        results.push(CategoryWithChildren {
            category: parent,
            children,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn create_category(
    pool: State<'_, SqlitePool>,
    input: CreateCategoryInput,
) -> Result<i64, String> {
    // Validate category type
    if input.category_type != "INCOME" && input.category_type != "EXPENSE" {
        return Err("Category type must be INCOME or EXPENSE".to_string());
    }

    // If parent_id is provided, validate it exists
    if let Some(parent_id) = input.parent_id {
        let parent_exists = sqlx::query("SELECT id FROM categories WHERE id = ?")
            .bind(parent_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();

        if !parent_exists {
            return Err("Parent category does not exist".to_string());
        }
    }

    let result = sqlx::query("INSERT INTO categories (parent_id, name, type) VALUES (?, ?, ?)")
        .bind(input.parent_id)
        .bind(input.name)
        .bind(input.category_type)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to create category: {}", e))?;

    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn update_category(
    pool: State<'_, SqlitePool>,
    input: UpdateCategoryInput,
) -> Result<(), String> {
    // Check if category exists
    let exists = sqlx::query("SELECT id FROM categories WHERE id = ?")
        .bind(input.id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !exists {
        return Err("Category not found".to_string());
    }

    // Build dynamic update query
    let mut updates = Vec::new();
    let mut query = String::from("UPDATE categories SET ");

    if let Some(name) = &input.name {
        updates.push(format!("name = '{}'", name));
    }

    if let Some(parent_id) = input.parent_id {
        // Validate parent exists and prevent circular reference
        if parent_id == input.id {
            return Err("Category cannot be its own parent".to_string());
        }

        let parent_exists = sqlx::query("SELECT id FROM categories WHERE id = ?")
            .bind(parent_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();

        if !parent_exists {
            return Err("Parent category does not exist".to_string());
        }

        updates.push(format!("parent_id = {}", parent_id));
    }

    if updates.is_empty() {
        return Err("No fields to update".to_string());
    }

    query.push_str(&updates.join(", "));
    query.push_str(&format!(" WHERE id = {}", input.id));

    sqlx::query(&query)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update category: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_category(pool: State<'_, SqlitePool>, category_id: i64) -> Result<(), String> {
    // Check if category has transactions
    let has_transactions =
        sqlx::query("SELECT COUNT(*) as count FROM transactions WHERE category_id = ?")
            .bind(category_id)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?;

    let count: i64 = has_transactions.get("count");
    if count > 0 {
        return Err("Cannot delete category with existing transactions".to_string());
    }

    // Check if category has children
    let has_children = sqlx::query("SELECT COUNT(*) as count FROM categories WHERE parent_id = ?")
        .bind(category_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    let child_count: i64 = has_children.get("count");
    if child_count > 0 {
        return Err("Cannot delete category with subcategories".to_string());
    }

    sqlx::query("DELETE FROM categories WHERE id = ?")
        .bind(category_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete category: {}", e))?;

    Ok(())
}
