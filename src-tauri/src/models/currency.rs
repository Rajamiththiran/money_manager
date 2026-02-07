// File: src-tauri/src/models/currency.rs
use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExchangeRate {
    pub id: i64,
    pub from_currency: String,
    pub to_currency: String,
    pub rate: f64,
    pub effective_date: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Deserialize)]
pub struct SetExchangeRateInput {
    pub from_currency: String,
    pub to_currency: String,
    pub rate: f64,
    pub effective_date: String,
}

#[derive(Debug, Serialize)]
pub struct CurrencyConversion {
    pub from_currency: String,
    pub to_currency: String,
    pub original_amount: f64,
    pub converted_amount: f64,
    pub rate_used: f64,
    pub rate_date: String,
}

#[derive(Debug, Serialize)]
pub struct SupportedCurrency {
    pub code: String,
    pub name: String,
    pub symbol: String,
}

#[derive(Debug, Serialize)]
pub struct ExchangeRateSummary {
    pub from_currency: String,
    pub to_currency: String,
    pub latest_rate: f64,
    pub latest_date: String,
    pub rate_count: i64,
}
