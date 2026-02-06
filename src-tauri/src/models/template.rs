// File: src-tauri/src/models/template.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TransactionTemplate {
    pub id: i64,
    pub name: String,
    pub transaction_type: String, // INCOME, EXPENSE, TRANSFER
    pub amount: f64,
    pub account_id: Option<i64>,
    pub to_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub memo: Option<String>,
    pub use_count: i64,
    pub last_used_at: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize)]
pub struct TransactionTemplateWithDetails {
    #[serde(flatten)]
    pub template: TransactionTemplate,
    pub account_name: Option<String>,
    pub to_account_name: Option<String>,
    pub category_name: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct CreateTemplateInput {
    pub name: String,
    pub transaction_type: String,
    pub amount: f64,
    pub account_id: Option<i64>,
    pub to_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub memo: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTemplateInput {
    pub id: i64,
    pub name: Option<String>,
    pub amount: Option<f64>,
    pub account_id: Option<i64>,
    pub to_account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub memo: Option<String>,
}
