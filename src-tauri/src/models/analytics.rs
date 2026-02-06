// File: src-tauri/src/models/analytics.rs
use serde::{Deserialize, Serialize};

/// Net worth snapshot at a point in time
#[derive(Debug, Clone, Serialize)]
pub struct NetWorthSnapshot {
    pub date: String,           // e.g., "2025-12" (month-end)
    pub total_assets: f64,      // Sum of all ASSET account balances
    pub total_liabilities: f64, // Sum of all LIABILITY account balances (positive = owed)
    pub net_worth: f64,         // assets - liabilities
    pub growth: f64,            // Change from previous snapshot
    pub growth_percentage: f64,
}

/// Account balance at a point in time for historical tracking
#[derive(Debug, Clone, Serialize)]
pub struct AccountBalancePoint {
    pub date: String,
    pub balance: f64,
}

/// Full account performance report
#[derive(Debug, Clone, Serialize)]
pub struct AccountPerformance {
    pub account_id: i64,
    pub account_name: String,
    pub account_type: String, // ASSET or LIABILITY
    pub current_balance: f64,
    pub opening_balance: f64, // Balance at start of period
    pub closing_balance: f64, // Balance at end of period
    pub highest_balance: f64,
    pub lowest_balance: f64,
    pub average_daily_balance: f64,
    pub total_inflow: f64,  // Debits (money in)
    pub total_outflow: f64, // Credits (money out)
    pub net_change: f64,
    pub transaction_count: i64,
    pub balance_history: Vec<AccountBalancePoint>,
}

/// Top spending category with period comparison
#[derive(Debug, Clone, Serialize)]
pub struct TopCategory {
    pub category_id: i64,
    pub category_name: String,
    pub current_amount: f64,
    pub previous_amount: f64,
    pub change: f64,
    pub change_percentage: f64,
    pub transaction_count: i64,
    pub percentage_of_total: f64,
}

/// Subcategory breakdown for drill-down
#[derive(Debug, Clone, Serialize)]
pub struct SubcategoryBreakdown {
    pub parent_category_id: i64,
    pub parent_category_name: String,
    pub total_amount: f64,
    pub subcategories: Vec<SubcategoryItem>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SubcategoryItem {
    pub category_id: i64,
    pub category_name: String,
    pub amount: f64,
    pub percentage: f64,
    pub transaction_count: i64,
}

/// Year-over-year comparison
#[derive(Debug, Clone, Serialize)]
pub struct YearComparison {
    pub month: String, // e.g., "January"
    pub month_num: i32,
    pub current_year_income: f64,
    pub current_year_expense: f64,
    pub previous_year_income: f64,
    pub previous_year_expense: f64,
    pub income_change: f64,
    pub expense_change: f64,
}

/// Input for analytics queries
#[derive(Debug, Deserialize)]
pub struct AnalyticsPeriod {
    pub start_date: String,
    pub end_date: String,
}

/// Dashboard analytics summary
#[derive(Debug, Clone, Serialize)]
pub struct AnalyticsDashboard {
    pub net_worth: f64,
    pub net_worth_change: f64,
    pub total_income_this_month: f64,
    pub total_expense_this_month: f64,
    pub savings_rate: f64, // (income - expense) / income * 100
    pub top_expense_category: Option<String>,
    pub top_expense_amount: f64,
    pub daily_average_expense: f64,
    pub days_in_period: i64,
}
