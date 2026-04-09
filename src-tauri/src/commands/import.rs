// File: src-tauri/src/commands/import.rs
use crate::models::import::{
    ColumnMapping, CsvPreview, ImportHistoryEntry, ImportOptions, ImportResult,
    ImportValidationResult, MatchSuggestion, RowValidation,
};
use sqlx::{Row, SqlitePool};
use std::collections::HashMap;
use tauri::State;

// ======================== CSV PARSING ========================

/// Read a CSV file and return headers, first 20 rows, total count, and detected delimiter.
#[tauri::command]
pub async fn parse_csv_preview(file_path: String) -> Result<CsvPreview, String> {
    let content = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    // Strip BOM if present
    let text = strip_bom(&content);

    // Auto-detect delimiter
    let delimiter = detect_delimiter(&text);

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(true)
        .flexible(true)
        .from_reader(text.as_bytes());

    let headers: Vec<String> = reader
        .headers()
        .map_err(|e| format!("Failed to read headers: {}", e))?
        .iter()
        .map(|h| h.trim().to_string())
        .collect();

    let mut preview_rows: Vec<Vec<String>> = Vec::new();
    let mut total_rows: i64 = 0;

    for result in reader.records() {
        let record = result.map_err(|e| format!("Failed to read row {}: {}", total_rows + 1, e))?;
        total_rows += 1;

        if preview_rows.len() < 20 {
            let row: Vec<String> = record.iter().map(|f| f.trim().to_string()).collect();
            preview_rows.push(row);
        }
    }

    let delimiter_str = match delimiter {
        b',' => ",".to_string(),
        b';' => ";".to_string(),
        b'\t' => "tab".to_string(),
        _ => ",".to_string(),
    };

    Ok(CsvPreview {
        headers,
        rows: preview_rows,
        total_rows,
        detected_delimiter: delimiter_str,
    })
}

// ======================== VALIDATION ========================

/// Validate all rows against the column mapping and return per-row status.
#[tauri::command]
pub async fn validate_import_mapping(
    pool: State<'_, SqlitePool>,
    file_path: String,
    mapping: ColumnMapping,
) -> Result<ImportValidationResult, String> {
    let content = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let text = strip_bom(&content);
    let delimiter = detect_delimiter(&text);

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(true)
        .flexible(true)
        .from_reader(text.as_bytes());

    // Load existing accounts and categories for matching
    let accounts = load_accounts(pool.inner()).await?;
    let categories = load_categories(pool.inner()).await?;

    // Load existing transactions for duplicate detection
    let existing_txns = load_existing_transaction_keys(pool.inner()).await?;

    let mut rows: Vec<RowValidation> = Vec::new();
    let mut valid_count: i64 = 0;
    let mut warning_count: i64 = 0;
    let mut error_count: i64 = 0;
    let mut unmatched_accounts: HashMap<String, bool> = HashMap::new();
    let mut unmatched_categories: HashMap<String, bool> = HashMap::new();

    let mut row_index: i64 = 0;
    for result in reader.records() {
        let record = match result {
            Ok(r) => r,
            Err(e) => {
                rows.push(RowValidation {
                    row_index,
                    status: "error".to_string(),
                    date: String::new(),
                    amount: 0.0,
                    transaction_type: String::new(),
                    account_name: String::new(),
                    category_name: String::new(),
                    memo: String::new(),
                    error: Some(format!("Parse error: {}", e)),
                    matched_account_id: None,
                    matched_category_id: None,
                });
                error_count += 1;
                row_index += 1;
                continue;
            }
        };

        let fields: Vec<String> = record.iter().map(|f| f.trim().to_string()).collect();

        // Extract date
        let raw_date = fields.get(mapping.date_col).cloned().unwrap_or_default();
        let parsed_date = parse_date(&raw_date, &mapping.date_format);

        // Extract amount
        let raw_amount = fields.get(mapping.amount_col).cloned().unwrap_or_default();
        let parsed_amount = parse_amount(&raw_amount);

        // Determine type
        let (txn_type, final_amount) = if let Some(type_col) = mapping.type_col {
            let raw_type = fields.get(type_col).cloned().unwrap_or_default();
            let t = guess_transaction_type(&raw_type);
            (t, parsed_amount.unwrap_or(0.0).abs())
        } else if mapping.negative_as_expense {
            let amt = parsed_amount.unwrap_or(0.0);
            if amt < 0.0 {
                ("EXPENSE".to_string(), amt.abs())
            } else {
                ("INCOME".to_string(), amt)
            }
        } else {
            ("EXPENSE".to_string(), parsed_amount.unwrap_or(0.0).abs())
        };

        // Extract account name
        let account_name = mapping
            .account_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();

        // Extract category name
        let category_name = mapping
            .category_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();

        // Extract memo
        let memo = mapping
            .memo_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();

        // Validate
        let mut error: Option<String> = None;

        if parsed_date.is_none() {
            error = Some(format!("Invalid date: '{}'", raw_date));
        } else if parsed_amount.is_none() || final_amount <= 0.0 {
            error = Some(format!("Invalid amount: '{}'", raw_amount));
        }

        // Match account
        let matched_account_id = if !account_name.is_empty() {
            let matched = fuzzy_match_name(&account_name, &accounts);
            if matched.is_none() {
                unmatched_accounts.insert(account_name.clone(), true);
            }
            matched
        } else {
            None
        };

        // Match category
        let matched_category_id = if !category_name.is_empty() {
            let matched = fuzzy_match_name(&category_name, &categories);
            if matched.is_none() {
                unmatched_categories.insert(category_name.clone(), true);
            }
            matched
        } else {
            None
        };

        // Duplicate check
        let is_duplicate = if let Some(ref date) = parsed_date {
            let key = format!("{}|{:.2}|{}", date, final_amount, txn_type);
            existing_txns.contains(&key)
        } else {
            false
        };

        let status = if error.is_some() {
            error_count += 1;
            "error".to_string()
        } else if is_duplicate {
            warning_count += 1;
            error = Some("Possible duplicate".to_string());
            "warning".to_string()
        } else {
            valid_count += 1;
            "valid".to_string()
        };

        rows.push(RowValidation {
            row_index,
            status,
            date: parsed_date.unwrap_or(raw_date),
            amount: final_amount,
            transaction_type: txn_type,
            account_name,
            category_name,
            memo,
            error,
            matched_account_id,
            matched_category_id,
        });

        row_index += 1;
    }

    Ok(ImportValidationResult {
        valid_count,
        warning_count,
        error_count,
        rows,
        unmatched_accounts: unmatched_accounts.into_keys().collect(),
        unmatched_categories: unmatched_categories.into_keys().collect(),
    })
}

// ======================== FUZZY MATCHING ========================

/// Return match suggestions for a list of names against accounts or categories.
#[tauri::command]
pub async fn get_import_matches(
    pool: State<'_, SqlitePool>,
    names: Vec<String>,
    match_type: String, // "account" or "category"
) -> Result<Vec<MatchSuggestion>, String> {
    let db_items = if match_type == "account" {
        load_accounts(pool.inner()).await?
    } else {
        load_categories(pool.inner()).await?
    };

    let mut suggestions: Vec<MatchSuggestion> = Vec::new();

    for name in &names {
        let best = find_best_match(name, &db_items);
        suggestions.push(MatchSuggestion {
            name: name.clone(),
            matched_id: best.as_ref().map(|(id, _, _)| *id),
            matched_name: best.as_ref().map(|(_, n, _)| n.clone()),
            score: best.as_ref().map(|(_, _, s)| *s).unwrap_or(0.0),
        });
    }

    Ok(suggestions)
}

// ======================== EXECUTE IMPORT ========================

/// Import all valid rows from the CSV, wrapped in a single DB transaction.
#[tauri::command]
pub async fn execute_import(
    pool: State<'_, SqlitePool>,
    file_path: String,
    mapping: ColumnMapping,
    options: ImportOptions,
) -> Result<ImportResult, String> {
    let content = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let text = strip_bom(&content);
    let delimiter = detect_delimiter(&text);

    let batch_id = uuid::Uuid::new_v4().to_string();
    let can_undo_until = chrono::Utc::now() + chrono::Duration::hours(24);

    // Load existing data for duplicate detection
    let existing_txns = load_existing_transaction_keys(pool.inner()).await?;

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(true)
        .flexible(true)
        .from_reader(text.as_bytes());

    let mut imported: i64 = 0;
    let mut skipped: i64 = 0;
    let mut errors: i64 = 0;
    let mut total_rows: i64 = 0;

    // Start atomic transaction
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Failed to begin transaction: {}", e))?;

    for result in reader.records() {
        total_rows += 1;

        let record = match result {
            Ok(r) => r,
            Err(_) => {
                errors += 1;
                continue;
            }
        };

        let fields: Vec<String> = record.iter().map(|f| f.trim().to_string()).collect();

        // Parse date
        let raw_date = fields.get(mapping.date_col).cloned().unwrap_or_default();
        let date = match parse_date(&raw_date, &mapping.date_format) {
            Some(d) => d,
            None => {
                errors += 1;
                continue;
            }
        };

        // Parse amount
        let raw_amount = fields.get(mapping.amount_col).cloned().unwrap_or_default();
        let parsed_amount = match parse_amount(&raw_amount) {
            Some(a) => a,
            None => {
                errors += 1;
                continue;
            }
        };

        // Determine type and final amount
        let (txn_type, amount) = if let Some(type_col) = mapping.type_col {
            let raw_type = fields.get(type_col).cloned().unwrap_or_default();
            (guess_transaction_type(&raw_type), parsed_amount.abs())
        } else if mapping.negative_as_expense {
            if parsed_amount < 0.0 {
                ("EXPENSE".to_string(), parsed_amount.abs())
            } else {
                ("INCOME".to_string(), parsed_amount)
            }
        } else {
            ("EXPENSE".to_string(), parsed_amount.abs())
        };

        if amount <= 0.0 {
            errors += 1;
            continue;
        }

        // Duplicate check
        if options.skip_duplicates {
            let key = format!("{}|{:.2}|{}", date, amount, txn_type);
            if existing_txns.contains(&key) {
                skipped += 1;
                continue;
            }
        }

        // Resolve account
        let account_name = mapping
            .account_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();
        let account_id = if !account_name.is_empty() {
            options
                .account_mapping
                .get(&account_name)
                .copied()
                .unwrap_or(options.default_account_id)
        } else {
            options.default_account_id
        };

        // Resolve category
        let category_name = mapping
            .category_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();
        let category_id: Option<i64> = if !category_name.is_empty() {
            if let Some(&id) = options.category_mapping.get(&category_name) {
                Some(id)
            } else if options.create_missing_categories {
                // Create the category on the fly
                let cat_type = if txn_type == "INCOME" {
                    "INCOME"
                } else {
                    "EXPENSE"
                };
                let result = sqlx::query(
                    "INSERT INTO categories (name, type) VALUES (?, ?)"
                )
                .bind(&category_name)
                .bind(cat_type)
                .execute(&mut *tx)
                .await;

                match result {
                    Ok(r) => Some(r.last_insert_rowid()),
                    Err(_) => {
                        // Category might already exist (race or re-import)
                        let existing = sqlx::query("SELECT id FROM categories WHERE name = ?")
                            .bind(&category_name)
                            .fetch_optional(&mut *tx)
                            .await
                            .ok()
                            .flatten();
                        existing.map(|r| r.get::<i64, _>("id"))
                    }
                }
            } else {
                None
            }
        } else {
            None
        };

        // Memo
        let memo = mapping
            .memo_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();
        let memo_val = if memo.is_empty() { None } else { Some(memo) };

        // Insert transaction with import_batch_id
        let result = sqlx::query(
            "INSERT INTO transactions (date, type, amount, account_id, category_id, memo, import_batch_id)
             VALUES (?, ?, ?, ?, ?, ?, ?)",
        )
        .bind(&date)
        .bind(&txn_type)
        .bind(amount)
        .bind(account_id)
        .bind(category_id)
        .bind(&memo_val)
        .bind(&batch_id)
        .execute(&mut *tx)
        .await;

        let txn_id = match result {
            Ok(r) => r.last_insert_rowid(),
            Err(e) => {
                eprintln!("Failed to import row {}: {}", total_rows, e);
                errors += 1;
                continue;
            }
        };

        // Create journal entries (same logic as create_transaction)
        match txn_type.as_str() {
            "INCOME" => {
                let _ = sqlx::query(
                    "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, 0)",
                )
                .bind(txn_id)
                .bind(account_id)
                .bind(amount)
                .execute(&mut *tx)
                .await;
            }
            "EXPENSE" => {
                let _ = sqlx::query(
                    "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, 0, ?)",
                )
                .bind(txn_id)
                .bind(account_id)
                .bind(amount)
                .execute(&mut *tx)
                .await;
            }
            _ => {}
        }

        imported += 1;
    }

    // Log to import_history
    sqlx::query(
        "INSERT INTO import_history (batch_id, filename, total_rows, imported_count, skipped_count, error_count, status, can_undo_until)
         VALUES (?, ?, ?, ?, ?, ?, 'COMPLETED', ?)",
    )
    .bind(&batch_id)
    .bind(&file_path)
    .bind(total_rows)
    .bind(imported)
    .bind(skipped)
    .bind(errors)
    .bind(can_undo_until.to_rfc3339())
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to log import history: {}", e))?;

    // Commit everything
    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit import: {}", e))?;

    Ok(ImportResult {
        batch_id,
        imported,
        skipped,
        errors,
    })
}

// ======================== UNDO & HISTORY ========================

/// Delete all transactions from a specific import batch (within 24h window).
#[tauri::command]
pub async fn undo_import(
    pool: State<'_, SqlitePool>,
    batch_id: String,
) -> Result<i64, String> {
    // Check the history entry exists and is within undo window
    let history = sqlx::query(
        "SELECT id, status, can_undo_until FROM import_history WHERE batch_id = ?",
    )
    .bind(&batch_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Import batch not found".to_string())?;

    let status: String = history.get("status");
    if status == "UNDONE" {
        return Err("This import has already been undone".to_string());
    }

    let can_undo_until: String = history.get("can_undo_until");
    let deadline = chrono::DateTime::parse_from_rfc3339(&can_undo_until)
        .map_err(|_| "Invalid undo deadline".to_string())?;

    if chrono::Utc::now() > deadline {
        return Err("Undo window has expired (24 hours)".to_string());
    }

    // Delete all transactions with this batch_id (CASCADE removes journal entries)
    let result = sqlx::query("DELETE FROM transactions WHERE import_batch_id = ?")
        .bind(&batch_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to undo import: {}", e))?;

    let deleted = result.rows_affected() as i64;

    // Update history status
    sqlx::query("UPDATE import_history SET status = 'UNDONE' WHERE batch_id = ?")
        .bind(&batch_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update import history: {}", e))?;

    Ok(deleted)
}

/// Get all past imports with their undo status.
#[tauri::command]
pub async fn get_import_history(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<ImportHistoryEntry>, String> {
    let rows = sqlx::query(
        "SELECT id, batch_id, filename, total_rows, imported_count, skipped_count, error_count,
                status, imported_at, can_undo_until
         FROM import_history
         ORDER BY imported_at DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch import history: {}", e))?;

    let now = chrono::Utc::now();

    Ok(rows
        .iter()
        .map(|row| {
            let can_undo_until: String = row.get("can_undo_until");
            let status: String = row.get("status");
            let can_undo = status == "COMPLETED"
                && chrono::DateTime::parse_from_rfc3339(&can_undo_until)
                    .map(|d| now < d)
                    .unwrap_or(false);

            ImportHistoryEntry {
                id: row.get("id"),
                batch_id: row.get("batch_id"),
                filename: row.get("filename"),
                total_rows: row.get("total_rows"),
                imported_count: row.get("imported_count"),
                skipped_count: row.get("skipped_count"),
                error_count: row.get("error_count"),
                status,
                imported_at: row.get("imported_at"),
                can_undo,
            }
        })
        .collect())
}

// ======================== INTERNAL HELPERS ========================

fn strip_bom(content: &[u8]) -> String {
    let text = String::from_utf8_lossy(content);
    if text.starts_with('\u{FEFF}') {
        text[3..].to_string()
    } else {
        text.to_string()
    }
}

fn detect_delimiter(text: &str) -> u8 {
    let first_line = text.lines().next().unwrap_or("");

    let comma_count = first_line.matches(',').count();
    let semicolon_count = first_line.matches(';').count();
    let tab_count = first_line.matches('\t').count();

    if tab_count > comma_count && tab_count > semicolon_count {
        b'\t'
    } else if semicolon_count > comma_count {
        b';'
    } else {
        b','
    }
}

fn parse_date(raw: &str, format: &str) -> Option<String> {
    let trimmed = raw.trim().trim_matches('"');
    if trimmed.is_empty() {
        return None;
    }

    // Try the user-specified format first
    let chrono_fmt = format
        .replace("YYYY", "%Y")
        .replace("MM", "%m")
        .replace("DD", "%d");

    if let Ok(d) = chrono::NaiveDate::parse_from_str(trimmed, &chrono_fmt) {
        return Some(d.format("%Y-%m-%d").to_string());
    }

    // Fallback: try common formats
    let formats = ["%Y-%m-%d", "%m/%d/%Y", "%d/%m/%Y", "%Y/%m/%d", "%d-%m-%Y"];
    for fmt in &formats {
        if let Ok(d) = chrono::NaiveDate::parse_from_str(trimmed, fmt) {
            return Some(d.format("%Y-%m-%d").to_string());
        }
    }

    None
}

fn parse_amount(raw: &str) -> Option<f64> {
    let cleaned = raw
        .trim()
        .trim_matches('"')
        .replace(',', "") // Remove thousand separators
        .replace(' ', "")
        .replace('$', "")
        .replace('€', "")
        .replace('£', "")
        .replace("LKR", "")
        .replace("Rs", "")
        .replace("Rs.", "");

    cleaned.parse::<f64>().ok()
}

fn guess_transaction_type(raw: &str) -> String {
    let lower = raw.trim().to_lowercase();
    if lower.contains("income")
        || lower.contains("credit")
        || lower.contains("deposit")
        || lower == "in"
    {
        "INCOME".to_string()
    } else if lower.contains("transfer") || lower.contains("xfer") {
        "TRANSFER".to_string()
    } else {
        "EXPENSE".to_string()
    }
}

async fn load_accounts(pool: &SqlitePool) -> Result<Vec<(i64, String)>, String> {
    let rows = sqlx::query("SELECT id, name FROM accounts ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to load accounts: {}", e))?;

    Ok(rows
        .iter()
        .map(|r| (r.get::<i64, _>("id"), r.get::<String, _>("name")))
        .collect())
}

async fn load_categories(pool: &SqlitePool) -> Result<Vec<(i64, String)>, String> {
    let rows = sqlx::query("SELECT id, name FROM categories ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to load categories: {}", e))?;

    Ok(rows
        .iter()
        .map(|r| (r.get::<i64, _>("id"), r.get::<String, _>("name")))
        .collect())
}

async fn load_existing_transaction_keys(pool: &SqlitePool) -> Result<std::collections::HashSet<String>, String> {
    let rows = sqlx::query("SELECT date, amount, type FROM transactions")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to load existing transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|r| {
            let date: String = r.get("date");
            let amount: f64 = r.get("amount");
            let txn_type: String = r.get("type");
            format!("{}|{:.2}|{}", date, amount, txn_type)
        })
        .collect())
}

fn fuzzy_match_name(input: &str, items: &[(i64, String)]) -> Option<i64> {
    let input_lower = input.trim().to_lowercase();

    // Exact match
    for (id, name) in items {
        if name.to_lowercase() == input_lower {
            return Some(*id);
        }
    }

    // Contains match
    for (id, name) in items {
        let name_lower = name.to_lowercase();
        if name_lower.contains(&input_lower) || input_lower.contains(&name_lower) {
            return Some(*id);
        }
    }

    None
}

fn find_best_match(input: &str, items: &[(i64, String)]) -> Option<(i64, String, f64)> {
    let input_lower = input.trim().to_lowercase();

    // Exact match = 1.0
    for (id, name) in items {
        if name.to_lowercase() == input_lower {
            return Some((*id, name.clone(), 1.0));
        }
    }

    // Contains match = 0.7
    for (id, name) in items {
        let name_lower = name.to_lowercase();
        if name_lower.contains(&input_lower) || input_lower.contains(&name_lower) {
            return Some((*id, name.clone(), 0.7));
        }
    }

    // Starts-with match = 0.5
    for (id, name) in items {
        let name_lower = name.to_lowercase();
        if name_lower.starts_with(&input_lower) || input_lower.starts_with(&name_lower) {
            return Some((*id, name.clone(), 0.5));
        }
    }

    None
}
