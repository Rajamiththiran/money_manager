// File: src-tauri/src/models/goal.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct SavingsGoal {
    pub id: i64,
    pub name: String,
    pub target_amount: f64,
    pub target_date: Option<String>,
    pub linked_account_id: Option<i64>,
    pub color: String,
    pub icon: String,
    pub status: String, // ACTIVE, PAUSED, COMPLETED, ARCHIVED
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Clone)]
pub struct GoalProgress {
    pub current_amount: f64,
    pub target_amount: f64,
    pub percentage: f64,
    pub on_track: bool,
    pub projected_completion_date: Option<String>,
    pub days_remaining: Option<i64>,
}

#[derive(Debug, Serialize, Clone)]
pub struct GoalWithProgress {
    #[serde(flatten)]
    pub goal: SavingsGoal,
    pub progress: GoalProgress,
    pub linked_account_name: Option<String>,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct GoalContribution {
    pub id: i64,
    pub goal_id: i64,
    pub amount: f64,
    pub contribution_date: String,
    pub note: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateGoalInput {
    pub name: String,
    pub target_amount: f64,
    pub target_date: Option<String>,
    pub linked_account_id: Option<i64>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateGoalInput {
    pub id: i64,
    pub name: Option<String>,
    pub target_amount: Option<f64>,
    pub target_date: Option<String>,
    pub color: Option<String>,
    pub icon: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct AddContributionInput {
    pub goal_id: i64,
    pub amount: f64,
    pub date: String,
    pub note: Option<String>,
}
