// File: src-tauri/src/models/tag.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Tag {
    pub id: i64,
    pub name: String,
    pub color: String,
    pub created_at: String,
}

/// Lightweight tag info attached to transactions (no created_at needed)
#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct TagInfo {
    pub id: i64,
    pub name: String,
    pub color: String,
}

#[derive(Debug, Deserialize)]
pub struct CreateTagInput {
    pub name: String,
    pub color: Option<String>,
}

#[derive(Debug, Deserialize)]
pub struct UpdateTagInput {
    pub id: i64,
    pub name: Option<String>,
    pub color: Option<String>,
}

#[derive(Debug, Serialize)]
pub struct TagSpending {
    pub tag_id: i64,
    pub tag_name: String,
    pub tag_color: String,
    pub total_income: f64,
    pub total_expense: f64,
    pub transaction_count: i64,
}
