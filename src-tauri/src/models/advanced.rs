use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CategorizationRule {
    pub id: String,
    pub match_pattern: String,
    pub match_type: String, // 'exact', 'contains', 'starts_with', 'regex'
    pub category_id: String,
    pub priority: i32,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateCategorizationRuleInput {
    pub id: String,
    pub match_pattern: String,
    pub match_type: String,
    pub category_id: String,
    pub priority: i32,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportTemplate {
    pub id: String,
    pub name: String,
    pub columns: String, // JSON array of column names
    pub filters: Option<String>, // JSON object representing filters
    pub format: String, // 'csv' or 'json'
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct CreateExportTemplateInput {
    pub id: String,
    pub name: String,
    pub columns: String,
    pub filters: Option<String>,
    pub format: String,
}
