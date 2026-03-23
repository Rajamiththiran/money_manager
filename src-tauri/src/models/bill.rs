// File: src-tauri/src/models/bill.rs
use serde::Serialize;

/// Unified struct representing an upcoming bill from either
/// a recurring transaction or an installment plan.
#[derive(Debug, Serialize, Clone)]
pub struct UpcomingBill {
    pub source: String,                    // "RECURRING" or "INSTALLMENT"
    pub source_id: i64,                    // recurring_transactions.id or installment_plans.id
    pub name: String,
    pub amount: f64,
    pub due_date: String,                  // YYYY-MM-DD
    pub days_until_due: i64,               // negative = overdue
    pub transaction_type: String,          // INCOME, EXPENSE, TRANSFER
    pub account_name: String,
    pub category_name: Option<String>,
    pub is_overdue: bool,
    pub is_due_today: bool,
    pub installment_progress: Option<String>, // e.g. "3/12" for installments
}
