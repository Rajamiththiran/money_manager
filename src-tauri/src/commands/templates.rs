// File: src-tauri/src/commands/templates.rs
use crate::models::template::{
    CreateTemplateInput, TransactionTemplate, TransactionTemplateWithDetails, UpdateTemplateInput,
};
use sqlx::{Row, SqlitePool};
use tauri::State;

#[tauri::command]
pub async fn get_templates(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<TransactionTemplateWithDetails>, String> {
    let rows = sqlx::query(
        "SELECT 
            t.id, t.name, t.transaction_type, t.amount, t.account_id, t.to_account_id,
            t.category_id, t.memo, t.use_count, t.last_used_at, t.created_at, t.updated_at,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name
         FROM transaction_templates t
         LEFT JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts ta ON t.to_account_id = ta.id
         LEFT JOIN categories c ON t.category_id = c.id
         ORDER BY t.use_count DESC, t.updated_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch templates: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| TransactionTemplateWithDetails {
            template: TransactionTemplate {
                id: row.get("id"),
                name: row.get("name"),
                transaction_type: row.get("transaction_type"),
                amount: row.get("amount"),
                account_id: row.get("account_id"),
                to_account_id: row.get("to_account_id"),
                category_id: row.get("category_id"),
                memo: row.get("memo"),
                use_count: row.get("use_count"),
                last_used_at: row.get("last_used_at"),
                created_at: row.get("created_at"),
                updated_at: row.get("updated_at"),
            },
            account_name: row.get("account_name"),
            to_account_name: row.get("to_account_name"),
            category_name: row.get("category_name"),
        })
        .collect())
}

#[tauri::command]
pub async fn create_template(
    pool: State<'_, SqlitePool>,
    input: CreateTemplateInput,
) -> Result<TransactionTemplate, String> {
    // Validate transaction type
    if input.transaction_type != "INCOME"
        && input.transaction_type != "EXPENSE"
        && input.transaction_type != "TRANSFER"
    {
        return Err("Invalid transaction type. Must be INCOME, EXPENSE, or TRANSFER.".to_string());
    }

    // Validate name
    if input.name.trim().is_empty() {
        return Err("Template name is required.".to_string());
    }

    // Validate amount
    if input.amount < 0.0 {
        return Err("Amount cannot be negative.".to_string());
    }

    // Validate account exists if provided
    if let Some(account_id) = input.account_id {
        let exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
            .bind(account_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();
        if !exists {
            return Err("Account not found.".to_string());
        }
    }

    // Validate to_account exists if provided
    if let Some(to_account_id) = input.to_account_id {
        let exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
            .bind(to_account_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();
        if !exists {
            return Err("Destination account not found.".to_string());
        }
    }

    // Validate category exists if provided
    if let Some(category_id) = input.category_id {
        let exists = sqlx::query("SELECT id FROM categories WHERE id = ?")
            .bind(category_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();
        if !exists {
            return Err("Category not found.".to_string());
        }
    }

    // Validate transfer-specific rules
    if input.transaction_type == "TRANSFER" {
        if input.account_id.is_none() || input.to_account_id.is_none() {
            return Err(
                "Transfer templates require both source and destination accounts.".to_string(),
            );
        }
        if input.account_id == input.to_account_id {
            return Err("Cannot transfer to the same account.".to_string());
        }
    }

    let result = sqlx::query(
        "INSERT INTO transaction_templates 
         (name, transaction_type, amount, account_id, to_account_id, category_id, memo)
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(input.name.trim())
    .bind(&input.transaction_type)
    .bind(input.amount)
    .bind(input.account_id)
    .bind(input.to_account_id)
    .bind(input.category_id)
    .bind(&input.memo)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to create template: {}", e))?;

    let template_id = result.last_insert_rowid();

    let row = sqlx::query(
        "SELECT id, name, transaction_type, amount, account_id, to_account_id,
                category_id, memo, use_count, last_used_at, created_at, updated_at
         FROM transaction_templates WHERE id = ?",
    )
    .bind(template_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch created template: {}", e))?;

    Ok(TransactionTemplate {
        id: row.get("id"),
        name: row.get("name"),
        transaction_type: row.get("transaction_type"),
        amount: row.get("amount"),
        account_id: row.get("account_id"),
        to_account_id: row.get("to_account_id"),
        category_id: row.get("category_id"),
        memo: row.get("memo"),
        use_count: row.get("use_count"),
        last_used_at: row.get("last_used_at"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

#[tauri::command]
pub async fn update_template(
    pool: State<'_, SqlitePool>,
    input: UpdateTemplateInput,
) -> Result<(), String> {
    let exists = sqlx::query("SELECT id FROM transaction_templates WHERE id = ?")
        .bind(input.id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !exists {
        return Err("Template not found.".to_string());
    }

    let mut set_clauses: Vec<String> = Vec::new();

    if let Some(name) = &input.name {
        if name.trim().is_empty() {
            return Err("Template name cannot be empty.".to_string());
        }
        set_clauses.push(format!("name = '{}'", name.trim().replace('\'', "''")));
    }

    if let Some(amount) = input.amount {
        if amount < 0.0 {
            return Err("Amount cannot be negative.".to_string());
        }
        set_clauses.push(format!("amount = {}", amount));
    }

    if let Some(account_id) = input.account_id {
        let exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
            .bind(account_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();
        if !exists {
            return Err("Account not found.".to_string());
        }
        set_clauses.push(format!("account_id = {}", account_id));
    }

    if let Some(to_account_id) = input.to_account_id {
        let exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
            .bind(to_account_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();
        if !exists {
            return Err("Destination account not found.".to_string());
        }
        set_clauses.push(format!("to_account_id = {}", to_account_id));
    }

    if let Some(category_id) = input.category_id {
        let exists = sqlx::query("SELECT id FROM categories WHERE id = ?")
            .bind(category_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();
        if !exists {
            return Err("Category not found.".to_string());
        }
        set_clauses.push(format!("category_id = {}", category_id));
    }

    if let Some(memo) = &input.memo {
        set_clauses.push(format!("memo = '{}'", memo.replace('\'', "''")));
    }

    if set_clauses.is_empty() {
        return Err("No fields to update.".to_string());
    }

    set_clauses.push("updated_at = datetime('now')".to_string());

    let query = format!(
        "UPDATE transaction_templates SET {} WHERE id = {}",
        set_clauses.join(", "),
        input.id
    );

    sqlx::query(&query)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update template: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_template(pool: State<'_, SqlitePool>, template_id: i64) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM transaction_templates WHERE id = ?")
        .bind(template_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete template: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Template not found.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn use_template(
    pool: State<'_, SqlitePool>,
    template_id: i64,
) -> Result<TransactionTemplateWithDetails, String> {
    // Increment use count and update last_used_at
    sqlx::query(
        "UPDATE transaction_templates 
         SET use_count = use_count + 1, last_used_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?",
    )
    .bind(template_id)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to update template usage: {}", e))?;

    // Return template with details
    let row = sqlx::query(
        "SELECT 
            t.id, t.name, t.transaction_type, t.amount, t.account_id, t.to_account_id,
            t.category_id, t.memo, t.use_count, t.last_used_at, t.created_at, t.updated_at,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name
         FROM transaction_templates t
         LEFT JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts ta ON t.to_account_id = ta.id
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.id = ?",
    )
    .bind(template_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Template not found.".to_string())?;

    Ok(TransactionTemplateWithDetails {
        template: TransactionTemplate {
            id: row.get("id"),
            name: row.get("name"),
            transaction_type: row.get("transaction_type"),
            amount: row.get("amount"),
            account_id: row.get("account_id"),
            to_account_id: row.get("to_account_id"),
            category_id: row.get("category_id"),
            memo: row.get("memo"),
            use_count: row.get("use_count"),
            last_used_at: row.get("last_used_at"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        },
        account_name: row.get("account_name"),
        to_account_name: row.get("to_account_name"),
        category_name: row.get("category_name"),
    })
}
