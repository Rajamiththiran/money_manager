// File: src-tauri/src/commands/currencies.rs
use crate::models::currency::{
    CurrencyConversion, ExchangeRate, ExchangeRateSummary, SetExchangeRateInput, SupportedCurrency,
};
use crate::AppState;
use rusqlite::{params, OptionalExtension};
use serde::Serialize;
use tauri::State;

// ======================== SUPPORTED CURRENCIES ========================

#[tauri::command]
pub fn get_supported_currencies() -> Result<Vec<SupportedCurrency>, String> {
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

#[tauri::command]
pub fn get_primary_currency(state: State<'_, AppState>) -> Result<String, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    get_primary_currency_internal(&conn)
}

#[tauri::command]
pub fn set_primary_currency(
    state: State<'_, AppState>,
    currency_code: String,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let code = currency_code.trim().to_uppercase();
    if code.is_empty() || code.len() != 3 {
        return Err("Currency code must be a 3-letter code (e.g., LKR, USD)".to_string());
    }

    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES ('primary_currency', ?1, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        "#,
        params![code],
    ).map_err(|e| format!("Failed to set primary currency: {}", e))?;

    Ok(())
}

// ======================== EXCHANGE RATE CRUD ========================

#[tauri::command]
pub fn set_exchange_rate(
    state: State<'_, AppState>,
    input: SetExchangeRateInput,
) -> Result<i64, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

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

    if chrono::NaiveDate::parse_from_str(&input.effective_date, "%Y-%m-%d").is_err() {
        return Err("Invalid date format. Use YYYY-MM-DD".to_string());
    }

    conn.execute(
        r#"
        INSERT INTO exchange_rates (from_currency, to_currency, rate, effective_date, updated_at)
        VALUES (?1, ?2, ?3, ?4, datetime('now'))
        ON CONFLICT(from_currency, to_currency, effective_date)
        DO UPDATE SET rate = excluded.rate, updated_at = datetime('now')
        "#,
        params![from, to, input.rate, input.effective_date],
    ).map_err(|e| format!("Failed to set exchange rate: {}", e))?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn get_exchange_rate(
    state: State<'_, AppState>,
    from_currency: String,
    to_currency: String,
    date: String,
) -> Result<ExchangeRate, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    get_exchange_rate_internal(&conn, &from_currency, &to_currency, &date)
}

#[tauri::command]
pub fn get_exchange_rates(
    state: State<'_, AppState>,
    from_currency: Option<String>,
    to_currency: Option<String>,
    limit: Option<i32>,
) -> Result<Vec<ExchangeRate>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let query_limit = limit.unwrap_or(100);

    let rates = match (&from_currency, &to_currency) {
        (Some(from), Some(to)) => {
            let mut stmt = conn.prepare(
                r#"
                SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
                FROM exchange_rates
                WHERE from_currency = ?1 AND to_currency = ?2
                ORDER BY effective_date DESC
                LIMIT ?3
                "#,
            ).unwrap();
            stmt.query_map(params![from.trim().to_uppercase(), to.trim().to_uppercase(), query_limit], row_to_exchange_rate)
                .unwrap().filter_map(Result::ok).collect()
        }
        (Some(from), None) => {
            let mut stmt = conn.prepare(
                r#"
                SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
                FROM exchange_rates
                WHERE from_currency = ?1
                ORDER BY effective_date DESC
                LIMIT ?2
                "#,
            ).unwrap();
            stmt.query_map(params![from.trim().to_uppercase(), query_limit], row_to_exchange_rate)
                .unwrap().filter_map(Result::ok).collect()
        }
        _ => {
            let mut stmt = conn.prepare(
                r#"
                SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
                FROM exchange_rates
                ORDER BY effective_date DESC
                LIMIT ?1
                "#,
            ).unwrap();
            stmt.query_map(params![query_limit], row_to_exchange_rate)
                .unwrap().filter_map(Result::ok).collect()
        }
    };

    Ok(rates)
}

fn row_to_exchange_rate(row: &rusqlite::Row) -> rusqlite::Result<ExchangeRate> {
    Ok(ExchangeRate {
        id: row.get(0)?,
        from_currency: row.get(1)?,
        to_currency: row.get(2)?,
        rate: row.get(3)?,
        effective_date: row.get(4)?,
        created_at: row.get(5)?,
        updated_at: row.get(6)?,
    })
}

#[tauri::command]
pub fn delete_exchange_rate(state: State<'_, AppState>, rate_id: i64) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let rows_affected = conn.execute("DELETE FROM exchange_rates WHERE id = ?1", params![rate_id])
        .map_err(|e| format!("Failed to delete exchange rate: {}", e))?;

    if rows_affected == 0 {
        return Err("Exchange rate not found".to_string());
    }

    Ok(())
}

// ======================== CURRENCY CONVERSION ========================

#[tauri::command]
pub fn convert_amount(
    state: State<'_, AppState>,
    amount: f64,
    from_currency: String,
    to_currency: String,
    date: String,
) -> Result<CurrencyConversion, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    if amount < 0.0 {
        return Err("Amount must be non-negative".to_string());
    }

    let from = from_currency.trim().to_uppercase();
    let to = to_currency.trim().to_uppercase();

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

    let rate = get_exchange_rate_internal(&conn, &from, &to, &date)?;

    let converted = amount * rate.rate;

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

#[tauri::command]
pub fn get_exchange_rate_summaries(
    state: State<'_, AppState>,
) -> Result<Vec<ExchangeRateSummary>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
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
    ).map_err(|e| format!("Query error: {}", e))?;

    let summaries = stmt.query_map([], |row| {
        Ok(ExchangeRateSummary {
            from_currency: row.get(0)?,
            to_currency: row.get(1)?,
            latest_rate: row.get(2)?,
            latest_date: row.get(3)?,
            rate_count: row.get(4)?,
        })
    }).unwrap().filter_map(Result::ok).collect();

    Ok(summaries)
}

// ======================== BULK CONVERSION ========================

#[tauri::command]
pub fn convert_balances_to_primary(
    state: State<'_, AppState>,
) -> Result<Vec<ConvertedBalance>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let primary = get_primary_currency_internal(&conn)?;
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();

    let mut stmt = conn.prepare(
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
    ).map_err(|e| format!("Query error: {}", e))?;

    let rows: Vec<(i64, String, String, f64, f64)> = stmt.query_map([], |row| {
        Ok((
            row.get(0)?,
            row.get(1)?,
            row.get(2)?,
            row.get(3)?,
            row.get(4)?,
        ))
    }).unwrap().filter_map(Result::ok).collect();

    let mut results = Vec::new();

    for (id, name, currency, initial_balance, journal_balance) in rows {
        let original_balance = initial_balance + journal_balance;

        let (converted_balance, rate_used) = if currency == primary {
            (original_balance, 1.0)
        } else {
            match get_exchange_rate_internal(&conn, &currency, &primary, &today) {
                Ok(rate) => {
                    let converted = original_balance * rate.rate;
                    let rounded = (converted * 100.0).round() / 100.0;
                    (rounded, rate.rate)
                }
                Err(_) => (original_balance, 0.0),
            }
        };

        results.push(ConvertedBalance {
            account_id: id,
            account_name: name,
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

fn get_exchange_rate_internal(
    conn: &rusqlite::Connection,
    from: &str,
    to: &str,
    date: &str,
) -> Result<ExchangeRate, String> {
    let from = from.trim().to_uppercase();
    let to = to.trim().to_uppercase();

    if from == to {
        return Ok(ExchangeRate {
            id: 0,
            from_currency: from,
            to_currency: to,
            rate: 1.0,
            effective_date: date.to_string(),
            created_at: String::new(),
            updated_at: String::new(),
        });
    }

    let mut direct_stmt = conn.prepare(
        r#"
        SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
        FROM exchange_rates
        WHERE from_currency = ?1 AND to_currency = ?2 AND effective_date <= ?3
        ORDER BY effective_date DESC
        LIMIT 1
        "#,
    ).unwrap();

    let direct = direct_stmt.query_row(params![from, to, date], row_to_exchange_rate).optional().unwrap_or(None);

    if let Some(rate) = direct {
        return Ok(rate);
    }

    let mut inverse_stmt = conn.prepare(
        r#"
        SELECT id, from_currency, to_currency, rate, effective_date, created_at, updated_at
        FROM exchange_rates
        WHERE from_currency = ?1 AND to_currency = ?2 AND effective_date <= ?3
        ORDER BY effective_date DESC
        LIMIT 1
        "#,
    ).unwrap();

    let inverse = inverse_stmt.query_row(params![to, from, date], row_to_exchange_rate).optional().unwrap_or(None);

    if let Some(mut rate) = inverse {
        if rate.rate <= 0.0 {
            return Err("Stored rate is invalid (zero or negative)".to_string());
        }

        rate.from_currency = from;
        rate.to_currency = to;
        rate.rate = 1.0 / rate.rate;

        return Ok(rate);
    }

    Err(format!(
        "No exchange rate found for {} → {} on or before {}",
        from, to, date
    ))
}

fn get_primary_currency_internal(conn: &rusqlite::Connection) -> Result<String, String> {
    let mut stmt = conn.prepare("SELECT value FROM app_settings WHERE key = 'primary_currency'").unwrap();
    let val: Option<String> = stmt.query_row([], |row| row.get(0)).optional().unwrap_or(None);

    Ok(val.unwrap_or_else(|| "LKR".to_string()))
}

// ======================== ADDITIONAL STRUCTS ========================

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
