// File: src-tauri/src/commands/settings.rs
use sqlx::{Row, SqlitePool};
use tauri::State;

// ======================== RESTORE FROM BACKUP ========================

/// Restore the entire database from a JSON backup file content.
/// This will DELETE all existing data and replace it with the backup data.
/// The backup format matches what `export_full_backup` produces.
#[tauri::command]
pub async fn restore_from_backup(
    pool: State<'_, SqlitePool>,
    backup_json: String,
) -> Result<RestoreResult, String> {
    // 1. Parse and validate backup JSON
    let backup: serde_json::Value = serde_json::from_str(&backup_json)
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

    // 2. Begin transaction for atomic restore
    let mut tx = pool
        .inner()
        .begin()
        .await
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // 3. Disable foreign keys temporarily for clean deletion
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to disable foreign keys: {}", e))?;

    // 4. Clear all user data tables (order matters for foreign keys)
    let tables_to_clear = [
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
        match sqlx::query(&query).execute(&mut *tx).await {
            Ok(_) => {}
            Err(e) => {
                println!("Warning: Could not clear table {}: {}", table, e);
            }
        }
    }

    // 5. Reset SQLite autoincrement counters
    for table in &tables_to_clear {
        let query = format!(
            "DELETE FROM sqlite_sequence WHERE name = '{}'",
            table
        );
        let _ = sqlx::query(&query).execute(&mut *tx).await;
    }

    // 6. Re-enable foreign keys
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to re-enable foreign keys: {}", e))?;

    // ============================================================
    // 7. Restore accounts & build old_id → new_id map
    // ============================================================
    let mut account_id_map: std::collections::HashMap<i64, i64> =
        std::collections::HashMap::new();
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

        let result = sqlx::query(
            "INSERT INTO accounts (group_id, name, initial_balance, currency, created_at) VALUES (?, ?, ?, ?, ?)"
        )
        .bind(group_id)
        .bind(name)
        .bind(initial_balance)
        .bind(currency)
        .bind(created_at)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to restore account '{}': {}", name, e))?;

        let new_id = result.last_insert_rowid();
        account_id_map.insert(old_id, new_id);
        accounts_restored += 1;
    }

    // ============================================================
    // 8. Restore categories & build old_id → new_id map
    //    Two passes: parents first, then children
    // ============================================================
    let mut category_id_map: std::collections::HashMap<i64, i64> =
        std::collections::HashMap::new();
    let mut categories_restored: i64 = 0;

    // First pass: parent categories (no parent_id)
    for category in categories {
        let parent_id = category.get("parent_id").and_then(|v| v.as_i64());
        if parent_id.is_some() {
            continue; // Skip children in first pass
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

        let result =
            sqlx::query("INSERT INTO categories (name, type) VALUES (?, ?)")
                .bind(name)
                .bind(cat_type)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to restore category '{}': {}", name, e))?;

        category_id_map.insert(old_id, result.last_insert_rowid());
        categories_restored += 1;
    }

    // Second pass: child categories (have parent_id)
    for category in categories {
        let old_parent_id = match category.get("parent_id").and_then(|v| v.as_i64()) {
            Some(pid) => pid,
            None => continue, // Skip parents (already inserted)
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

        // Map old parent_id to new parent_id
        let new_parent_id = category_id_map
            .get(&old_parent_id)
            .copied()
            .unwrap_or(old_parent_id);

        let result = sqlx::query(
            "INSERT INTO categories (parent_id, name, type) VALUES (?, ?, ?)",
        )
        .bind(new_parent_id)
        .bind(name)
        .bind(cat_type)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to restore child category '{}': {}", name, e))?;

        category_id_map.insert(old_id, result.last_insert_rowid());
        categories_restored += 1;
    }

    // ============================================================
    // 9. Restore transactions and journal entries
    //
    //    The export format uses TransactionWithDetails with
    //    #[serde(flatten)], so transaction fields are at top level.
    //    We also check for a nested "transaction" key for safety.
    //
    //    Journal entries match create_transaction exactly:
    //      INCOME  → 1 entry: debit account (increase asset)
    //      EXPENSE → 1 entry: credit account (decrease asset)
    //      TRANSFER→ 2 entries: credit source, debit destination
    //
    //    CRITICAL: journal_entries.account_id references accounts(id).
    //    Only account IDs go here — NEVER category IDs.
    // ============================================================
    let mut transactions_restored: i64 = 0;

    for txn in transactions {
        // Handle both flat and nested export format
        let txn_data = txn.get("transaction").unwrap_or(txn);

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

        // Map old IDs to new IDs
        let new_account_id = account_id_map
            .get(&old_account_id)
            .copied()
            .ok_or_else(|| {
                format!(
                    "Account ID {} not found in backup (transaction date: {})",
                    old_account_id, date
                )
            })?;

        let new_to_account_id = match old_to_account_id {
            Some(id) => Some(
                account_id_map
                    .get(&id)
                    .copied()
                    .unwrap_or(id),
            ),
            None => None,
        };

        let new_category_id = match old_category_id {
            Some(id) => Some(
                category_id_map
                    .get(&id)
                    .copied()
                    .unwrap_or(id),
            ),
            None => None,
        };

        // Insert the transaction
        let result = sqlx::query(
            r#"INSERT INTO transactions (date, type, amount, account_id, to_account_id, category_id, memo, photo_path)
               VALUES (?, ?, ?, ?, ?, ?, ?, ?)"#,
        )
        .bind(date)
        .bind(txn_type)
        .bind(amount)
        .bind(new_account_id)
        .bind(new_to_account_id)
        .bind(new_category_id)
        .bind(memo)
        .bind(photo_path)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to restore transaction (date: {}): {}", date, e))?;

        let new_txn_id = result.last_insert_rowid();

        // Create journal entries — ONLY using account IDs
        match txn_type {
            "INCOME" => {
                // Debit the account (increase asset)
                sqlx::query(
                    "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, 0)",
                )
                .bind(new_txn_id)
                .bind(new_account_id)
                .bind(amount)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to create journal entry for INCOME txn {}: {}", new_txn_id, e))?;
            }
            "EXPENSE" => {
                // Credit the account (decrease asset)
                sqlx::query(
                    "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, 0, ?)",
                )
                .bind(new_txn_id)
                .bind(new_account_id)
                .bind(amount)
                .execute(&mut *tx)
                .await
                .map_err(|e| format!("Failed to create journal entry for EXPENSE txn {}: {}", new_txn_id, e))?;
            }
            "TRANSFER" => {
                if let Some(to_acc_id) = new_to_account_id {
                    // Credit source account (decrease)
                    sqlx::query(
                        "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, 0, ?)",
                    )
                    .bind(new_txn_id)
                    .bind(new_account_id)
                    .bind(amount)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| format!("Failed to create journal entry for TRANSFER source txn {}: {}", new_txn_id, e))?;

                    // Debit destination account (increase)
                    sqlx::query(
                        "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, 0)",
                    )
                    .bind(new_txn_id)
                    .bind(to_acc_id)
                    .bind(amount)
                    .execute(&mut *tx)
                    .await
                    .map_err(|e| format!("Failed to create journal entry for TRANSFER dest txn {}: {}", new_txn_id, e))?;
                }
            }
            _ => {
                println!(
                    "Warning: Unknown transaction type '{}', skipping journal entries",
                    txn_type
                );
            }
        }

        transactions_restored += 1;
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

        sqlx::query(
            "INSERT INTO budgets (category_id, amount, period, start_date) VALUES (?, ?, ?, ?)",
        )
        .bind(new_category_id)
        .bind(amount)
        .bind(period)
        .bind(start_date)
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to restore budget: {}", e))?;

        budgets_restored += 1;
    }

    // 11. Commit the transaction
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit restore: {}", e))?;

    Ok(RestoreResult {
        success: true,
        accounts_restored,
        categories_restored,
        transactions_restored,
        budgets_restored,
    })
}

// ======================== CLEAR ALL DATA ========================

/// Delete ALL user data from the database.
/// Keeps the schema and account_groups (seed data) intact.
#[tauri::command]
pub async fn clear_all_data(pool: State<'_, SqlitePool>) -> Result<ClearResult, String> {
    let mut tx = pool
        .inner()
        .begin()
        .await
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    // Disable foreign keys for clean cascading deletion
    sqlx::query("PRAGMA foreign_keys = OFF")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to disable foreign keys: {}", e))?;

    // Count records before deletion for the result summary
    let counts = count_all_records(&mut tx).await?;

    // Delete in dependency order (children first)
    let tables_to_clear = [
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
        match sqlx::query(&query).execute(&mut *tx).await {
            Ok(_) => {}
            Err(e) => {
                println!("Warning: Could not clear table {}: {}", table, e);
            }
        }
    }

    // Reset autoincrement counters
    for table in &tables_to_clear {
        let query = format!(
            "DELETE FROM sqlite_sequence WHERE name = '{}'",
            table
        );
        let _ = sqlx::query(&query).execute(&mut *tx).await;
    }

    // Re-enable foreign keys
    sqlx::query("PRAGMA foreign_keys = ON")
        .execute(&mut *tx)
        .await
        .map_err(|e| format!("Failed to re-enable foreign keys: {}", e))?;

    tx.commit()
        .await
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
async fn count_all_records(
    tx: &mut sqlx::Transaction<'_, sqlx::Sqlite>,
) -> Result<(i64, i64, i64, i64), String> {
    let accounts: i64 = sqlx::query("SELECT COUNT(*) as c FROM accounts")
        .fetch_one(&mut **tx)
        .await
        .map(|r| r.get("c"))
        .unwrap_or(0);

    let categories: i64 = sqlx::query("SELECT COUNT(*) as c FROM categories")
        .fetch_one(&mut **tx)
        .await
        .map(|r| r.get("c"))
        .unwrap_or(0);

    let transactions: i64 = sqlx::query("SELECT COUNT(*) as c FROM transactions")
        .fetch_one(&mut **tx)
        .await
        .map(|r| r.get("c"))
        .unwrap_or(0);

    let budgets: i64 = sqlx::query("SELECT COUNT(*) as c FROM budgets")
        .fetch_one(&mut **tx)
        .await
        .map(|r| r.get("c"))
        .unwrap_or(0);

    Ok((accounts, categories, transactions, budgets))
}

// ======================== RESPONSE TYPES ========================

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct RestoreResult {
    pub success: bool,
    pub accounts_restored: i64,
    pub categories_restored: i64,
    pub transactions_restored: i64,
    pub budgets_restored: i64,
}

#[derive(Debug, Serialize)]
pub struct ClearResult {
    pub success: bool,
    pub accounts_deleted: i64,
    pub categories_deleted: i64,
    pub transactions_deleted: i64,
    pub budgets_deleted: i64,
}