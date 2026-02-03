// File: src-tauri/src/models/recurring.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct RecurringTransaction {
    pub id: i64,
    pub name: String,
    pub description: Option<String>,
    pub transaction_type: String, // INCOME, EXPENSE, TRANSFER
    pub amount: f64,
    pub account_id: i64,
    pub to_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub frequency: String,  // DAILY, WEEKLY, MONTHLY, YEARLY, CUSTOM
    pub interval_days: i64, // For CUSTOM frequency
    pub start_date: String,
    pub end_date: Option<String>,
    pub next_execution_date: String,
    pub is_active: bool,
    pub last_executed_date: Option<String>,
    pub execution_count: i64,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateRecurringTransactionInput {
    pub name: String,
    pub description: Option<String>,
    pub transaction_type: String,
    pub amount: f64,
    pub account_id: i64,
    pub to_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub frequency: String,
    pub interval_days: Option<i64>, // Only for CUSTOM frequency
    pub start_date: String,
    pub end_date: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateRecurringTransactionInput {
    pub id: i64,
    pub name: Option<String>,
    pub description: Option<String>,
    pub amount: Option<f64>,
    pub frequency: Option<String>,
    pub interval_days: Option<i64>,
    pub end_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct RecurringTransactionWithDetails {
    #[serde(flatten)]
    pub recurring: RecurringTransaction,
    pub account_name: String,
    pub to_account_name: Option<String>,
    pub category_name: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct UpcomingExecution {
    pub recurring_id: i64,
    pub name: String,
    pub transaction_type: String,
    pub amount: f64,
    pub next_execution_date: String,
    pub days_until_execution: i64,
}
