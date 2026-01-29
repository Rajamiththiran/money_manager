// File: src-tauri/src/models/category.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct Category {
    pub id: i64,
    pub parent_id: Option<i64>,
    pub name: String,
    pub category_type: String, // INCOME or EXPENSE
}

#[derive(Debug, Serialize, Clone)]
pub struct CategoryWithChildren {
    #[serde(flatten)]
    pub category: Category,
    pub children: Vec<Category>,
}

#[derive(Debug, Deserialize)]
pub struct CreateCategoryInput {
    pub parent_id: Option<i64>,
    pub name: String,
    pub category_type: String,
}

#[derive(Debug, Deserialize)]
pub struct UpdateCategoryInput {
    pub id: i64,
    pub name: Option<String>,
    pub parent_id: Option<i64>,
}
