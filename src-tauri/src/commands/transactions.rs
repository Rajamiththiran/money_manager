// File: src-tauri/src/commands/transactions.rs
use crate::models::tag::TagInfo;
use crate::models::transactions::{
    CategorySpending, CreateTransactionInput, DailySummary, IncomeExpenseSummary, MonthlyTrend,
    Transaction, TransactionFilter, TransactionWithDetails, UpdateTransactionInput,
};
use crate::AppState;
use rusqlite::params;
use tauri::State;

/// Load tags for a batch of transaction IDs. Returns a Vec of (transaction_id, TagInfo) pairs.
fn load_tags_for_transactions(
    conn: &rusqlite::Connection,
    transaction_ids: &[i64],
) -> Result<Vec<(i64, TagInfo)>, String> {
    if transaction_ids.is_empty() {
        return Ok(Vec::new());
    }

    let placeholders: Vec<String> = transaction_ids.iter().map(|_| "?".to_string()).collect();
    let query_str = format!(
        "SELECT tt.transaction_id, tg.id, tg.name, tg.color
         FROM transaction_tags tt
         INNER JOIN tags tg ON tt.tag_id = tg.id
         WHERE tt.transaction_id IN ({})
         ORDER BY tg.name ASC",
        placeholders.join(", ")
    );

    let mut stmt = conn
        .prepare(&query_str)
        .map_err(|e| format!("Failed to prepare query: {}", e))?;

    let params_iter = rusqlite::params_from_iter(transaction_ids.iter());

    let rows = stmt
        .query_map(params_iter, |row| {
            Ok((
                row.get::<_, i64>(0)?,
                TagInfo {
                    id: row.get(1)?,
                    name: row.get(2)?,
                    color: row.get(3)?,
                },
            ))
        })
        .map_err(|e| format!("Failed to load tags: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Failed to read tags: {}", e))?;

    Ok(rows)
}

/// Insert tag associations for a transaction
fn insert_transaction_tags(
    conn: &rusqlite::Connection,
    transaction_id: i64,
    tag_ids: &[i64],
) -> Result<(), String> {
    for tag_id in tag_ids {
        conn.execute(
            "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?1, ?2)",
            params![transaction_id, tag_id],
        )
        .map_err(|e| format!("Failed to associate tag: {}", e))?;
    }
    Ok(())
}

#[tauri::command]
pub fn get_transactions(state: State<'_, AppState>) -> Result<Vec<Transaction>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, date, type, amount, account_id, to_account_id, category_id, memo, photo_path, created_at 
         FROM transactions 
         ORDER BY date DESC, created_at DESC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let transactions = stmt
        .query_map([], |row| {
            Ok(Transaction {
                id: row.get(0)?,
                date: row.get(1)?,
                transaction_type: row.get(2)?,
                amount: row.get(3)?,
                account_id: row.get(4)?,
                to_account_id: row.get(5)?,
                category_id: row.get(6)?,
                memo: row.get(7)?,
                photo_path: row.get(8)?,
                created_at: row.get(9)?,
            })
        })
        .map_err(|e| format!("Execution error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(transactions)
}

#[tauri::command]
pub fn get_transactions_with_details(
    state: State<'_, AppState>,
) -> Result<Vec<TransactionWithDetails>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT 
            t.id, t.date, t.type, t.amount, t.account_id, t.to_account_id, 
            t.category_id, t.memo, t.photo_path, t.created_at,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name,
            (SELECT COUNT(*) FROM transaction_photos tp WHERE tp.transaction_id = t.id) as photo_count
         FROM transactions t
         INNER JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts ta ON t.to_account_id = ta.id
         LEFT JOIN categories c ON t.category_id = c.id
         ORDER BY t.date DESC, t.created_at DESC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let results: Vec<TransactionWithDetails> = stmt
        .query_map([], |row| {
            Ok(TransactionWithDetails {
                transaction: Transaction {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    transaction_type: row.get(2)?,
                    amount: row.get(3)?,
                    account_id: row.get(4)?,
                    to_account_id: row.get(5)?,
                    category_id: row.get(6)?,
                    memo: row.get(7)?,
                    photo_path: row.get(8)?,
                    created_at: row.get(9)?,
                },
                account_name: row.get(10)?,
                to_account_name: row.get(11)?,
                category_name: row.get(12)?,
                photo_count: row.get(13)?,
                tags: Vec::new(),
            })
        })
        .map_err(|e| format!("Execution error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    attach_tags(&conn, results)
}

// Helper to attach tags to a list of TransactionWithDetails
fn attach_tags(
    conn: &rusqlite::Connection,
    mut results: Vec<TransactionWithDetails>,
) -> Result<Vec<TransactionWithDetails>, String> {
    let ids: Vec<i64> = results.iter().map(|r| r.transaction.id).collect();
    let tag_pairs = load_tags_for_transactions(conn, &ids)?;
    for twd in &mut results {
        twd.tags = tag_pairs
            .iter()
            .filter(|(tid, _)| *tid == twd.transaction.id)
            .map(|(_, tag)| tag.clone())
            .collect();
    }
    Ok(results)
}

#[tauri::command]
pub fn create_transaction(
    state: State<'_, AppState>,
    input: CreateTransactionInput,
) -> Result<i64, String> {
    let pool = crate::get_db(&state)?;
    let mut conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Validate transaction type
    if input.transaction_type != "INCOME"
        && input.transaction_type != "EXPENSE"
        && input.transaction_type != "TRANSFER"
    {
        return Err("Invalid transaction type".to_string());
    }

    if input.amount <= 0.0 {
        return Err("Amount must be greater than zero".to_string());
    }

    // Validate account exists
    let acct_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE id = ?1",
            params![input.account_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    if !acct_exists {
        return Err("Account does not exist".to_string());
    }

    // Validate transfer requirements
    if input.transaction_type == "TRANSFER" {
        let to_account_id = input.to_account_id.ok_or("Transfer requires to_account_id")?;
        if to_account_id == input.account_id {
            return Err("Cannot transfer to the same account".to_string());
        }
        let to_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM accounts WHERE id = ?1",
                params![to_account_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;
        if !to_exists {
            return Err("Destination account does not exist".to_string());
        }
    }

    if let Some(category_id) = input.category_id {
        let cat_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM categories WHERE id = ?1",
                params![category_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;
        if !cat_exists {
            return Err("Category does not exist".to_string());
        }
    }

    // Start transaction
    let tx = conn
        .transaction()
        .map_err(|e| format!("Transaction error: {}", e))?;

    // Insert transaction record
    tx.execute(
        "INSERT INTO transactions (date, type, amount, account_id, to_account_id, category_id, memo) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            input.date,
            input.transaction_type,
            input.amount,
            input.account_id,
            input.to_account_id,
            input.category_id,
            input.memo
        ],
    )
    .map_err(|e| format!("Failed to create transaction: {}", e))?;

    let transaction_id = tx.last_insert_rowid();

    // Create journal entries
    match input.transaction_type.as_str() {
        "INCOME" => {
            tx.execute(
                "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) 
                 VALUES (?1, ?2, ?3, 0)",
                params![transaction_id, input.account_id, input.amount],
            )
            .map_err(|e| format!("Failed to create journal entry: {}", e))?;
        }
        "EXPENSE" => {
            tx.execute(
                "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) 
                 VALUES (?1, ?2, 0, ?3)",
                params![transaction_id, input.account_id, input.amount],
            )
            .map_err(|e| format!("Failed to create journal entry: {}", e))?;
        }
        "TRANSFER" => {
            let to_account_id = input.to_account_id.unwrap();
            tx.execute(
                "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) 
                 VALUES (?1, ?2, 0, ?3)",
                params![transaction_id, input.account_id, input.amount],
            )
            .map_err(|e| format!("Failed to create journal entry: {}", e))?;

            tx.execute(
                "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) 
                 VALUES (?1, ?2, ?3, 0)",
                params![transaction_id, to_account_id, input.amount],
            )
            .map_err(|e| format!("Failed to create journal entry: {}", e))?;
        }
        _ => return Err("Invalid transaction type".to_string()),
    }

    // Insert tags
    if let Some(tag_ids) = &input.tag_ids {
        if !tag_ids.is_empty() {
            for tag_id in tag_ids {
                tx.execute(
                    "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?1, ?2)",
                    params![transaction_id, tag_id],
                )
                .map_err(|e| format!("Failed to associate tag: {}", e))?;
            }
        }
    }

    tx.commit()
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(transaction_id)
}

#[tauri::command]
pub fn update_transaction(
    state: State<'_, AppState>,
    input: UpdateTransactionInput,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let mut conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM transactions WHERE id = ?1",
            params![input.id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    if !exists {
        return Err("Transaction not found".to_string());
    }

    let mut updates = Vec::new();

    if let Some(date) = &input.date {
        updates.push(format!("date = '{}'", date));
    }

    if let Some(category_id) = input.category_id {
        updates.push(format!("category_id = {}", category_id));
    }

    if let Some(memo) = &input.memo {
        updates.push(format!("memo = '{}'", memo.replace('\'', "''")));
    }

    if updates.is_empty() && input.tag_ids.is_none() {
        return Err("No fields to update".to_string());
    }

    let tx = conn.transaction().map_err(|e| format!("Transaction error: {}", e))?;

    if !updates.is_empty() {
        let query = format!(
            "UPDATE transactions SET {} WHERE id = {}",
            updates.join(", "),
            input.id
        );
        tx.execute(&query, [])
            .map_err(|e| format!("Failed to update transaction: {}", e))?;
    }

    // Replace tags if provided
    if let Some(tag_ids) = &input.tag_ids {
        tx.execute("DELETE FROM transaction_tags WHERE transaction_id = ?1", params![input.id])
            .map_err(|e| format!("Failed to clear old tags: {}", e))?;
        if !tag_ids.is_empty() {
            for tag_id in tag_ids {
                tx.execute(
                    "INSERT OR IGNORE INTO transaction_tags (transaction_id, tag_id) VALUES (?1, ?2)",
                    params![input.id, tag_id],
                )
                .map_err(|e| format!("Failed to associate tag: {}", e))?;
            }
        }
    }

    tx.commit().map_err(|e| format!("Failed to commit update: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_transaction(state: State<'_, AppState>, transaction_id: i64) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    conn.execute(
        "DELETE FROM transactions WHERE id = ?1",
        params![transaction_id],
    )
    .map_err(|e| format!("Failed to delete transaction: {}", e))?;

    Ok(())
}

// ==================== PHASE 2: FILTERING & ANALYTICS ====================

#[tauri::command]
pub fn get_transactions_filtered(
    state: State<'_, AppState>,
    filter: TransactionFilter,
) -> Result<Vec<TransactionWithDetails>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut query = String::from(
        "SELECT 
            t.id, t.date, t.type, t.amount, t.account_id, t.to_account_id, 
            t.category_id, t.memo, t.photo_path, t.created_at,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name,
            (SELECT COUNT(*) FROM transaction_photos tp WHERE tp.transaction_id = t.id) as photo_count
         FROM transactions t
         INNER JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts ta ON t.to_account_id = ta.id
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE 1=1",
    );

    if let Some(start_date) = &filter.start_date {
        query.push_str(&format!(" AND t.date >= '{}'", start_date));
    }
    if let Some(end_date) = &filter.end_date {
        query.push_str(&format!(" AND t.date <= '{}'", end_date));
    }

    if let Some(txn_type) = &filter.transaction_type {
        query.push_str(&format!(" AND t.type = '{}'", txn_type));
    }

    if let Some(account_id) = filter.account_id {
        query.push_str(&format!(
            " AND (t.account_id = {} OR t.to_account_id = {})",
            account_id, account_id
        ));
    }

    if let Some(category_id) = filter.category_id {
        if filter.include_subcategories.unwrap_or(false) {
            query.push_str(&format!(
                " AND t.category_id IN (
                    SELECT id FROM categories WHERE id = {} OR parent_id = {}
                )",
                category_id, category_id
            ));
        } else {
            query.push_str(&format!(" AND t.category_id = {}", category_id));
        }
    }

    if let Some(search) = &filter.search_query {
        let escaped_search = search.replace('\'', "''");
        query.push_str(&format!(
            " AND (t.memo LIKE '%{}%' OR CAST(t.amount AS TEXT) LIKE '%{}%')",
            escaped_search, escaped_search
        ));
    }

    if let Some(tag_ids) = &filter.tag_ids {
        if !tag_ids.is_empty() {
            let id_list: Vec<String> = tag_ids.iter().map(|id| id.to_string()).collect();
            query.push_str(&format!(
                " AND t.id IN (SELECT transaction_id FROM transaction_tags WHERE tag_id IN ({}))",
                id_list.join(", ")
            ));
        }
    }

    query.push_str(" ORDER BY t.date DESC, t.created_at DESC");

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Query error: {}", e))?;

    let results: Vec<TransactionWithDetails> = stmt
        .query_map([], |row| {
            Ok(TransactionWithDetails {
                transaction: Transaction {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    transaction_type: row.get(2)?,
                    amount: row.get(3)?,
                    account_id: row.get(4)?,
                    to_account_id: row.get(5)?,
                    category_id: row.get(6)?,
                    memo: row.get(7)?,
                    photo_path: row.get(8)?,
                    created_at: row.get(9)?,
                },
                account_name: row.get(10)?,
                to_account_name: row.get(11)?,
                category_name: row.get(12)?,
                photo_count: row.get(13)?,
                tags: Vec::new(),
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    attach_tags(&conn, results)
}

#[tauri::command]
pub fn get_income_expense_summary(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
) -> Result<IncomeExpenseSummary, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let (total_income, total_expense, transaction_count): (f64, f64, i64) = conn
        .query_row(
            "SELECT 
                CAST(COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS REAL) as total_income,
                CAST(COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS REAL) as total_expense,
                COUNT(*) as transaction_count
             FROM transactions
             WHERE date >= ?1 AND date <= ?2",
            params![start_date, end_date],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .map_err(|e| format!("Failed to calculate summary: {}", e))?;

    Ok(IncomeExpenseSummary {
        total_income,
        total_expense,
        net_savings: total_income - total_expense,
        transaction_count,
        start_date,
        end_date,
    })
}

#[tauri::command]
pub fn get_category_spending(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
    transaction_type: String,
) -> Result<Vec<CategorySpending>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT 
                COALESCE(c.parent_id, c.id) as category_id,
                COALESCE(pc.name, c.name) as category_name,
                CAST(SUM(t.amount) AS REAL) as total_amount,
                COUNT(*) as transaction_count
             FROM transactions t
             INNER JOIN categories c ON t.category_id = c.id
             LEFT JOIN categories pc ON c.parent_id = pc.id
             WHERE t.date >= ?1 AND t.date <= ?2 AND t.type = ?3
             GROUP BY COALESCE(c.parent_id, c.id)
             ORDER BY total_amount DESC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let rows: Vec<(Option<i64>, Option<String>, f64, i64)> = stmt
        .query_map(params![start_date, end_date, transaction_type], |row| {
            Ok((
                row.get(0)?,
                row.get(1)?,
                row.get(2)?,
                row.get(3)?,
            ))
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    let total: f64 = rows.iter().map(|r| r.2).sum();

    Ok(rows
        .into_iter()
        .map(|(cat_id, cat_name, amount, count)| CategorySpending {
            category_id: cat_id.unwrap_or(0),
            category_name: cat_name.unwrap_or_default(),
            total_amount: amount,
            transaction_count: count,
            percentage: if total > 0.0 {
                (amount / total) * 100.0
            } else {
                0.0
            },
        })
        .collect())
}

#[tauri::command]
pub fn get_daily_summary(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
) -> Result<Vec<DailySummary>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT 
                date,
                CAST(COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS REAL) as total_income,
                CAST(COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS REAL) as total_expense,
                COUNT(*) as transaction_count
             FROM transactions
             WHERE date >= ?1 AND date <= ?2
             GROUP BY date
             ORDER BY date DESC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let summaries = stmt
        .query_map(params![start_date, end_date], |row| {
            let income: f64 = row.get(1)?;
            let expense: f64 = row.get(2)?;
            Ok(DailySummary {
                date: row.get(0)?,
                total_income: income,
                total_expense: expense,
                net: income - expense,
                transaction_count: row.get(3)?,
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(summaries)
}

#[tauri::command]
pub fn search_transactions(
    state: State<'_, AppState>,
    query: String,
) -> Result<Vec<TransactionWithDetails>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let escaped_query = query.replace('\'', "''");

    let mut stmt = conn
        .prepare(
            "SELECT 
                t.id, t.date, t.type, t.amount, t.account_id, t.to_account_id, 
                t.category_id, t.memo, t.photo_path, t.created_at,
                a.name as account_name,
                ta.name as to_account_name,
                c.name as category_name,
                (SELECT COUNT(*) FROM transaction_photos tp WHERE tp.transaction_id = t.id) as photo_count
             FROM transactions t
             INNER JOIN accounts a ON t.account_id = a.id
             LEFT JOIN accounts ta ON t.to_account_id = ta.id
             LEFT JOIN categories c ON t.category_id = c.id
             WHERE t.memo LIKE ?1 OR CAST(t.amount AS TEXT) LIKE ?2
             ORDER BY t.date DESC, t.created_at DESC
             LIMIT 100",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let search_term = format!("%{}%", escaped_query);
    let results: Vec<TransactionWithDetails> = stmt
        .query_map(params![search_term, search_term], |row| {
            Ok(TransactionWithDetails {
                transaction: Transaction {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    transaction_type: row.get(2)?,
                    amount: row.get(3)?,
                    account_id: row.get(4)?,
                    to_account_id: row.get(5)?,
                    category_id: row.get(6)?,
                    memo: row.get(7)?,
                    photo_path: row.get(8)?,
                    created_at: row.get(9)?,
                },
                account_name: row.get(10)?,
                to_account_name: row.get(11)?,
                category_name: row.get(12)?,
                photo_count: row.get(13)?,
                tags: Vec::new(),
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    attach_tags(&conn, results)
}

#[tauri::command]
pub fn get_monthly_trends(
    state: State<'_, AppState>,
    months: i32,
) -> Result<Vec<MonthlyTrend>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT 
                strftime('%Y-%m', date) as month,
                CAST(COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS REAL) as income,
                CAST(COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS REAL) as expense,
                COUNT(*) as transaction_count
             FROM transactions
             WHERE date >= date('now', ?1 || ' months')
             GROUP BY strftime('%Y-%m', date)
             ORDER BY month ASC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let limit_str = format!("-{}", months);
    let trends = stmt
        .query_map(params![limit_str], |row| {
            let month: String = row.get(0)?;
            let income: f64 = row.get(1)?;
            let expense: f64 = row.get(2)?;

            // Parse month for display name
            let parts: Vec<&str> = month.split('-').collect();
            let month_name = if parts.len() == 2 {
                let month_num: u32 = parts[1].parse().unwrap_or(1);
                let month_names = [
                    "January", "February", "March", "April", "May", "June",
                    "July", "August", "September", "October", "November", "December",
                ];
                format!(
                    "{} {}",
                    month_names
                        .get((month_num - 1) as usize)
                        .unwrap_or(&"Unknown"),
                    parts[0]
                )
            } else {
                month.clone()
            };

            Ok(MonthlyTrend {
                month,
                month_name,
                income,
                expense,
                net: income - expense,
                transaction_count: row.get(3)?,
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(trends)
}
