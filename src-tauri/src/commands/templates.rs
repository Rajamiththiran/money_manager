// File: src-tauri/src/commands/templates.rs
use crate::models::template::{
    CreateTemplateInput, TransactionTemplate, TransactionTemplateWithDetails, UpdateTemplateInput,
};
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use tauri::State;

#[tauri::command]
pub fn get_templates(
    state: State<'_, AppState>,
) -> Result<Vec<TransactionTemplateWithDetails>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
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
    ).map_err(|e| format!("Database error: {}", e))?;

    let templates: Vec<TransactionTemplateWithDetails> = stmt.query_map([], |row| {
        Ok(TransactionTemplateWithDetails {
            template: TransactionTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                transaction_type: row.get(2)?,
                amount: row.get(3)?,
                account_id: row.get(4)?,
                to_account_id: row.get(5)?,
                category_id: row.get(6)?,
                memo: row.get(7)?,
                use_count: row.get(8)?,
                last_used_at: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            },
            account_name: row.get(12)?,
            to_account_name: row.get(13)?,
            category_name: row.get(14)?,
        })
    }).unwrap().filter_map(Result::ok).collect();

    Ok(templates)
}

#[tauri::command]
pub fn create_template(
    state: State<'_, AppState>,
    input: CreateTemplateInput,
) -> Result<TransactionTemplate, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

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
        let exists: bool = conn.query_row(
            "SELECT COUNT(id) FROM accounts WHERE id = ?1",
            params![account_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;
        if !exists {
            return Err("Account not found.".to_string());
        }
    }

    // Validate to_account exists if provided
    if let Some(to_account_id) = input.to_account_id {
        let exists: bool = conn.query_row(
            "SELECT COUNT(id) FROM accounts WHERE id = ?1",
            params![to_account_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;
        if !exists {
            return Err("Destination account not found.".to_string());
        }
    }

    // Validate category exists if provided
    if let Some(category_id) = input.category_id {
        let exists: bool = conn.query_row(
            "SELECT COUNT(id) FROM categories WHERE id = ?1",
            params![category_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;
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

    conn.execute(
        "INSERT INTO transaction_templates 
         (name, transaction_type, amount, account_id, to_account_id, category_id, memo)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            input.name.trim(),
            input.transaction_type,
            input.amount,
            input.account_id,
            input.to_account_id,
            input.category_id,
            input.memo
        ],
    ).map_err(|e| format!("Failed to create template: {}", e))?;

    let template_id = conn.last_insert_rowid();

    let mut stmt = conn.prepare(
        "SELECT id, name, transaction_type, amount, account_id, to_account_id,
                category_id, memo, use_count, last_used_at, created_at, updated_at
         FROM transaction_templates WHERE id = ?1",
    ).unwrap();

    stmt.query_row(params![template_id], |row| {
        Ok(TransactionTemplate {
            id: row.get(0)?,
            name: row.get(1)?,
            transaction_type: row.get(2)?,
            amount: row.get(3)?,
            account_id: row.get(4)?,
            to_account_id: row.get(5)?,
            category_id: row.get(6)?,
            memo: row.get(7)?,
            use_count: row.get(8)?,
            last_used_at: row.get(9)?,
            created_at: row.get(10)?,
            updated_at: row.get(11)?,
        })
    }).map_err(|e| format!("Failed to fetch created template: {}", e))
}

#[tauri::command]
pub fn update_template(
    state: State<'_, AppState>,
    input: UpdateTemplateInput,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let exists: bool = conn.query_row(
        "SELECT COUNT(id) FROM transaction_templates WHERE id = ?1",
        params![input.id],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

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
        let exists: bool = conn.query_row(
            "SELECT COUNT(id) FROM accounts WHERE id = ?1",
            params![account_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;
        if !exists {
            return Err("Account not found.".to_string());
        }
        set_clauses.push(format!("account_id = {}", account_id));
    }

    if let Some(to_account_id) = input.to_account_id {
        let exists: bool = conn.query_row(
            "SELECT COUNT(id) FROM accounts WHERE id = ?1",
            params![to_account_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;
        if !exists {
            return Err("Destination account not found.".to_string());
        }
        set_clauses.push(format!("to_account_id = {}", to_account_id));
    }

    if let Some(category_id) = input.category_id {
        let exists: bool = conn.query_row(
            "SELECT COUNT(id) FROM categories WHERE id = ?1",
            params![category_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;
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

    conn.execute(&query, [])
        .map_err(|e| format!("Failed to update template: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_template(state: State<'_, AppState>, template_id: i64) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let rows_affected = conn.execute("DELETE FROM transaction_templates WHERE id = ?1", params![template_id])
        .map_err(|e| format!("Failed to delete template: {}", e))?;

    if rows_affected == 0 {
        return Err("Template not found.".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn use_template(
    state: State<'_, AppState>,
    template_id: i64,
) -> Result<TransactionTemplateWithDetails, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Increment use count and update last_used_at
    conn.execute(
        "UPDATE transaction_templates 
         SET use_count = use_count + 1, last_used_at = datetime('now'), updated_at = datetime('now')
         WHERE id = ?1",
        params![template_id],
    ).map_err(|e| format!("Failed to update template usage: {}", e))?;

    // Return template with details
    let mut stmt = conn.prepare(
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
         WHERE t.id = ?1",
    ).map_err(|e| format!("Database error: {}", e))?;

    let details = stmt.query_row(params![template_id], |row| {
        Ok(TransactionTemplateWithDetails {
            template: TransactionTemplate {
                id: row.get(0)?,
                name: row.get(1)?,
                transaction_type: row.get(2)?,
                amount: row.get(3)?,
                account_id: row.get(4)?,
                to_account_id: row.get(5)?,
                category_id: row.get(6)?,
                memo: row.get(7)?,
                use_count: row.get(8)?,
                last_used_at: row.get(9)?,
                created_at: row.get(10)?,
                updated_at: row.get(11)?,
            },
            account_name: row.get(12)?,
            to_account_name: row.get(13)?,
            category_name: row.get(14)?,
        })
    }).optional().map_err(|e| format!("Database error: {}", e))?.ok_or_else(|| "Template not found.".to_string())?;

    Ok(details)
}
