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

// ============ Filter Models ============

#[derive(Debug, Deserialize)]
pub struct TransactionFilter {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub transaction_type: Option<String>, // INCOME, EXPENSE, TRANSFER
    pub account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub search_query: Option<String>,
    pub include_subcategories: Option<bool>, // For category filtering
}

#[derive(Debug, Serialize)]
pub struct IncomeExpenseSummary {
    pub total_income: f64,
    pub total_expense: f64,
    pub net_savings: f64,
    pub transaction_count: i64,
    pub start_date: String,
    pub end_date: String,
}

#[derive(Debug, Serialize)]
pub struct CategorySpending {
    pub category_id: i64,
    pub category_name: String,
    pub total_amount: f64,
    pub transaction_count: i64,
    pub percentage: f64, // Of total spending
}

#[derive(Debug, Serialize)]
pub struct DailySummary {
    pub date: String,
    pub total_income: f64,
    pub total_expense: f64,
    pub net: f64,
    pub transaction_count: i64,
}

// ============ NEW: Report Models ============

#[derive(Debug, Serialize)]
pub struct MonthlyTrend {
    pub month: String,      // e.g., "2026-01"
    pub month_name: String, // e.g., "January 2026"
    pub income: f64,
    pub expense: f64,
    pub net: f64,
    pub transaction_count: i64,
}
