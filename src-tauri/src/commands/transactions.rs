// File: src-tauri/src/commands/transactions.rs
use crate::models::transactions::{
    CategorySpending, CreateTransactionInput, DailySummary, IncomeExpenseSummary, MonthlyTrend,
    Transaction, TransactionFilter, TransactionWithDetails, UpdateTransactionInput,
};
use sqlx::{Row, SqlitePool};
use tauri::State;

#[tauri::command]
pub async fn get_transactions(pool: State<'_, SqlitePool>) -> Result<Vec<Transaction>, String> {
    let rows = sqlx::query(
        "SELECT id, date, type, amount, account_id, to_account_id, category_id, memo, photo_path, created_at 
         FROM transactions 
         ORDER BY date DESC, created_at DESC"
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| Transaction {
            id: row.get("id"),
            date: row.get("date"),
            transaction_type: row.get("type"),
            amount: row.get("amount"),
            account_id: row.get("account_id"),
            to_account_id: row.get("to_account_id"),
            category_id: row.get("category_id"),
            memo: row.get("memo"),
            photo_path: row.get("photo_path"),
            created_at: row.get("created_at"),
        })
        .collect())
}

#[tauri::command]
pub async fn get_transactions_with_details(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<TransactionWithDetails>, String> {
    let rows = sqlx::query(
        "SELECT 
            t.id, t.date, t.type, t.amount, t.account_id, t.to_account_id, 
            t.category_id, t.memo, t.photo_path, t.created_at,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name
         FROM transactions t
         INNER JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts ta ON t.to_account_id = ta.id
         LEFT JOIN categories c ON t.category_id = c.id
         ORDER BY t.date DESC, t.created_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| TransactionWithDetails {
            transaction: Transaction {
                id: row.get("id"),
                date: row.get("date"),
                transaction_type: row.get("type"),
                amount: row.get("amount"),
                account_id: row.get("account_id"),
                to_account_id: row.get("to_account_id"),
                category_id: row.get("category_id"),
                memo: row.get("memo"),
                photo_path: row.get("photo_path"),
                created_at: row.get("created_at"),
            },
            account_name: row.get("account_name"),
            to_account_name: row.get("to_account_name"),
            category_name: row.get("category_name"),
        })
        .collect())
}

#[tauri::command]
pub async fn create_transaction(
    pool: State<'_, SqlitePool>,
    input: CreateTransactionInput,
) -> Result<i64, String> {
    // Validate transaction type
    if input.transaction_type != "INCOME"
        && input.transaction_type != "EXPENSE"
        && input.transaction_type != "TRANSFER"
    {
        return Err("Invalid transaction type".to_string());
    }

    // Validate amount
    if input.amount <= 0.0 {
        return Err("Amount must be greater than zero".to_string());
    }

    // Validate account exists
    let account_exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
        .bind(input.account_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !account_exists {
        return Err("Account does not exist".to_string());
    }

    // Validate transfer requirements
    if input.transaction_type == "TRANSFER" {
        if input.to_account_id.is_none() {
            return Err("Transfer requires to_account_id".to_string());
        }

        let to_account_id = input.to_account_id.unwrap();
        if to_account_id == input.account_id {
            return Err("Cannot transfer to the same account".to_string());
        }

        let to_account_exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
            .bind(to_account_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();

        if !to_account_exists {
            return Err("Destination account does not exist".to_string());
        }
    }

    // Validate category exists if provided
    if let Some(category_id) = input.category_id {
        let category_exists = sqlx::query("SELECT id FROM categories WHERE id = ?")
            .bind(category_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();

        if !category_exists {
            return Err("Category does not exist".to_string());
        }
    }

    // Start transaction
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Transaction error: {}", e))?;

    // Insert transaction record
    let result = sqlx::query(
        "INSERT INTO transactions (date, type, amount, account_id, to_account_id, category_id, memo) 
         VALUES (?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&input.date)
    .bind(&input.transaction_type)
    .bind(input.amount)
    .bind(input.account_id)
    .bind(input.to_account_id)
    .bind(input.category_id)
    .bind(&input.memo)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to create transaction: {}", e))?;

    let transaction_id = result.last_insert_rowid();

    // Create journal entries based on transaction type
    match input.transaction_type.as_str() {
        "INCOME" => {
            // Debit: Account (increase asset)
            sqlx::query(
                "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) 
                 VALUES (?, ?, ?, 0)",
            )
            .bind(transaction_id)
            .bind(input.account_id)
            .bind(input.amount)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to create journal entry: {}", e))?;
        }
        "EXPENSE" => {
            // Credit: Account (decrease asset)
            sqlx::query(
                "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) 
                 VALUES (?, ?, 0, ?)",
            )
            .bind(transaction_id)
            .bind(input.account_id)
            .bind(input.amount)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to create journal entry: {}", e))?;
        }
        "TRANSFER" => {
            let to_account_id = input.to_account_id.unwrap();

            // Credit: From Account (decrease)
            sqlx::query(
                "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) 
                 VALUES (?, ?, 0, ?)",
            )
            .bind(transaction_id)
            .bind(input.account_id)
            .bind(input.amount)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to create journal entry: {}", e))?;

            // Debit: To Account (increase)
            sqlx::query(
                "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) 
                 VALUES (?, ?, ?, 0)",
            )
            .bind(transaction_id)
            .bind(to_account_id)
            .bind(input.amount)
            .execute(&mut *tx)
            .await
            .map_err(|e| format!("Failed to create journal entry: {}", e))?;
        }
        _ => return Err("Invalid transaction type".to_string()),
    }

    // Commit transaction
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit transaction: {}", e))?;

    Ok(transaction_id)
}

#[tauri::command]
pub async fn update_transaction(
    pool: State<'_, SqlitePool>,
    input: UpdateTransactionInput,
) -> Result<(), String> {
    // Check if transaction exists
    let exists = sqlx::query("SELECT id FROM transactions WHERE id = ?")
        .bind(input.id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !exists {
        return Err("Transaction not found".to_string());
    }

    // Build dynamic update - only non-journal fields can be updated
    // Changing amount/type requires deleting and recreating
    let mut updates = Vec::new();
    let mut has_updates = false;

    if let Some(date) = &input.date {
        updates.push(format!("date = '{}'", date));
        has_updates = true;
    }

    if let Some(category_id) = input.category_id {
        updates.push(format!("category_id = {}", category_id));
        has_updates = true;
    }

    if let Some(memo) = &input.memo {
        updates.push(format!("memo = '{}'", memo.replace("'", "''")));
        has_updates = true;
    }

    if !has_updates {
        return Err("No fields to update".to_string());
    }

    let query = format!(
        "UPDATE transactions SET {} WHERE id = {}",
        updates.join(", "),
        input.id
    );

    sqlx::query(&query)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update transaction: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_transaction(
    pool: State<'_, SqlitePool>,
    transaction_id: i64,
) -> Result<(), String> {
    // Journal entries will be deleted automatically due to ON DELETE CASCADE
    sqlx::query("DELETE FROM transactions WHERE id = ?")
        .bind(transaction_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete transaction: {}", e))?;

    Ok(())
}

// ==================== PHASE 2: FILTERING & ANALYTICS ====================

#[tauri::command]
pub async fn get_transactions_filtered(
    pool: State<'_, SqlitePool>,
    filter: TransactionFilter,
) -> Result<Vec<TransactionWithDetails>, String> {
    let mut query = String::from(
        "SELECT 
            t.id, t.date, t.type, t.amount, t.account_id, t.to_account_id, 
            t.category_id, t.memo, t.photo_path, t.created_at,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name
         FROM transactions t
         INNER JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts ta ON t.to_account_id = ta.id
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE 1=1",
    );

    // Date range filter
    if let Some(start_date) = &filter.start_date {
        query.push_str(&format!(" AND t.date >= '{}'", start_date));
    }
    if let Some(end_date) = &filter.end_date {
        query.push_str(&format!(" AND t.date <= '{}'", end_date));
    }

    // Transaction type filter
    if let Some(txn_type) = &filter.transaction_type {
        query.push_str(&format!(" AND t.type = '{}'", txn_type));
    }

    // Account filter
    if let Some(account_id) = filter.account_id {
        query.push_str(&format!(
            " AND (t.account_id = {} OR t.to_account_id = {})",
            account_id, account_id
        ));
    }

    // Category filter (with optional children)
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

    // Search filter
    if let Some(search) = &filter.search_query {
        let escaped_search = search.replace("'", "''");
        query.push_str(&format!(
            " AND (t.memo LIKE '%{}%' OR CAST(t.amount AS TEXT) LIKE '%{}%')",
            escaped_search, escaped_search
        ));
    }

    query.push_str(" ORDER BY t.date DESC, t.created_at DESC");

    let rows = sqlx::query(&query)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch filtered transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| TransactionWithDetails {
            transaction: Transaction {
                id: row.get("id"),
                date: row.get("date"),
                transaction_type: row.get("type"),
                amount: row.get("amount"),
                account_id: row.get("account_id"),
                to_account_id: row.get("to_account_id"),
                category_id: row.get("category_id"),
                memo: row.get("memo"),
                photo_path: row.get("photo_path"),
                created_at: row.get("created_at"),
            },
            account_name: row.get("account_name"),
            to_account_name: row.get("to_account_name"),
            category_name: row.get("category_name"),
        })
        .collect())
}

#[tauri::command]
pub async fn get_income_expense_summary(
    pool: State<'_, SqlitePool>,
    start_date: String,
    end_date: String,
) -> Result<IncomeExpenseSummary, String> {
    let row = sqlx::query(
        "SELECT 
            CAST(COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS REAL) as total_income,
            CAST(COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS REAL) as total_expense,
            COUNT(*) as transaction_count
         FROM transactions
         WHERE date >= ? AND date <= ?",
    )
    .bind(&start_date)
    .bind(&end_date)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to calculate summary: {}", e))?;

    let total_income: f64 = row.get("total_income");
    let total_expense: f64 = row.get("total_expense");
    let transaction_count: i64 = row.get("transaction_count");

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
pub async fn get_category_spending(
    pool: State<'_, SqlitePool>,
    start_date: String,
    end_date: String,
    transaction_type: String,
) -> Result<Vec<CategorySpending>, String> {
    let rows = sqlx::query(
        "SELECT 
            COALESCE(c.parent_id, c.id) as category_id,
            COALESCE(pc.name, c.name) as category_name,
            CAST(SUM(t.amount) AS REAL) as total_amount,
            COUNT(*) as transaction_count
         FROM transactions t
         INNER JOIN categories c ON t.category_id = c.id
         LEFT JOIN categories pc ON c.parent_id = pc.id
         WHERE t.date >= ? AND t.date <= ? AND t.type = ?
         GROUP BY COALESCE(c.parent_id, c.id)
         ORDER BY total_amount DESC",
    )
    .bind(&start_date)
    .bind(&end_date)
    .bind(&transaction_type)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to calculate category spending: {}", e))?;

    let total: f64 = rows.iter().map(|r| r.get::<f64, _>("total_amount")).sum();

    Ok(rows
        .iter()
        .map(|row| {
            let amount: f64 = row.get("total_amount");
            CategorySpending {
                category_id: row.get("category_id"),
                category_name: row.get("category_name"),
                total_amount: amount,
                transaction_count: row.get("transaction_count"),
                percentage: if total > 0.0 {
                    (amount / total) * 100.0
                } else {
                    0.0
                },
            }
        })
        .collect())
}

#[tauri::command]
pub async fn get_daily_summary(
    pool: State<'_, SqlitePool>,
    start_date: String,
    end_date: String,
) -> Result<Vec<DailySummary>, String> {
    let rows = sqlx::query(
        "SELECT 
            date,
            CAST(COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS REAL) as total_income,
            CAST(COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS REAL) as total_expense,
            COUNT(*) as transaction_count
         FROM transactions
         WHERE date >= ? AND date <= ?
         GROUP BY date
         ORDER BY date DESC",
    )
    .bind(&start_date)
    .bind(&end_date)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to calculate daily summary: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| {
            let income: f64 = row.get("total_income");
            let expense: f64 = row.get("total_expense");
            DailySummary {
                date: row.get("date"),
                total_income: income,
                total_expense: expense,
                net: income - expense,
                transaction_count: row.get("transaction_count"),
            }
        })
        .collect())
}

#[tauri::command]
pub async fn search_transactions(
    pool: State<'_, SqlitePool>,
    query: String,
) -> Result<Vec<TransactionWithDetails>, String> {
    let escaped_query = query.replace("'", "''");

    let rows = sqlx::query(
        "SELECT 
            t.id, t.date, t.type, t.amount, t.account_id, t.to_account_id, 
            t.category_id, t.memo, t.photo_path, t.created_at,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name
         FROM transactions t
         INNER JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts ta ON t.to_account_id = ta.id
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE t.memo LIKE ? OR CAST(t.amount AS TEXT) LIKE ?
         ORDER BY t.date DESC, t.created_at DESC
         LIMIT 100",
    )
    .bind(format!("%{}%", escaped_query))
    .bind(format!("%{}%", escaped_query))
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to search transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| TransactionWithDetails {
            transaction: Transaction {
                id: row.get("id"),
                date: row.get("date"),
                transaction_type: row.get("type"),
                amount: row.get("amount"),
                account_id: row.get("account_id"),
                to_account_id: row.get("to_account_id"),
                category_id: row.get("category_id"),
                memo: row.get("memo"),
                photo_path: row.get("photo_path"),
                created_at: row.get("created_at"),
            },
            account_name: row.get("account_name"),
            to_account_name: row.get("to_account_name"),
            category_name: row.get("category_name"),
        })
        .collect())
}

// ==================== PHASE 6: REPORTS & ANALYTICS ====================

#[tauri::command]
pub async fn get_monthly_trends(
    pool: State<'_, SqlitePool>,
    months: i32,
) -> Result<Vec<MonthlyTrend>, String> {
    let rows = sqlx::query(
        "SELECT 
            strftime('%Y-%m', date) as month,
            CAST(COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS REAL) as income,
            CAST(COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS REAL) as expense,
            COUNT(*) as transaction_count
         FROM transactions
         WHERE date >= date('now', ? || ' months')
         GROUP BY strftime('%Y-%m', date)
         ORDER BY month ASC",
    )
    .bind(format!("-{}", months))
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch monthly trends: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| {
            let month: String = row.get("month");
            let income: f64 = row.get("income");
            let expense: f64 = row.get("expense");

            // Parse month for display name
            let parts: Vec<&str> = month.split('-').collect();
            let month_name = if parts.len() == 2 {
                let month_num: u32 = parts[1].parse().unwrap_or(1);
                let month_names = [
                    "January",
                    "February",
                    "March",
                    "April",
                    "May",
                    "June",
                    "July",
                    "August",
                    "September",
                    "October",
                    "November",
                    "December",
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

            MonthlyTrend {
                month,
                month_name,
                income,
                expense,
                net: income - expense,
                transaction_count: row.get("transaction_count"),
            }
        })
        .collect())
}
