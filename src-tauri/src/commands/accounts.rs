// File: src-tauri/src/commands/accounts.rs
use crate::models::account::{Account, AccountGroup, AccountWithBalance, CreateAccountInput};
use sqlx::{Row, SqlitePool};
use tauri::State;

#[tauri::command]
pub async fn get_account_groups(pool: State<'_, SqlitePool>) -> Result<Vec<AccountGroup>, String> {
    let rows = sqlx::query("SELECT id, name, type FROM account_groups ORDER BY name")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch account groups: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| AccountGroup {
            id: row.get("id"),
            name: row.get("name"),
            account_type: row.get("type"),
        })
        .collect())
}

#[tauri::command]
pub async fn get_accounts(pool: State<'_, SqlitePool>) -> Result<Vec<Account>, String> {
    let rows = sqlx::query(
        "SELECT id, group_id, name, initial_balance, currency, created_at FROM accounts ORDER BY group_id, name"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch accounts: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| Account {
            id: row.get("id"),
            group_id: row.get("group_id"),
            name: row.get("name"),
            initial_balance: row.get("initial_balance"),
            currency: row.get("currency"),
            created_at: row.get("created_at"),
        })
        .collect())
}

#[tauri::command]
pub async fn get_accounts_with_balance(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<AccountWithBalance>, String> {
    let rows = sqlx::query(
        "SELECT id, group_id, name, initial_balance, currency, created_at FROM accounts ORDER BY group_id, name"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch accounts: {}", e))?;

    let mut results = Vec::new();

    for row in rows.iter() {
        let account_id: i64 = row.get("id");
        let account = Account {
            id: account_id,
            group_id: row.get("group_id"),
            name: row.get("name"),
            initial_balance: row.get("initial_balance"),
            currency: row.get("currency"),
            created_at: row.get("created_at"),
        };

        // Calculate current balance from journal entries
        let balance_row = sqlx::query(
            "SELECT COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) as balance FROM journal_entries WHERE account_id = ?"
        )
        .bind(account_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| format!("Failed to calculate balance: {}", e))?;

        let journal_balance: f64 = balance_row.get("balance");
        let current_balance = account.initial_balance + journal_balance;

        results.push(AccountWithBalance {
            account,
            current_balance,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn create_account(
    pool: State<'_, SqlitePool>,
    input: CreateAccountInput,
) -> Result<i64, String> {
    // Validate group exists
    let group_exists = sqlx::query("SELECT id FROM account_groups WHERE id = ?")
        .bind(input.group_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !group_exists {
        return Err("Account group does not exist".to_string());
    }

    let currency = input.currency.unwrap_or_else(|| "LKR".to_string());

    let result = sqlx::query(
        "INSERT INTO accounts (group_id, name, initial_balance, currency) VALUES (?, ?, ?, ?)",
    )
    .bind(input.group_id)
    .bind(input.name)
    .bind(input.initial_balance)
    .bind(currency)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to create account: {}", e))?;

    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn delete_account(pool: State<'_, SqlitePool>, account_id: i64) -> Result<(), String> {
    // Check if account has transactions
    let row = sqlx::query(
        "SELECT COUNT(*) as count FROM transactions WHERE account_id = ? OR to_account_id = ?",
    )
    .bind(account_id)
    .bind(account_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let count: i64 = row.get("count");
    if count > 0 {
        return Err("Cannot delete account with existing transactions".to_string());
    }

    sqlx::query("DELETE FROM accounts WHERE id = ?")
        .bind(account_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete account: {}", e))?;

    Ok(())
}
