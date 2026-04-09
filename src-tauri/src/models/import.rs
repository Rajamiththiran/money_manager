// File: src-tauri/src/models/import.rs
use serde::{Deserialize, Serialize};
use std::collections::HashMap;

#[derive(Debug, Serialize)]
pub struct CsvPreview {
    pub headers: Vec<String>,
    pub rows: Vec<Vec<String>>,
    pub total_rows: i64,
    pub detected_delimiter: String,
}

#[derive(Debug, Deserialize)]
pub struct ColumnMapping {
    pub date_col: usize,
    pub amount_col: usize,
    pub type_col: Option<usize>,
    pub account_col: Option<usize>,
    pub category_col: Option<usize>,
    pub memo_col: Option<usize>,
    pub date_format: String,
    pub negative_as_expense: bool,
}

#[derive(Debug, Serialize)]
pub struct RowValidation {
    pub row_index: i64,
    pub status: String, // "valid", "warning", "error"
    pub date: String,
    pub amount: f64,
    pub transaction_type: String,
    pub account_name: String,
    pub category_name: String,
    pub memo: String,
    pub error: Option<String>,
    pub matched_account_id: Option<i64>,
    pub matched_category_id: Option<i64>,
}

#[derive(Debug, Serialize)]
pub struct ImportValidationResult {
    pub valid_count: i64,
    pub warning_count: i64,
    pub error_count: i64,
    pub rows: Vec<RowValidation>,
    pub unmatched_accounts: Vec<String>,
    pub unmatched_categories: Vec<String>,
}

#[derive(Debug, Deserialize)]
pub struct ImportOptions {
    pub skip_duplicates: bool,
    pub create_missing_categories: bool,
    pub default_account_id: i64,
    pub account_mapping: HashMap<String, i64>,
    pub category_mapping: HashMap<String, i64>,
}

#[derive(Debug, Serialize)]
pub struct ImportResult {
    pub batch_id: String,
    pub imported: i64,
    pub skipped: i64,
    pub errors: i64,
}

#[derive(Debug, Serialize)]
pub struct ImportHistoryEntry {
    pub id: i64,
    pub batch_id: String,
    pub filename: String,
    pub total_rows: i64,
    pub imported_count: i64,
    pub skipped_count: i64,
    pub error_count: i64,
    pub status: String,
    pub imported_at: String,
    pub can_undo: bool,
}

#[derive(Debug, Serialize)]
pub struct MatchSuggestion {
    pub name: String,
    pub matched_id: Option<i64>,
    pub matched_name: Option<String>,
    pub score: f64, // 0.0 to 1.0
}
