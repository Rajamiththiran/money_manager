// File: src-tauri/src/models/budget.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Budget {
    pub id: i64,
    pub category_id: i64,
    pub amount: f64,
    pub period: String, // MONTHLY or YEARLY
    pub start_date: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateBudgetInput {
    pub category_id: i64,
    pub amount: f64,
    pub period: String,
    pub start_date: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateBudgetInput {
    pub id: i64,
    pub amount: Option<f64>,
    pub start_date: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct BudgetStatus {
    #[serde(flatten)]
    pub budget: Budget,
    pub category_name: String,
    pub spent_amount: f64,
    pub remaining_amount: f64,
    pub percentage_used: f64,
    pub days_remaining: i64,
    pub daily_average_spent: f64,
    pub daily_budget_remaining: f64,
    pub is_over_budget: bool,
}

#[derive(Debug, Serialize)]
pub struct BudgetAlert {
    pub budget_id: i64,
    pub category_name: String,
    pub budget_amount: f64,
    pub spent_amount: f64,
    pub percentage_used: f64,
    pub alert_level: String, // WARNING (80%), DANGER (100%), CRITICAL (120%)
}
