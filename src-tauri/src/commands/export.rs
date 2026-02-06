// File: src-tauri/src/commands/export.rs
use crate::models::transactions::TransactionWithDetails;
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportFilter {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub transaction_type: Option<String>,
    pub account_id: Option<i64>,
    pub category_id: Option<i64>,
}

#[tauri::command]
pub async fn export_transactions_csv(
    pool: State<'_, SqlitePool>,
    filter: Option<ExportFilter>,
) -> Result<String, String> {
    println!("=== export_transactions_csv called ===");
    println!("Filter: {:?}", filter);

    let transactions = get_export_transactions(&pool, filter).await?;
    println!("Found {} transactions", transactions.len());

    // CSV Header
    let mut csv = String::from("Date,Type,Account,To Account,Category,Amount,Memo\n");

    // CSV Rows
    for txn in transactions {
        let row = format!(
            "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",{:.2},\"{}\"\n",
            txn.transaction.date,
            txn.transaction.transaction_type,
            txn.account_name,
            txn.to_account_name.unwrap_or_default(),
            txn.category_name.unwrap_or_default(),
            txn.transaction.amount,
            txn.transaction
                .memo
                .unwrap_or_default()
                .replace("\"", "\"\"")
        );
        csv.push_str(&row);
    }

    println!("CSV generated, length: {}", csv.len());
    Ok(csv)
}

#[tauri::command]
pub async fn export_transactions_json(
    pool: State<'_, SqlitePool>,
    filter: Option<ExportFilter>,
) -> Result<String, String> {
    println!("=== export_transactions_json called ===");
    println!("Filter: {:?}", filter);

    let transactions = get_export_transactions(&pool, filter).await?;
    println!("Found {} transactions", transactions.len());

    let result = serde_json::to_string_pretty(&transactions)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    println!("JSON generated, length: {}", result.len());
    Ok(result)
}

#[tauri::command]
pub async fn export_full_backup(pool: State<'_, SqlitePool>) -> Result<String, String> {
    println!("=== export_full_backup called ===");

    // Get all data for backup
    let accounts = get_all_accounts(&pool).await?;
    println!("Accounts fetched");

    let categories = get_all_categories(&pool).await?;
    println!("Categories fetched");

    let transactions = get_export_transactions(&pool, None).await?;
    println!("Transactions fetched: {}", transactions.len());

    let budgets = get_all_budgets(&pool).await?;
    println!("Budgets fetched");

    let backup = serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "data": {
            "accounts": accounts,
            "categories": categories,
            "transactions": transactions,
            "budgets": budgets
        }
    });

    let result = serde_json::to_string_pretty(&backup)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    println!("Backup generated, length: {}", result.len());
    Ok(result)
}

// Helper function to get transactions with details
async fn get_export_transactions(
    pool: &SqlitePool,
    filter: Option<ExportFilter>,
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

    if let Some(ref f) = filter {
        if let Some(ref start) = f.start_date {
            query.push_str(&format!(" AND t.date >= '{}'", start));
        }
        if let Some(ref end) = f.end_date {
            query.push_str(&format!(" AND t.date <= '{}'", end));
        }
        if let Some(ref t_type) = f.transaction_type {
            query.push_str(&format!(" AND t.type = '{}'", t_type));
        }
        if let Some(acc_id) = f.account_id {
            query.push_str(&format!(
                " AND (t.account_id = {} OR t.to_account_id = {})",
                acc_id, acc_id
            ));
        }
        if let Some(cat_id) = f.category_id {
            query.push_str(&format!(" AND t.category_id = {}", cat_id));
        }
    }

    query.push_str(" ORDER BY t.date DESC, t.created_at DESC");

    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| TransactionWithDetails {
            transaction: crate::models::transactions::Transaction {
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

// Helper to get all accounts
async fn get_all_accounts(pool: &SqlitePool) -> Result<serde_json::Value, String> {
    let rows = sqlx::query(
        "SELECT id, group_id, name, initial_balance, currency, created_at FROM accounts ORDER BY name"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch accounts: {}", e))?;

    let accounts: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "group_id": row.get::<i64, _>("group_id"),
                "name": row.get::<String, _>("name"),
                "initial_balance": row.get::<f64, _>("initial_balance"),
                "currency": row.get::<String, _>("currency"),
                "created_at": row.get::<String, _>("created_at")
            })
        })
        .collect();

    Ok(serde_json::json!(accounts))
}

// Helper to get all categories
async fn get_all_categories(pool: &SqlitePool) -> Result<serde_json::Value, String> {
    let rows = sqlx::query("SELECT id, name, type, parent_id FROM categories ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch categories: {}", e))?;

    let categories: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "name": row.get::<String, _>("name"),
                "type": row.get::<String, _>("type"),
                "parent_id": row.get::<Option<i64>, _>("parent_id")
            })
        })
        .collect();

    Ok(serde_json::json!(categories))
}

// Helper to get all budgets
async fn get_all_budgets(pool: &SqlitePool) -> Result<serde_json::Value, String> {
    let rows =
        sqlx::query("SELECT id, category_id, amount, period, start_date FROM budgets ORDER BY id")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to fetch budgets: {}", e))?;

    let budgets: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "category_id": row.get::<i64, _>("category_id"),
                "amount": row.get::<f64, _>("amount"),
                "period": row.get::<String, _>("period"),
                "start_date": row.get::<String, _>("start_date")
            })
        })
        .collect();

    Ok(serde_json::json!(budgets))
}
