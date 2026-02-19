// File: src-tauri/src/models/networth.rs
use serde::{Deserialize, Serialize};

/// Live net worth calculation with month-over-month change
#[derive(Debug, Clone, Serialize)]
pub struct NetWorthSummary {
    pub assets: f64,
    pub liabilities: f64,
    pub net_worth: f64,
    pub change_amount: f64,
    pub change_percentage: f64,
}

/// Persisted monthly snapshot for historical chart
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct NetWorthSnapshot {
    pub id: i64,
    pub snapshot_date: String,
    pub total_assets: f64,
    pub total_liabilities: f64,
    pub net_worth: f64,
}
