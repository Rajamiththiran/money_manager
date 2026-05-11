// File: src-tauri/src/commands/accounts.rs
use crate::models::account::{Account, AccountGroup, AccountWithBalance, CreateAccountInput};
use crate::AppState;
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_account_groups(state: State<'_, AppState>) -> Result<Vec<AccountGroup>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare("SELECT id, name, type FROM account_groups ORDER BY id")
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let groups = stmt
        .query_map([], |row| {
            Ok(AccountGroup {
                id: row.get(0)?,
                name: row.get(1)?,
                account_type: row.get(2)?,
            })
        })
        .map_err(|e| format!("Failed to fetch account groups: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read account groups: {}", e))?;

    Ok(groups)
}

#[tauri::command]
pub fn get_accounts(state: State<'_, AppState>) -> Result<Vec<Account>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.group_id, a.name, a.initial_balance, a.currency, a.created_at, ag.name as group_name
             FROM accounts a
             INNER JOIN account_groups ag ON a.group_id = ag.id
             ORDER BY a.name",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let accounts = stmt
        .query_map([], |row| {
            Ok(Account {
                id: row.get(0)?,
                group_id: row.get(1)?,
                name: row.get(2)?,
                initial_balance: row.get(3)?,
                currency: row.get(4)?,
                created_at: row.get(5)?,
            })
        })
        .map_err(|e| format!("Failed to fetch accounts: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read accounts: {}", e))?;

    Ok(accounts)
}

#[tauri::command]
pub fn get_accounts_with_balance(
    state: State<'_, AppState>,
) -> Result<Vec<AccountWithBalance>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT a.id, a.group_id, a.name, a.initial_balance, a.currency, a.created_at,
                    ag.name as group_name, ag.type as group_type,
                    CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL) as journal_balance
             FROM accounts a
             INNER JOIN account_groups ag ON a.group_id = ag.id
             LEFT JOIN journal_entries je ON je.account_id = a.id
             GROUP BY a.id
             ORDER BY ag.id, a.name",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let accounts = stmt
        .query_map([], |row| {
            let initial_balance: f64 = row.get(3)?;
            let journal_balance: f64 = row.get(8)?;
            let balance = initial_balance + journal_balance;

            Ok(AccountWithBalance {
                account: Account {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    name: row.get(2)?,
                    initial_balance,
                    currency: row.get(4)?,
                    created_at: row.get(5)?,
                },
                current_balance: (balance * 100.0).round() / 100.0,
            })
        })
        .map_err(|e| format!("Failed to fetch accounts: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read accounts: {}", e))?;

    Ok(accounts)
}

#[tauri::command]
pub fn create_account(
    state: State<'_, AppState>,
    input: CreateAccountInput,
) -> Result<Account, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Validate group exists
    let group_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM account_groups WHERE id = ?1",
            params![input.group_id],
            |row| row.get::<_, i64>(0),
        )
        .map(|count| count > 0)
        .unwrap_or(false);

    if !group_exists {
        return Err("Account group not found".to_string());
    }

    let currency = input.currency.unwrap_or_else(|| "LKR".to_string());

    conn.execute(
        "INSERT INTO accounts (group_id, name, initial_balance, currency) VALUES (?1, ?2, ?3, ?4)",
        params![input.group_id, input.name, input.initial_balance, currency],
    )
    .map_err(|e| format!("Failed to create account: {}", e))?;

    let account_id = conn.last_insert_rowid();

    let account = conn
        .query_row(
            "SELECT a.id, a.group_id, a.name, a.initial_balance, a.currency, a.created_at
             FROM accounts a
             WHERE a.id = ?1",
            params![account_id],
            |row| {
                Ok(Account {
                    id: row.get(0)?,
                    group_id: row.get(1)?,
                    name: row.get(2)?,
                    initial_balance: row.get(3)?,
                    currency: row.get(4)?,
                    created_at: row.get(5)?,
                })
            },
        )
        .map_err(|e| format!("Failed to fetch created account: {}", e))?;

    Ok(account)
}

#[tauri::command]
pub fn update_account(
    state: State<'_, AppState>,
    id: i64,
    name: Option<String>,
    initial_balance: Option<f64>,
    currency: Option<String>,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut set_clauses: Vec<String> = Vec::new();

    if let Some(ref n) = name {
        set_clauses.push(format!("name = '{}'", n.replace('\'', "''")));
    }

    if let Some(b) = initial_balance {
        set_clauses.push(format!("initial_balance = {}", b));
    }

    if let Some(ref c) = currency {
        set_clauses.push(format!("currency = '{}'", c));
    }

    if set_clauses.is_empty() {
        return Err("No fields to update".to_string());
    }

    let query = format!(
        "UPDATE accounts SET {} WHERE id = {}",
        set_clauses.join(", "),
        id
    );

    let rows = conn
        .execute(&query, [])
        .map_err(|e| format!("Failed to update account: {}", e))?;

    if rows == 0 {
        return Err("Account not found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn delete_account(state: State<'_, AppState>, account_id: i64) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Check for existing transactions
    let txn_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE account_id = ?1 OR to_account_id = ?1",
            params![account_id],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if txn_count > 0 {
        return Err(format!(
            "Cannot delete account with {} existing transactions. Delete them first.",
            txn_count
        ));
    }

    let rows = conn
        .execute("DELETE FROM accounts WHERE id = ?1", params![account_id])
        .map_err(|e| format!("Failed to delete account: {}", e))?;

    if rows == 0 {
        return Err("Account not found".to_string());
    }

    Ok(())
}
