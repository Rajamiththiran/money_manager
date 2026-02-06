// File: src-tauri/src/models/credit_card.rs
use serde::{Deserialize, Serialize};

/// Credit card configuration linked to an account
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditCardSettings {
    pub id: i64,
    pub account_id: i64,
    pub credit_limit: f64,
    pub statement_day: i32,   // 1-28, day of month statement is generated
    pub payment_due_day: i32, // 1-28, day of month payment is due
    pub minimum_payment_percentage: f64, // e.g., 5.0 = 5%
    pub auto_settlement_enabled: bool,
    pub settlement_account_id: Option<i64>, // Bank account for auto-pay
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateCreditCardSettingsInput {
    pub account_id: i64,
    pub credit_limit: f64,
    pub statement_day: i32,
    pub payment_due_day: i32,
    pub minimum_payment_percentage: Option<f64>,
    pub auto_settlement_enabled: Option<bool>,
    pub settlement_account_id: Option<i64>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCreditCardSettingsInput {
    pub id: i64,
    pub credit_limit: Option<f64>,
    pub statement_day: Option<i32>,
    pub payment_due_day: Option<i32>,
    pub minimum_payment_percentage: Option<f64>,
    pub auto_settlement_enabled: Option<bool>,
    pub settlement_account_id: Option<i64>,
}

/// Full credit card info with account details and computed balances
#[derive(Debug, Clone, Serialize)]
pub struct CreditCardWithDetails {
    pub settings: CreditCardSettings,
    pub account_name: String,
    pub settlement_account_name: Option<String>,
    pub total_balance: f64,       // Total liability (all-time unpaid)
    pub outstanding_balance: f64, // Current cycle charges not yet paid
    pub available_credit: f64,    // credit_limit - total_balance
    pub current_cycle_charges: f64,
    pub current_cycle_payments: f64,
    pub utilization_percentage: f64, // (total_balance / credit_limit) * 100
}

/// A closed billing statement
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct CreditCardStatement {
    pub id: i64,
    pub credit_card_id: i64,
    pub statement_date: String,
    pub due_date: String,
    pub cycle_start_date: String,
    pub cycle_end_date: String,
    pub opening_balance: f64,
    pub total_charges: f64,
    pub total_payments: f64,
    pub closing_balance: f64,
    pub minimum_payment: f64,
    pub status: String,
    pub paid_amount: f64,
    pub paid_date: Option<String>,
    pub created_at: String,
}

/// Statement with transaction line items
#[derive(Debug, Clone, Serialize)]
pub struct StatementWithTransactions {
    pub statement: CreditCardStatement,
    pub transactions: Vec<StatementTransaction>,
}

#[derive(Debug, Clone, Serialize)]
pub struct StatementTransaction {
    pub id: i64,
    pub date: String,
    pub transaction_type: String,
    pub amount: f64,
    pub category_name: Option<String>,
    pub memo: Option<String>,
}

/// Input for generating a payment transaction
#[derive(Debug, Deserialize)]
pub struct SettlementInput {
    pub credit_card_settings_id: i64,
    pub payment_account_id: i64, // Bank account paying from
    pub amount: Option<f64>,     // None = full balance, Some = partial/custom
    pub date: Option<String>,    // None = today
}

/// Summary for dashboard
#[derive(Debug, Serialize)]
pub struct CreditCardSummary {
    pub account_id: i64,
    pub account_name: String,
    pub total_balance: f64,
    pub credit_limit: f64,
    pub available_credit: f64,
    pub next_due_date: Option<String>,
    pub next_due_amount: Option<f64>,
    pub utilization_percentage: f64,
}
