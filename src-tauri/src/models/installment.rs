// File: src-tauri/src/models/installment.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallmentPlan {
    pub id: i64,
    pub name: String,
    pub total_amount: f64,
    pub num_installments: i32,
    pub amount_per_installment: f64,
    pub account_id: i64,
    pub category_id: i64,
    pub start_date: String,
    pub frequency: String,
    pub next_due_date: String,
    pub installments_paid: i32,
    pub total_paid: f64,
    pub status: String,
    pub memo: Option<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct InstallmentPayment {
    pub id: i64,
    pub installment_plan_id: i64,
    pub transaction_id: i64,
    pub installment_number: i32,
    pub amount: f64,
    pub due_date: String,
    pub paid_date: String,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateInstallmentPlan {
    pub name: String,
    pub total_amount: f64,
    pub num_installments: i32,
    pub account_id: i64,
    pub category_id: i64,
    pub start_date: String,
    pub frequency: String,
    pub memo: Option<String>,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallmentPlanWithDetails {
    pub plan: InstallmentPlan,
    pub payments: Vec<InstallmentPaymentDetails>,
    pub account_name: String,
    pub category_name: String,
    pub remaining_amount: f64,
    pub remaining_installments: i32,
    pub next_payment_amount: f64,
}

#[derive(Debug, Clone, Serialize)]
pub struct InstallmentPaymentDetails {
    pub payment: InstallmentPayment,
    pub installment_number: i32,
    pub amount: f64,
    pub due_date: String,
    pub paid_date: Option<String>,
    pub status: String, // PENDING, PAID, OVERDUE
}
