// File: src-tauri/src/models/account.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct AccountGroup {
    pub id: i64,
    pub name: String,
    #[serde(rename = "type")]
    pub account_type: String, // ASSET or LIABILITY
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Account {
    pub id: i64,
    pub group_id: i64,
    pub name: String,
    pub initial_balance: f64,
    pub currency: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateAccountInput {
    pub group_id: i64,
    pub name: String,
    pub initial_balance: f64,
    pub currency: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct AccountWithBalance {
    #[serde(flatten)]
    pub account: Account,
    pub current_balance: f64,
}
