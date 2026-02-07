// File: src-tauri/src/commands/currencies.rs
use crate::models::currency::{
    CurrencyConversion, ExchangeRate, ExchangeRateSummary, SetExchangeRateInput, SupportedCurrency,
};
use sqlx::{Row, SqlitePool};
use tauri::State;

// ======================== SUPPORTED CURRENCIES ========================

/// Returns the list of supported currencies (hardcoded, matches frontend SettingsView)
#[tauri::command]
pub async fn get_supported_currencies() -> Result<Vec<SupportedCurrency>, String> {
    Ok(vec![
        SupportedCurrency {
            code: "LKR".to_string(),
            name: "Sri Lankan Rupee".to_string(),
            symbol: "Rs.".to_string(),
        },
        SupportedCurrency {
            code: "USD".to_string(),
            name: "US Dollar".to_string(),
            symbol: "$".to_string(),
        },
        SupportedCurrency {
            code: "EUR".to_string(),
            name: "Euro".to_string(),
            symbol: "€".to_string(),
        },
        SupportedCurrency {
            code: "GBP".to_string(),
            name: "British Pound".to_string(),
            symbol: "£".to_string(),
        },
        SupportedCurrency {
            code: "INR".to_string(),
            name: "Indian Rupee".to_string(),
            symbol: "₹".to_string(),
        },
        SupportedCurrency {
            code: "AUD".to_string(),
            name: "Australian Dollar".to_string(),
            symbol: "A$".to_string(),
        },
        SupportedCurrency {
            code: "CAD".to_string(),
            name: "Canadian Dollar".to_string(),
            symbol: "C$".to_string(),
        },
        SupportedCurrency {
            code: "JPY".to_string(),
            name: "Japanese Yen".to_string(),
            symbol: "¥".to_string(),
        },
        SupportedCurrency {
            code: "SGD".to_string(),
            name: "Singapore Dollar".to_string(),
            symbol: "S$".to_string(),
        },
        SupportedCurrency {
            code: "AED".to_string(),
            name: "UAE Dirham".to_string(),
            symbol: "د.إ".to_string(),
        },
    ])
}

// ======================== PRIMARY CURRENCY ========================

/// Get the primary (home) currency from app_settings
#[tauri::command]
pub async fn get_primary_currency(pool: State<'_, SqlitePool>) -> Result<String, String> {
    let row = sqlx::query("SELECT value FROM app_settings WHERE key = 'primary_currency'")
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch primary currency: {}", e))?;

    match row {
        Some(r) => Ok(r.get("value")),
        None => Ok("LKR".to_string()),
    }
}

/// Set the primary (home) currency in app_settings
#[tauri::command]
pub async fn set_primary_currency(
    pool: State<'_, SqlitePool>,
    currency_code: String,
) -> Result<(), String> {
    let code = currency_code.trim().to_uppercase();
    if code.is_empty() || code.len() != 3 {
        return Err("Currency code must be a 3-letter code (e.g., LKR, USD)".to_string());
    }

    sqlx::query(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('primary_currency', ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        "#,
    )
    .bind(&code)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to set primary currency: {}", e))?;

    Ok(())
}

// ======================== EXCHANGE RATE CRUD ========================

/// Set (upsert) an exchange rate for a currency pair on a specific date.
/// If a rate already exists for the same pair + date, it will be updated.
#[tauri::command]
pub async fn set_exchange_rate(
    pool: State<'_, SqlitePool>,
    input: SetExchangeRateInput,
) -> Result<i64, String> {
    // Validate inputs
    let from = input.from_currency.trim().to_uppercase();
    let to = input.to_currency.trim().to_uppercase();

    if from.is_empty() || from.len() != 3 {
        return Err("'from_currency' must be a 3-letter code".to_string());
    }
    if to.is_empty() || to.len() != 3 {
        return Err("'to_currency' must be a 3-letter code".to_string());
    }
    if from == to {
        return Err("'from_currency' and 'to_currency' must be different".to_string());
    }
    if input.rate <= 0.0 {
        return Err("Exchange rate must be greater than 0".to_string());
    }
    if input.effective_date.is_empty() {
        return Err("Effective date is required".to_string());
    }

    // Validate date format (YYYY-MM-DD)
    if chrono::NaiveDate::parse_from_str(&input.effective_date, "%Y-%m-%d").is_err() {
        return Err("Invalid date format. Use YYYY-MM-DD".to_string());
    }

    let result = sqlx::query(
        r#"
        INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, updated_at)
        VALUES (?, ?, ?, ?, datetime('now'))
        ON CONFLICT(from_currency, to_currency, effective_date)
        DO UPDATE SET rate = excluded.rate, updated_at = datetime('now')
        "#,
    )
    .bind(&from)
    .bind(&to)
    .bind(input.rate)
    .bind(&input.effective_date)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to set exchange rate: {}", e))?;

    Ok(result.last_insert_rowid())
}

/// Get the exchange rate for a currency pair on a specific date.
/// Falls back to the most recent rate before the given date if no exact match.
#[tauri::command]
pub async fn get_exchange_rate(
    pool: State<'_, SqlitePool>,
    from_currency: String,
    to_currency: String,
    date: String,
) -> Result<ExchangeRate, String> {
    let from = from_currency.trim().to_uppercase();
    let to = to_currency.trim().to_uppercase();

    if from == to {
        // Same currency = rate of 1.0, return a synthetic rate
        return Ok(ExchangeRate {
            id: 0,
            from_currency: from.clone(),
            to_currency: to.clone(),
            rate: 1.0,
            effective_date: date.clone(),
            created_at: String::new(),
            updated_at: String::new(),
        });
    }

    // Try direct rate: from -> to, most recent on or before the date
    let direct = sqlx::query(
        r#"
        SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
        FROM exchange_rates
        WHERE from_currency = ? AND to_currency = ? AND effective_date <= ?
        ORDER BY effective_date DESC
        LIMIT 1
        "#,
    )
    .bind(&from)
    .bind(&to)
    .bind(&date)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch exchange rate: {}", e))?;

    if let Some(row) = direct {
        return Ok(ExchangeRate {
            id: row.get("id"),
            from_currency: row.get("from_currency"),
            to_currency: row.get("to_currency"),
            rate: row.get("rate"),
            effective_date: row.get("effective_date"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    // Try inverse rate: to -> from, and invert it
    let inverse = sqlx::query(
        r#"
        SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
        FROM exchange_rates
        WHERE from_currency = ? AND to_currency = ? AND effective_date <= ?
        ORDER BY effective_date DESC
        LIMIT 1
        "#,
    )
    .bind(&to)
    .bind(&from)
    .bind(&date)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch inverse exchange rate: {}", e))?;

    if let Some(row) = inverse {
        let stored_rate: f64 = row.get("rate");
        let inverted_rate = if stored_rate > 0.0 {
            1.0 / stored_rate
        } else {
            return Err("Stored rate is invalid (zero)".to_string());
        };

        return Ok(ExchangeRate {
            id: row.get("id"),
            from_currency: from,
            to_currency: to,
            rate: inverted_rate,
            effective_date: row.get("effective_date"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    Err(format!(
        "No exchange rate found for {} → {} on or before {}",
        from, to, date
    ))
}

/// Get all exchange rates, ordered by date descending
#[tauri::command]
pub async fn get_exchange_rates(
    pool: State<'_, SqlitePool>,
    from_currency: Option<String>,
    to_currency: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<ExchangeRate>, String> {
    let query_limit = limit.unwrap_or(100);

    let rows = match (&from_currency, &to_currency) {
        (Some(from), Some(to)) => {
            sqlx::query(
                r#"
                SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
                FROM exchange_rates
                WHERE from_currency = ? AND to_currency = ?
                ORDER BY effective_date DESC
                LIMIT ?
                "#,
            )
            .bind(from.trim().to_uppercase())
            .bind(to.trim().to_uppercase())
            .bind(query_limit)
            .fetch_all(pool.inner())
            .await
        }
        (Some(from), None) => {
            sqlx::query(
                r#"
                SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
                FROM exchange_rates
                WHERE from_currency = ?
                ORDER BY effective_date DESC
                LIMIT ?
                "#,
            )
            .bind(from.trim().to_uppercase())
            .bind(query_limit)
            .fetch_all(pool.inner())
            .await
        }
        _ => {
            sqlx::query(
                r#"
                SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
                FROM exchange_rates
                ORDER BY effective_date DESC
                LIMIT ?
                "#,
            )
            .bind(query_limit)
            .fetch_all(pool.inner())
            .await
        }
    }
    .map_err(|e| format!("Failed to fetch exchange rates: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| ExchangeRate {
            id: row.get("id"),
            from_currency: row.get("from_currency"),
            to_currency: row.get("to_currency"),
            rate: row.get("rate"),
            effective_date: row.get("effective_date"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
        .collect())
}

/// Delete a specific exchange rate entry by ID
#[tauri::command]
pub async fn delete_exchange_rate(pool: State<'_, SqlitePool>, rate_id: i64) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM exchange_rates WHERE id = ?")
        .bind(rate_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete exchange rate: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Exchange rate not found".to_string());
    }

    Ok(())
}

// ======================== CURRENCY CONVERSION ========================

/// Convert an amount from one currency to another using stored rates.
/// Uses the nearest available rate on or before the given date.
#[tauri::command]
pub async fn convert_amount(
    pool: State<'_, SqlitePool>,
    amount: f64,
    from_currency: String,
    to_currency: String,
    date: String,
) -> Result<CurrencyConversion, String> {
    if amount < 0.0 {
        return Err("Amount must be non-negative".to_string());
    }

    let from = from_currency.trim().to_uppercase();
    let to = to_currency.trim().to_uppercase();

    // Same currency — no conversion needed
    if from == to {
        return Ok(CurrencyConversion {
            from_currency: from,
            to_currency: to,
            original_amount: amount,
            converted_amount: amount,
            rate_used: 1.0,
            rate_date: date,
        });
    }

    // Get the rate (handles direct + inverse fallback internally)
    let rate = get_exchange_rate_internal(pool.inner(), &from, &to, &date).await?;

    let converted = amount * rate.rate;

    // Round to 2 decimal places for most currencies, 0 for JPY
    let converted_rounded = if to == "JPY" {
        converted.round()
    } else {
        (converted * 100.0).round() / 100.0
    };

    Ok(CurrencyConversion {
        from_currency: from,
        to_currency: to,
        original_amount: amount,
        converted_amount: converted_rounded,
        rate_used: rate.rate,
        rate_date: rate.effective_date,
    })
}

// ======================== RATE SUMMARIES ========================

/// Get a summary of latest rates for each unique currency pair
#[tauri::command]
pub async fn get_exchange_rate_summaries(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ExchangeRateSummary>, String> {
    let rows = sqlx::query(
        r#"
        SELECT
            er.from_currency,
            er.to_currency,
            er.rate as latest_rate,
            er.effective_date as latest_date,
            counts.rate_count
        FROM exchange_rates er
        INNER JOIN (
            SELECT from_currency, to_currency,
                   MAX(effective_date) as max_date,
                   COUNT(*) as rate_count
            FROM exchange_rates
            GROUP BY from_currency, to_currency
        ) counts ON er.from_currency = counts.from_currency
                 AND er.to_currency = counts.to_currency
                 AND er.effective_date = counts.max_date
        ORDER BY er.from_currency, er.to_currency
        "#,
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch rate summaries: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| ExchangeRateSummary {
            from_currency: row.get("from_currency"),
            to_currency: row.get("to_currency"),
            latest_rate: row.get("latest_rate"),
            latest_date: row.get("latest_date"),
            rate_count: row.get("rate_count"),
        })
        .collect())
}

// ======================== BULK CONVERSION (for reports) ========================

/// Convert multiple account balances to the primary currency.
/// Useful for dashboard net worth calculations with multi-currency accounts.
#[tauri::command]
pub async fn convert_balances_to_primary(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ConvertedBalance>, String> {
    // Get primary currency
    let primary = get_primary_currency_internal(pool.inner()).await?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    // Get all accounts with balances
    let rows = sqlx::query(
        r#"
        SELECT
            a.id,
            a.name,
            a.currency,
            a.initial_balance,
            CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL) as journal_balance
        FROM accounts a
        LEFT JOIN journal_entries je ON je.account_id = a.id
        GROUP BY a.id
        ORDER BY a.name
        "#,
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch account balances: {}", e))?;

    let mut results = Vec::new();

    for row in rows.iter() {
        let currency: String = row.get("currency");
        let initial_balance: f64 = row.get("initial_balance");
        let journal_balance: f64 = row.get("journal_balance");
        let original_balance = initial_balance + journal_balance;

        let (converted_balance, rate_used) = if currency == primary {
            (original_balance, 1.0)
        } else {
            match get_exchange_rate_internal(pool.inner(), &currency, &primary, &today).await {
                Ok(rate) => {
                    let converted = original_balance * rate.rate;
                    let rounded = (converted * 100.0).round() / 100.0;
                    (rounded, rate.rate)
                }
                Err(_) => {
                    // No rate available — return original with rate 0 to signal missing rate
                    (original_balance, 0.0)
                }
            }
        };

        results.push(ConvertedBalance {
            account_id: row.get("id"),
            account_name: row.get("name"),
            original_currency: currency,
            original_balance,
            primary_currency: primary.clone(),
            converted_balance,
            rate_used,
        });
    }

    Ok(results)
}

// ======================== INTERNAL HELPERS ========================

/// Internal helper: get exchange rate without tauri::State wrapper
async fn get_exchange_rate_internal(
    pool: &SqlitePool,
    from: &str,
    to: &str,
    date: &str,
) -> Result<ExchangeRate, String> {
    if from == to {
        return Ok(ExchangeRate {
            id: 0,
            from_currency: from.to_string(),
            to_currency: to.to_string(),
            rate: 1.0,
            effective_date: date.to_string(),
            created_at: String::new(),
            updated_at: String::new(),
        });
    }

    // Try direct rate
    let direct = sqlx::query(
        r#"
        SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
        FROM exchange_rates
        WHERE from_currency = ? AND to_currency = ? AND effective_date <= ?
        ORDER BY effective_date DESC
        LIMIT 1
        "#,
    )
    .bind(from)
    .bind(to)
    .bind(date)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to fetch exchange rate: {}", e))?;

    if let Some(row) = direct {
        return Ok(ExchangeRate {
            id: row.get("id"),
            from_currency: row.get("from_currency"),
            to_currency: row.get("to_currency"),
            rate: row.get("rate"),
            effective_date: row.get("effective_date"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    // Try inverse rate
    let inverse = sqlx::query(
        r#"
        SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
        FROM exchange_rates
        WHERE from_currency = ? AND to_currency = ? AND effective_date <= ?
        ORDER BY effective_date DESC
        LIMIT 1
        "#,
    )
    .bind(to)
    .bind(from)
    .bind(date)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Failed to fetch inverse exchange rate: {}", e))?;

    if let Some(row) = inverse {
        let stored_rate: f64 = row.get("rate");
        if stored_rate <= 0.0 {
            return Err("Stored rate is invalid (zero or negative)".to_string());
        }

        return Ok(ExchangeRate {
            id: row.get("id"),
            from_currency: from.to_string(),
            to_currency: to.to_string(),
            rate: 1.0 / stored_rate,
            effective_date: row.get("effective_date"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        });
    }

    Err(format!(
        "No exchange rate found for {} → {} on or before {}",
        from, to, date
    ))
}

/// Internal helper: get primary currency without tauri::State wrapper
async fn get_primary_currency_internal(pool: &SqlitePool) -> Result<String, String> {
    let row = sqlx::query("SELECT value FROM app_settings WHERE key = 'primary_currency'")
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to fetch primary currency: {}", e))?;

    match row {
        Some(r) => Ok(r.get("value")),
        None => Ok("LKR".to_string()),
    }
}

// ======================== ADDITIONAL STRUCTS ========================

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct ConvertedBalance {
    pub account_id: i64,
    pub account_name: String,
    pub original_currency: String,
    pub original_balance: f64,
    pub primary_currency: String,
    pub converted_balance: f64,
    pub rate_used: f64, // 0.0 means no rate found
}
