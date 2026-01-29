// File: src-tauri/src/models/transactions.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Transaction {
    pub id: i64,
    pub date: String,
    pub transaction_type: String, // INCOME, EXPENSE, TRANSFER
    pub amount: f64,
    pub account_id: i64,
    pub to_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub memo: Option<String>,
    pub photo_path: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTransactionInput {
    pub date: String,
    pub transaction_type: String,
    pub amount: f64,
    pub account_id: i64,
    pub to_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub memo: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTransactionInput {
    pub id: i64,
    pub date: Option<String>,
    pub amount: Option<f64>,
    pub category_id: Option<i64>,
    pub memo: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TransactionWithDetails {
    #[serde(flatten)]
    pub transaction: Transaction,
    pub account_name: String,
    pub to_account_name: Option<String>,
    pub category_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct JournalEntry {
    pub id: i64,
    pub transaction_id: i64,
    pub account_id: i64,
    pub debit: f64,
    pub credit: f64,
    pub created_at: String,
}
