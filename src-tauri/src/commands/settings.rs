// File: src-tauri/src/commands/settings.rs
use crate::AppState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

// ======================== APP SETTINGS ========================

/// Read a single setting value by key from the app_settings table.
/// Returns None if the key doesn't exist.
#[tauri::command]
pub fn get_setting(
    state: State<'_, AppState>,
    key: String,
) -> Result<Option<String>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let result: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![key],
            |row| row.get(0),
        )
        .ok();

    Ok(result)
}

/// Write a setting value by key to the app_settings table.
/// Creates the key if it doesn't exist, updates it if it does.
#[tauri::command]
pub fn set_setting(
    state: State<'_, AppState>,
    key: String,
    value: String,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = ?2, updated_at = datetime('now')",
        params![key, value],
    )
    .map_err(|e| format!("Failed to save setting '{}': {}", key, e))?;

    Ok(())
}

// ======================== RESTORE FROM BACKUP ========================

/// Restore the entire database from a JSON backup file content.
/// This will DELETE all existing data and replace it with the backup data.
/// The backup format matches what `export_full_backup` produces.
#[tauri::command]
pub fn restore_from_backup(
    state: State<'_, AppState>,
    backup_json: String,
) -> Result<RestoreResult, String> {
    let pool = crate::get_db(&state)?;
    let mut conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
    restore_from_backup_internal(&mut conn, &backup_json)
}

/// Internal version without State wrapper — callable from scheduled_backup.rs
pub fn restore_from_backup_internal(
    conn: &mut rusqlite::Connection,
    backup_json: &str,
) -> Result<RestoreResult, String> {
    // 1. Parse and validate backup JSON
    let backup: serde_json::Value = serde_json::from_str(backup_json)
        .map_err(|e| format!("Invalid backup file format: {}", e))?;

    let version = backup
        .get("version")
        .and_then(|v| v.as_str())
        .unwrap_or("unknown");

    if version != "1.0" {
        return Err(format!(
            "Unsupported backup version: {}. Expected 1.0",
            version
        ));
    }

    let data = backup
        .get("data")
        .ok_or_else(|| "Backup file missing 'data' field".to_string())?;

    let accounts = data
        .get("accounts")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Backup missing 'accounts' data".to_string())?;

    let categories = data
        .get("categories")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Backup missing 'categories' data".to_string())?;

    let transactions = data
        .get("transactions")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Backup missing 'transactions' data".to_string())?;

    let budgets = data
        .get("budgets")
        .and_then(|v| v.as_array())
        .ok_or_else(|| "Backup missing 'budgets' data".to_string())?;

    let tags = data
        .get("tags")
        .and_then(|v| v.as_array())
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

    let transaction_tags = data
        .get("transaction_tags")
        .and_then(|v| v.as_array())
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

    let savings_goals = data
        .get("savings_goals")
        .and_then(|v| v.as_array())
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

    let goal_contributions = data
        .get("goal_contributions")
        .and_then(|v| v.as_array())
        .map(|v| v.as_slice())
        .unwrap_or(&[]);

    // 2. Begin transaction for atomic restore
    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // 3. Disable foreign keys temporarily for clean deletion
    tx.execute("PRAGMA foreign_keys = OFF", [])
        .map_err(|e| format!("Failed to disable foreign keys: {}", e))?;

    // 4. Clear all user data tables (order matters for foreign keys)
    let tables_to_clear = [
        "goal_contributions",
        "savings_goals",
        "transaction_tags",
        "tags",
        "journal_entries",
        "installment_payments",
        "credit_card_statements",
        "credit_card_settings",
        "installment_plans",
        "recurring_transactions",
        "transaction_templates",
        "exchange_rates",
        "budgets",
        "transactions",
        "categories",
        "accounts",
        // Note: account_groups is kept — it's seeded data
    ];

    for table in &tables_to_clear {
        let query = format!("DELETE FROM {}", table);
        let _ = tx.execute(&query, []);
    }

    // 5. Reset SQLite autoincrement counters
    for table in &tables_to_clear {
        let query = format!("DELETE FROM sqlite_sequence WHERE name = '{}'", table);
        let _ = tx.execute(&query, []);
    }

    // 6. Re-enable foreign keys
    tx.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to re-enable foreign keys: {}", e))?;

    // ============================================================
    // 7. Restore accounts & build old_id → new_id map
    // ============================================================
    let mut account_id_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    let mut accounts_restored: i64 = 0;

    for account in accounts {
        let old_id = account.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let group_id = account
            .get("group_id")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| "Account missing group_id".to_string())?;
        let name = account
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Account missing name".to_string())?;
        let initial_balance = account
            .get("initial_balance")
            .and_then(|v| v.as_f64())
            .unwrap_or(0.0);
        let currency = account
            .get("currency")
            .and_then(|v| v.as_str())
            .unwrap_or("LKR");
        let created_at = account
            .get("created_at")
            .and_then(|v| v.as_str())
            .unwrap_or("");

        tx.execute(
            "INSERT INTO accounts (group_id, name, initial_balance, currency, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
            params![group_id, name, initial_balance, currency, created_at]
        )
        .map_err(|e| format!("Failed to restore account '{}': {}", name, e))?;

        let new_id = tx.last_insert_rowid();
        account_id_map.insert(old_id, new_id);
        accounts_restored += 1;
    }

    // ============================================================
    // 8. Restore categories & build old_id → new_id map
    // ============================================================
    let mut category_id_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    let mut categories_restored: i64 = 0;

    // First pass: parent categories
    for category in categories {
        if category.get("parent_id").and_then(|v| v.as_i64()).is_some() {
            continue;
        }

        let old_id = category.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let name = category
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Category missing name".to_string())?;
        let cat_type = category
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Category missing type".to_string())?;

        tx.execute(
            "INSERT INTO categories (name, type) VALUES (?1, ?2)",
            params![name, cat_type]
        )
        .map_err(|e| format!("Failed to restore category '{}': {}", name, e))?;

        category_id_map.insert(old_id, tx.last_insert_rowid());
        categories_restored += 1;
    }

    // Second pass: child categories
    for category in categories {
        let old_parent_id = match category.get("parent_id").and_then(|v| v.as_i64()) {
            Some(pid) => pid,
            None => continue,
        };

        let old_id = category.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let name = category
            .get("name")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Category missing name".to_string())?;
        let cat_type = category
            .get("type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Category missing type".to_string())?;

        let new_parent_id = category_id_map
            .get(&old_parent_id)
            .copied()
            .unwrap_or(old_parent_id);

        tx.execute(
            "INSERT INTO categories (parent_id, name, type) VALUES (?1, ?2, ?3)",
            params![new_parent_id, name, cat_type]
        )
        .map_err(|e| format!("Failed to restore child category '{}': {}", name, e))?;

        category_id_map.insert(old_id, tx.last_insert_rowid());
        categories_restored += 1;
    }

    // ============================================================
    // 8a. Restore tags & build old_id → new_id map
    // ============================================================
    let mut tag_id_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    let mut tags_restored: i64 = 0;

    for tag in tags {
        let old_id = tag.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let name = tag.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown Tag");
        let color = tag.get("color").and_then(|v| v.as_str()).unwrap_or("#6B7280");
        let created_at = tag.get("created_at").and_then(|v| v.as_str()).unwrap_or("");

        tx.execute(
            "INSERT INTO tags (name, color, created_at) VALUES (?1, ?2, ?3)",
            params![
                name,
                color,
                if created_at.is_empty() { chrono::Utc::now().to_rfc3339() } else { created_at.to_string() }
            ]
        )
        .map_err(|e| format!("Failed to restore tag '{}': {}", name, e))?;

        tag_id_map.insert(old_id, tx.last_insert_rowid());
        tags_restored += 1;
    }

    // ============================================================
    // 8b. Restore savings goals & build old_id → new_id map
    // ============================================================
    let mut goal_id_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    let mut savings_goals_restored: i64 = 0;

    for goal in savings_goals {
        let old_id = goal.get("id").and_then(|v| v.as_i64()).unwrap_or(0);
        let name = goal.get("name").and_then(|v| v.as_str()).unwrap_or("Unknown Goal");
        let target_amount = goal.get("target_amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let target_date = goal.get("target_date").and_then(|v| v.as_str());
        let old_linked_account_id = goal.get("linked_account_id").and_then(|v| v.as_i64());
        let color = goal.get("color").and_then(|v| v.as_str()).unwrap_or("#6B7280");
        let icon = goal.get("icon").and_then(|v| v.as_str()).unwrap_or("target");
        let status = goal.get("status").and_then(|v| v.as_str()).unwrap_or("ACTIVE");
        let created_at = goal.get("created_at").and_then(|v| v.as_str()).unwrap_or("");
        let updated_at = goal.get("updated_at").and_then(|v| v.as_str()).unwrap_or("");

        let new_linked_account_id = old_linked_account_id.and_then(|id| account_id_map.get(&id).copied());

        tx.execute(
            "INSERT INTO savings_goals (name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
            params![
                name, target_amount, target_date, new_linked_account_id, color, icon, status,
                if created_at.is_empty() { chrono::Utc::now().to_rfc3339() } else { created_at.to_string() },
                if updated_at.is_empty() { chrono::Utc::now().to_rfc3339() } else { updated_at.to_string() }
            ]
        )
        .map_err(|e| format!("Failed to restore savings goal '{}': {}", name, e))?;

        goal_id_map.insert(old_id, tx.last_insert_rowid());
        savings_goals_restored += 1;
    }

    // ============================================================
    // 9. Restore transactions and journal entries
    // ============================================================
    let mut txn_id_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
    let mut transactions_restored: i64 = 0;

    for txn in transactions {
        let txn_data = txn.get("transaction").unwrap_or(txn);
        let old_id = txn_data.get("id").and_then(|v| v.as_i64()).unwrap_or(0);

        let date = txn_data
            .get("date")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Transaction missing date".to_string())?;
        let txn_type = txn_data
            .get("transaction_type")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Transaction missing type".to_string())?;
        let amount = txn_data
            .get("amount")
            .and_then(|v| v.as_f64())
            .ok_or_else(|| "Transaction missing amount".to_string())?;
        let old_account_id = txn_data
            .get("account_id")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| "Transaction missing account_id".to_string())?;
        let old_to_account_id = txn_data.get("to_account_id").and_then(|v| v.as_i64());
        let old_category_id = txn_data.get("category_id").and_then(|v| v.as_i64());
        let memo = txn_data.get("memo").and_then(|v| v.as_str());
        let photo_path = txn_data.get("photo_path").and_then(|v| v.as_str());

        let new_account_id = account_id_map.get(&old_account_id).copied().ok_or_else(|| {
            format!(
                "Account ID {} not found in backup (transaction date: {})",
                old_account_id, date
            )
        })?;

        let new_to_account_id = old_to_account_id.map(|id| account_id_map.get(&id).copied().unwrap_or(id));
        let new_category_id = old_category_id.map(|id| category_id_map.get(&id).copied().unwrap_or(id));

        tx.execute(
            r#"INSERT INTO transactions (date, type, amount, account_id, to_account_id, category_id, memo, photo_path)
               VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)"#,
            params![
                date, txn_type, amount, new_account_id, new_to_account_id, new_category_id, memo, photo_path
            ]
        )
        .map_err(|e| format!("Failed to restore transaction (date: {}): {}", date, e))?;

        let new_txn_id = tx.last_insert_rowid();
        if old_id > 0 {
            txn_id_map.insert(old_id, new_txn_id);
        }

        match txn_type {
            "INCOME" => {
                tx.execute(
                    "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?1, ?2, ?3, 0)",
                    params![new_txn_id, new_account_id, amount]
                ).map_err(|e| format!("Failed to create journal entry: {}", e))?;
            }
            "EXPENSE" => {
                tx.execute(
                    "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?1, ?2, 0, ?3)",
                    params![new_txn_id, new_account_id, amount]
                ).map_err(|e| format!("Failed to create journal entry: {}", e))?;
            }
            "TRANSFER" => {
                if let Some(to_acc_id) = new_to_account_id {
                    tx.execute(
                        "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?1, ?2, 0, ?3)",
                        params![new_txn_id, new_account_id, amount]
                    ).map_err(|e| format!("Failed to create journal entry: {}", e))?;

                    tx.execute(
                        "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?1, ?2, ?3, 0)",
                        params![new_txn_id, to_acc_id, amount]
                    ).map_err(|e| format!("Failed to create journal entry: {}", e))?;
                }
            }
            _ => {
                println!("Warning: Unknown transaction type '{}'", txn_type);
            }
        }

        transactions_restored += 1;
    }

    // ============================================================
    // 9b. Restore transaction tags
    // ============================================================
    let mut transaction_tags_restored: i64 = 0;
    for tt_entry in transaction_tags {
        let old_txn_id = tt_entry.get("transaction_id").and_then(|v| v.as_i64()).unwrap_or(0);
        let old_tag_id = tt_entry.get("tag_id").and_then(|v| v.as_i64()).unwrap_or(0);

        if let (Some(&new_txn_id), Some(&new_tag_id)) = (txn_id_map.get(&old_txn_id), tag_id_map.get(&old_tag_id)) {
            let _ = tx.execute(
                "INSERT INTO transaction_tags (transaction_id, tag_id) VALUES (?1, ?2)",
                params![new_txn_id, new_tag_id]
            );
            transaction_tags_restored += 1;
        }
    }

    // ============================================================
    // 9c. Restore goal contributions
    // ============================================================
    let mut goal_contributions_restored: i64 = 0;
    for contrib_entry in goal_contributions {
        let old_goal_id = contrib_entry.get("goal_id").and_then(|v| v.as_i64()).unwrap_or(0);
        let amount = contrib_entry.get("amount").and_then(|v| v.as_f64()).unwrap_or(0.0);
        let contribution_date = contrib_entry.get("contribution_date").and_then(|v| v.as_str()).unwrap_or("");
        let note = contrib_entry.get("note").and_then(|v| v.as_str());
        let created_at = contrib_entry.get("created_at").and_then(|v| v.as_str()).unwrap_or("");

        if let Some(&new_goal_id) = goal_id_map.get(&old_goal_id) {
            let _ = tx.execute(
                "INSERT INTO goal_contributions (goal_id, amount, contribution_date, note, created_at) VALUES (?1, ?2, ?3, ?4, ?5)",
                params![
                    new_goal_id,
                    amount,
                    if contribution_date.is_empty() { chrono::Utc::now().to_rfc3339() } else { contribution_date.to_string() },
                    note,
                    if created_at.is_empty() { chrono::Utc::now().to_rfc3339() } else { created_at.to_string() }
                ]
            );
            goal_contributions_restored += 1;
        }
    }

    // ============================================================
    // 10. Restore budgets
    // ============================================================
    let mut budgets_restored: i64 = 0;
    for budget in budgets {
        let old_category_id = budget
            .get("category_id")
            .and_then(|v| v.as_i64())
            .ok_or_else(|| "Budget missing category_id".to_string())?;
        let amount = budget
            .get("amount")
            .and_then(|v| v.as_f64())
            .ok_or_else(|| "Budget missing amount".to_string())?;
        let period = budget
            .get("period")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Budget missing period".to_string())?;
        let start_date = budget
            .get("start_date")
            .and_then(|v| v.as_str())
            .ok_or_else(|| "Budget missing start_date".to_string())?;

        let new_category_id = category_id_map
            .get(&old_category_id)
            .copied()
            .unwrap_or(old_category_id);

        tx.execute(
            "INSERT INTO budgets (category_id, amount, period, start_date) VALUES (?1, ?2, ?3, ?4)",
            params![new_category_id, amount, period, start_date]
        )
        .map_err(|e| format!("Failed to restore budget: {}", e))?;

        budgets_restored += 1;
    }

    // 11. Commit the transaction
    tx.commit()
        .map_err(|e| format!("Failed to commit restore: {}", e))?;

    Ok(RestoreResult {
        success: true,
        accounts_restored,
        categories_restored,
        transactions_restored,
        budgets_restored,
        tags_restored,
        savings_goals_restored,
        transaction_tags_restored,
        goal_contributions_restored,
    })
}

// ======================== CLEAR ALL DATA ========================

/// Delete ALL user data from the database.
/// Keeps the schema and account_groups (seed data) intact.
#[tauri::command]
pub fn clear_all_data(state: State<'_, AppState>) -> Result<ClearResult, String> {
    let pool = crate::get_db(&state)?;
    let mut conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // Disable foreign keys for clean cascading deletion
    tx.execute("PRAGMA foreign_keys = OFF", [])
        .map_err(|e| format!("Failed to disable foreign keys: {}", e))?;

    // Count records before deletion for the result summary
    let counts = count_all_records(&tx)?;

    // Delete in dependency order (children first)
    let tables_to_clear = [
        "goal_contributions",
        "savings_goals",
        "transaction_tags",
        "tags",
        "journal_entries",
        "installment_payments",
        "credit_card_statements",
        "credit_card_settings",
        "installment_plans",
        "recurring_transactions",
        "transaction_templates",
        "exchange_rates",
        "budgets",
        "transactions",
        "categories",
        "accounts",
        // Note: account_groups preserved (seed data)
        // Note: app_settings preserved (user preferences)
    ];

    for table in &tables_to_clear {
        let query = format!("DELETE FROM {}", table);
        let _ = tx.execute(&query, []);
    }

    // Reset autoincrement counters
    for table in &tables_to_clear {
        let query = format!("DELETE FROM sqlite_sequence WHERE name = '{}'", table);
        let _ = tx.execute(&query, []);
    }

    // Re-enable foreign keys
    tx.execute("PRAGMA foreign_keys = ON", [])
        .map_err(|e| format!("Failed to re-enable foreign keys: {}", e))?;

    tx.commit()
        .map_err(|e| format!("Failed to commit clear: {}", e))?;

    Ok(ClearResult {
        success: true,
        accounts_deleted: counts.0,
        categories_deleted: counts.1,
        transactions_deleted: counts.2,
        budgets_deleted: counts.3,
    })
}

// ======================== HELPERS ========================

/// Count records in main tables before deletion
fn count_all_records(
    tx: &rusqlite::Transaction,
) -> Result<(i64, i64, i64, i64), String> {
    let accounts: i64 = tx.query_row("SELECT COUNT(*) as c FROM accounts", [], |row| row.get(0)).unwrap_or(0);
    let categories: i64 = tx.query_row("SELECT COUNT(*) as c FROM categories", [], |row| row.get(0)).unwrap_or(0);
    let transactions: i64 = tx.query_row("SELECT COUNT(*) as c FROM transactions", [], |row| row.get(0)).unwrap_or(0);
    let budgets: i64 = tx.query_row("SELECT COUNT(*) as c FROM budgets", [], |row| row.get(0)).unwrap_or(0);

    Ok((accounts, categories, transactions, budgets))
}

// ======================== RESPONSE TYPES ========================

#[derive(Debug, Serialize)]
pub struct RestoreResult {
    pub success: bool,
    pub accounts_restored: i64,
    pub categories_restored: i64,
    pub transactions_restored: i64,
    pub budgets_restored: i64,
    pub tags_restored: i64,
    pub savings_goals_restored: i64,
    pub transaction_tags_restored: i64,
    pub goal_contributions_restored: i64,
}

#[derive(Debug, Serialize)]
pub struct ClearResult {
    pub success: bool,
    pub accounts_deleted: i64,
    pub categories_deleted: i64,
    pub transactions_deleted: i64,
    pub budgets_deleted: i64,
}

// ======================== DATA INTEGRITY ========================

/// A single integrity issue found during ledger verification.
#[derive(Debug, Serialize, Clone)]
pub struct IntegrityIssue {
    pub transaction_id: i64,
    pub transaction_type: String,
    pub transaction_date: String,
    pub transaction_amount: f64,
    pub issue_type: String,   // "MISSING_ENTRIES", "WRONG_COUNT", "AMOUNT_MISMATCH", "ORPHANED_ENTRY"
    pub description: String,
    pub account_name: String,
    pub category_name: Option<String>,
    pub memo: Option<String>,
}

/// Result of a full ledger integrity check.
#[derive(Debug, Serialize)]
pub struct LedgerIntegrityResult {
    pub total_checked: i64,
    pub valid_count: i64,
    pub imbalanced_count: i64,
    pub missing_entries_count: i64,
    pub orphaned_entries_count: i64,
    pub issues: Vec<IntegrityIssue>,
    pub checked_at: String,
}

/// Verify every transaction's journal entries against the system's rules:
///   INCOME  → exactly 1 entry: debit = amount, credit = 0
///   EXPENSE → exactly 1 entry: debit = 0, credit = amount
///   TRANSFER→ exactly 2 entries: source credit = dest debit = amount
#[tauri::command]
pub fn verify_ledger_integrity(
    state: State<'_, AppState>,
) -> Result<LedgerIntegrityResult, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
    verify_ledger_integrity_internal(&conn)
}

/// Internal version callable without State wrapper (used by startup check).
pub fn verify_ledger_integrity_internal(
    conn: &rusqlite::Connection,
) -> Result<LedgerIntegrityResult, String> {
    let mut issues: Vec<IntegrityIssue> = Vec::new();

    // 1. Get all transactions with their details
    let mut stmt = conn
        .prepare(
            "SELECT t.id, t.type, t.date, t.amount, t.account_id, t.to_account_id,
                    a.name AS account_name,
                    COALESCE(c.name, '') AS category_name,
                    t.memo
             FROM transactions t
             INNER JOIN accounts a ON t.account_id = a.id
             LEFT JOIN categories c ON t.category_id = c.id
             ORDER BY t.id",
        )
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let transactions: Vec<(i64, String, String, f64, i64, Option<i64>, String, String, Option<String>)> = stmt
        .query_map([], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
                row.get(4)?,
                row.get(5)?,
                row.get(6)?,
                row.get(7)?,
                row.get(8)?,
            ))
        })
        .map_err(|e| format!("Failed to query transactions: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read transactions: {}", e))?;

    let total_checked = transactions.len() as i64;
    let mut valid_count: i64 = 0;
    let mut imbalanced_count: i64 = 0;
    let mut missing_entries_count: i64 = 0;

    for (txn_id, txn_type, txn_date, txn_amount, _account_id, _to_account_id, account_name, category_name, memo) in &transactions {
        // Fetch journal entries for this transaction
        let entries: Vec<(f64, f64, i64)> = conn
            .prepare(
                "SELECT debit, credit, account_id FROM journal_entries WHERE transaction_id = ?1"
            )
            .map_err(|e| format!("Failed to prepare journal query: {}", e))?
            .query_map(params![txn_id], |row| {
                Ok((row.get(0)?, row.get(1)?, row.get(2)?))
            })
            .map_err(|e| format!("Failed to query journal entries: {}", e))?
            .collect::<Result<Vec<_>, _>>()
            .map_err(|e| format!("Failed to read journal entries: {}", e))?;

        let cat_name = if category_name.is_empty() {
            None
        } else {
            Some(category_name.clone())
        };

        match txn_type.as_str() {
            "INCOME" => {
                if entries.is_empty() {
                    missing_entries_count += 1;
                    issues.push(IntegrityIssue {
                        transaction_id: *txn_id,
                        transaction_type: txn_type.clone(),
                        transaction_date: txn_date.clone(),
                        transaction_amount: *txn_amount,
                        issue_type: "MISSING_ENTRIES".to_string(),
                        description: "Income transaction has no journal entries".to_string(),
                        account_name: account_name.clone(),
                        category_name: cat_name,
                        memo: memo.clone(),
                    });
                } else if entries.len() != 1 {
                    imbalanced_count += 1;
                    issues.push(IntegrityIssue {
                        transaction_id: *txn_id,
                        transaction_type: txn_type.clone(),
                        transaction_date: txn_date.clone(),
                        transaction_amount: *txn_amount,
                        issue_type: "WRONG_COUNT".to_string(),
                        description: format!(
                            "Income transaction has {} journal entries (expected 1)",
                            entries.len()
                        ),
                        account_name: account_name.clone(),
                        category_name: cat_name,
                        memo: memo.clone(),
                    });
                } else {
                    let (debit, credit, _) = entries[0];
                    if (debit - txn_amount).abs() > 0.001 || credit > 0.001 {
                        imbalanced_count += 1;
                        issues.push(IntegrityIssue {
                            transaction_id: *txn_id,
                            transaction_type: txn_type.clone(),
                            transaction_date: txn_date.clone(),
                            transaction_amount: *txn_amount,
                            issue_type: "AMOUNT_MISMATCH".to_string(),
                            description: format!(
                                "Income entry has debit={:.2}, credit={:.2} (expected debit={:.2}, credit=0)",
                                debit, credit, txn_amount
                            ),
                            account_name: account_name.clone(),
                            category_name: cat_name,
                            memo: memo.clone(),
                        });
                    } else {
                        valid_count += 1;
                    }
                }
            }
            "EXPENSE" => {
                if entries.is_empty() {
                    missing_entries_count += 1;
                    issues.push(IntegrityIssue {
                        transaction_id: *txn_id,
                        transaction_type: txn_type.clone(),
                        transaction_date: txn_date.clone(),
                        transaction_amount: *txn_amount,
                        issue_type: "MISSING_ENTRIES".to_string(),
                        description: "Expense transaction has no journal entries".to_string(),
                        account_name: account_name.clone(),
                        category_name: cat_name,
                        memo: memo.clone(),
                    });
                } else if entries.len() != 1 {
                    imbalanced_count += 1;
                    issues.push(IntegrityIssue {
                        transaction_id: *txn_id,
                        transaction_type: txn_type.clone(),
                        transaction_date: txn_date.clone(),
                        transaction_amount: *txn_amount,
                        issue_type: "WRONG_COUNT".to_string(),
                        description: format!(
                            "Expense transaction has {} journal entries (expected 1)",
                            entries.len()
                        ),
                        account_name: account_name.clone(),
                        category_name: cat_name,
                        memo: memo.clone(),
                    });
                } else {
                    let (debit, credit, _) = entries[0];
                    if debit > 0.001 || (credit - txn_amount).abs() > 0.001 {
                        imbalanced_count += 1;
                        issues.push(IntegrityIssue {
                            transaction_id: *txn_id,
                            transaction_type: txn_type.clone(),
                            transaction_date: txn_date.clone(),
                            transaction_amount: *txn_amount,
                            issue_type: "AMOUNT_MISMATCH".to_string(),
                            description: format!(
                                "Expense entry has debit={:.2}, credit={:.2} (expected debit=0, credit={:.2})",
                                debit, credit, txn_amount
                            ),
                            account_name: account_name.clone(),
                            category_name: cat_name,
                            memo: memo.clone(),
                        });
                    } else {
                        valid_count += 1;
                    }
                }
            }
            "TRANSFER" => {
                if entries.is_empty() {
                    missing_entries_count += 1;
                    issues.push(IntegrityIssue {
                        transaction_id: *txn_id,
                        transaction_type: txn_type.clone(),
                        transaction_date: txn_date.clone(),
                        transaction_amount: *txn_amount,
                        issue_type: "MISSING_ENTRIES".to_string(),
                        description: "Transfer transaction has no journal entries".to_string(),
                        account_name: account_name.clone(),
                        category_name: cat_name,
                        memo: memo.clone(),
                    });
                } else if entries.len() != 2 {
                    imbalanced_count += 1;
                    issues.push(IntegrityIssue {
                        transaction_id: *txn_id,
                        transaction_type: txn_type.clone(),
                        transaction_date: txn_date.clone(),
                        transaction_amount: *txn_amount,
                        issue_type: "WRONG_COUNT".to_string(),
                        description: format!(
                            "Transfer has {} journal entries (expected 2)",
                            entries.len()
                        ),
                        account_name: account_name.clone(),
                        category_name: cat_name,
                        memo: memo.clone(),
                    });
                } else {
                    // One entry should be a credit (source), one a debit (destination)
                    let total_debit: f64 = entries.iter().map(|(d, _, _)| d).sum();
                    let total_credit: f64 = entries.iter().map(|(_, c, _)| c).sum();

                    if (total_debit - txn_amount).abs() > 0.001
                        || (total_credit - txn_amount).abs() > 0.001
                        || (total_debit - total_credit).abs() > 0.001
                    {
                        imbalanced_count += 1;
                        issues.push(IntegrityIssue {
                            transaction_id: *txn_id,
                            transaction_type: txn_type.clone(),
                            transaction_date: txn_date.clone(),
                            transaction_amount: *txn_amount,
                            issue_type: "AMOUNT_MISMATCH".to_string(),
                            description: format!(
                                "Transfer debits={:.2}, credits={:.2} (expected both={:.2})",
                                total_debit, total_credit, txn_amount
                            ),
                            account_name: account_name.clone(),
                            category_name: cat_name,
                            memo: memo.clone(),
                        });
                    } else {
                        valid_count += 1;
                    }
                }
            }
            other => {
                imbalanced_count += 1;
                issues.push(IntegrityIssue {
                    transaction_id: *txn_id,
                    transaction_type: other.to_string(),
                    transaction_date: txn_date.clone(),
                    transaction_amount: *txn_amount,
                    issue_type: "UNKNOWN_TYPE".to_string(),
                    description: format!("Unknown transaction type: {}", other),
                    account_name: account_name.clone(),
                    category_name: cat_name,
                    memo: memo.clone(),
                });
            }
        }
    }

    // 2. Check for orphaned journal entries (entries with no matching transaction)
    let orphaned_entries_count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM journal_entries
             WHERE transaction_id NOT IN (SELECT id FROM transactions)",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(LedgerIntegrityResult {
        total_checked,
        valid_count,
        imbalanced_count,
        missing_entries_count,
        orphaned_entries_count,
        issues,
        checked_at: chrono::Utc::now().to_rfc3339(),
    })
}

// ======================== ORPHANED DATA CLEANUP ========================

/// Result of an orphaned data cleanup operation.
#[derive(Debug, Serialize)]
pub struct CleanupResult2 {
    pub success: bool,
    pub journal_entries_removed: i64,
    pub transaction_tags_removed: i64,
    pub transaction_photos_removed: i64,
    pub goal_contributions_removed: i64,
    pub total_removed: i64,
}

/// Remove orphaned records from child tables.
/// Operates within a single SQL transaction for atomicity.
/// This is a safety-net for edge cases (backup/restore, DB corruption).
#[tauri::command]
pub fn cleanup_orphaned_data(
    state: State<'_, AppState>,
) -> Result<CleanupResult2, String> {
    let pool = crate::get_db(&state)?;
    let mut conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let tx = conn
        .transaction()
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // 1. Journal entries referencing non-existent transactions
    let je_removed = tx
        .execute(
            "DELETE FROM journal_entries WHERE transaction_id NOT IN (SELECT id FROM transactions)",
            [],
        )
        .map_err(|e| format!("Failed to clean journal entries: {}", e))? as i64;

    // 2. Transaction tags referencing non-existent transactions or tags
    let tt_removed_txn = tx
        .execute(
            "DELETE FROM transaction_tags WHERE transaction_id NOT IN (SELECT id FROM transactions)",
            [],
        )
        .unwrap_or(0) as i64;

    let tt_removed_tag = tx
        .execute(
            "DELETE FROM transaction_tags WHERE tag_id NOT IN (SELECT id FROM tags)",
            [],
        )
        .unwrap_or(0) as i64;

    let tt_removed = tt_removed_txn + tt_removed_tag;

    // 3. Transaction photos referencing non-existent transactions
    let tp_removed = tx
        .execute(
            "DELETE FROM transaction_photos WHERE transaction_id NOT IN (SELECT id FROM transactions)",
            [],
        )
        .unwrap_or(0) as i64;

    // 4. Goal contributions referencing non-existent goals
    let gc_removed = tx
        .execute(
            "DELETE FROM goal_contributions WHERE goal_id NOT IN (SELECT id FROM savings_goals)",
            [],
        )
        .unwrap_or(0) as i64;

    tx.commit()
        .map_err(|e| format!("Failed to commit cleanup: {}", e))?;

    let total_removed = je_removed + tt_removed + tp_removed + gc_removed;

    Ok(CleanupResult2 {
        success: true,
        journal_entries_removed: je_removed,
        transaction_tags_removed: tt_removed,
        transaction_photos_removed: tp_removed,
        goal_contributions_removed: gc_removed,
        total_removed,
    })
}