// File: src-tauri/src/commands/tags.rs
use crate::models::tag::*;
use sqlx::{Row, SqlitePool};
use tauri::State;

#[tauri::command]
pub async fn create_tag(
    pool: State<'_, SqlitePool>,
    input: CreateTagInput,
) -> Result<Tag, String> {
    let name = input.name.trim().to_string();
    if name.is_empty() {
        return Err("Tag name cannot be empty".to_string());
    }

    let color = input.color.unwrap_or_else(|| "#6B7280".to_string());

    let result = sqlx::query(
        "INSERT INTO tags (name, color) VALUES (?, ?)",
    )
    .bind(&name)
    .bind(&color)
    .execute(pool.inner())
    .await
    .map_err(|e| {
        if e.to_string().contains("UNIQUE") {
            format!("Tag '{}' already exists", name)
        } else {
            format!("Failed to create tag: {}", e)
        }
    })?;

    let tag_id = result.last_insert_rowid();

    let row = sqlx::query(
        "SELECT id, name, color, created_at FROM tags WHERE id = ?",
    )
    .bind(tag_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch created tag: {}", e))?;

    Ok(Tag {
        id: row.get("id"),
        name: row.get("name"),
        color: row.get("color"),
        created_at: row.get("created_at"),
    })
}

#[tauri::command]
pub async fn get_tags(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<Tag>, String> {
    let rows = sqlx::query(
        "SELECT id, name, color, created_at FROM tags ORDER BY name ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch tags: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| Tag {
            id: row.get("id"),
            name: row.get("name"),
            color: row.get("color"),
            created_at: row.get("created_at"),
        })
        .collect())
}

#[tauri::command]
pub async fn update_tag(
    pool: State<'_, SqlitePool>,
    input: UpdateTagInput,
) -> Result<Tag, String> {
    // Verify exists
    let exists = sqlx::query("SELECT id FROM tags WHERE id = ?")
        .bind(input.id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !exists {
        return Err("Tag not found".to_string());
    }

    let mut updates = Vec::new();

    if let Some(name) = &input.name {
        let trimmed = name.trim();
        if trimmed.is_empty() {
            return Err("Tag name cannot be empty".to_string());
        }
        updates.push(format!("name = '{}'", trimmed.replace('\'', "''")));
    }
    if let Some(color) = &input.color {
        updates.push(format!("color = '{}'", color));
    }

    if updates.is_empty() {
        return Err("No fields to update".to_string());
    }

    let query = format!(
        "UPDATE tags SET {} WHERE id = {}",
        updates.join(", "),
        input.id
    );

    sqlx::query(&query)
        .execute(pool.inner())
        .await
        .map_err(|e| {
            if e.to_string().contains("UNIQUE") {
                "A tag with that name already exists".to_string()
            } else {
                format!("Failed to update tag: {}", e)
            }
        })?;

    let row = sqlx::query(
        "SELECT id, name, color, created_at FROM tags WHERE id = ?",
    )
    .bind(input.id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch updated tag: {}", e))?;

    Ok(Tag {
        id: row.get("id"),
        name: row.get("name"),
        color: row.get("color"),
        created_at: row.get("created_at"),
    })
}

#[tauri::command]
pub async fn delete_tag(
    pool: State<'_, SqlitePool>,
    tag_id: i64,
) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM tags WHERE id = ?")
        .bind(tag_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete tag: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Tag not found".to_string());
    }
    Ok(())
}

#[tauri::command]
pub async fn get_spending_by_tag(
    pool: State<'_, SqlitePool>,
    start_date: String,
    end_date: String,
) -> Result<Vec<TagSpending>, String> {
    let rows = sqlx::query(
        "SELECT
            tg.id as tag_id,
            tg.name as tag_name,
            tg.color as tag_color,
            CAST(COALESCE(SUM(CASE WHEN t.type = 'INCOME' THEN t.amount ELSE 0 END), 0) AS REAL) as total_income,
            CAST(COALESCE(SUM(CASE WHEN t.type = 'EXPENSE' THEN t.amount ELSE 0 END), 0) AS REAL) as total_expense,
            COUNT(t.id) as transaction_count
         FROM tags tg
         INNER JOIN transaction_tags tt ON tg.id = tt.tag_id
         INNER JOIN transactions t ON tt.transaction_id = t.id
         WHERE t.date >= ? AND t.date <= ?
         GROUP BY tg.id
         ORDER BY total_expense DESC",
    )
    .bind(&start_date)
    .bind(&end_date)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to get spending by tag: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| TagSpending {
            tag_id: row.get("tag_id"),
            tag_name: row.get("tag_name"),
            tag_color: row.get("tag_color"),
            total_income: row.get("total_income"),
            total_expense: row.get("total_expense"),
            transaction_count: row.get("transaction_count"),
        })
        .collect())
}
