// File: src-tauri/src/commands/import.rs
use crate::models::import::{
    ColumnMapping, CsvPreview, ImportHistoryEntry, ImportOptions, ImportResult,
    ImportValidationResult, MatchSuggestion, RowValidation,
};
use crate::AppState;
use rusqlite::params;
use std::collections::HashMap;
use tauri::State;
use crate::models::advanced::CategorizationRule;
use regex::Regex;

// ======================== CSV PARSING ========================

#[tauri::command]
pub fn parse_csv_preview(file_path: String) -> Result<CsvPreview, String> {
    let content = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;

    let text = strip_bom(&content);
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

#[tauri::command]
pub fn validate_import_mapping(
    state: State<'_, AppState>,
    file_path: String,
    mapping: ColumnMapping,
) -> Result<ImportValidationResult, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let content = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let text = strip_bom(&content);
    let delimiter = detect_delimiter(&text);

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(true)
        .flexible(true)
        .from_reader(text.as_bytes());

    let accounts = load_accounts(&conn)?;
    let categories = load_categories(&conn)?;
    let existing_txns = load_existing_transaction_keys(&conn)?;
    let rules = load_categorization_rules(&conn)?;

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

        let raw_date = fields.get(mapping.date_col).cloned().unwrap_or_default();
        let parsed_date = parse_date(&raw_date, &mapping.date_format);

        let raw_amount = fields.get(mapping.amount_col).cloned().unwrap_or_default();
        let parsed_amount = parse_amount(&raw_amount);

        let mut final_type = String::new();
        let mut final_amount = 0.0;

        if let Some(credit_col) = mapping.credit_col {
            let raw_credit = fields.get(credit_col).cloned().unwrap_or_default();
            if let Some(c) = parse_amount(&raw_credit) {
                if c > 0.0 {
                    final_type = "INCOME".to_string();
                    final_amount = c;
                }
            }
            if final_amount == 0.0 {
                if let Some(d) = parsed_amount {
                    final_type = "EXPENSE".to_string();
                    final_amount = d.abs();
                }
            }
        } else if let Some(type_col) = mapping.type_col {
            let raw_type = fields.get(type_col).cloned().unwrap_or_default();
            final_type = guess_transaction_type(&raw_type);
            final_amount = parsed_amount.unwrap_or(0.0).abs();
        } else if mapping.negative_as_expense {
            let amt = parsed_amount.unwrap_or(0.0);
            if amt < 0.0 {
                final_type = "EXPENSE".to_string();
                final_amount = amt.abs();
            } else {
                final_type = "INCOME".to_string();
                final_amount = amt;
            }
        } else {
            final_type = "EXPENSE".to_string();
            final_amount = parsed_amount.unwrap_or(0.0).abs();
        };

        let txn_type = final_type;

        let account_name = mapping
            .account_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();

        let category_name = mapping
            .category_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();

        let memo = mapping
            .memo_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();

        let mut error: Option<String> = None;

        if parsed_date.is_none() {
            error = Some(format!("Invalid date: '{}'", raw_date));
        } else if final_amount <= 0.0 {
            error = Some("Invalid amount (empty or zero)".to_string());
        }

        let matched_account_id = if !account_name.is_empty() {
            let matched = fuzzy_match_name(&account_name, &accounts);
            if matched.is_none() {
                unmatched_accounts.insert(account_name.clone(), true);
            }
            matched
        } else {
            None
        };

        let mut matched_category_id = None;
        let mut final_category_name = category_name.clone();

        // 1. Try to apply user-defined categorization rules against the memo
        if matched_category_id.is_none() && !memo.is_empty() {
            if let Some((cat_id, cat_name)) = apply_categorization_rules(&memo, &rules, &categories) {
                matched_category_id = Some(cat_id);
                final_category_name = cat_name;
            }
        }

        // 2. Try to apply rules against the raw category name if present
        if matched_category_id.is_none() && !category_name.is_empty() {
            if let Some((cat_id, cat_name)) = apply_categorization_rules(&category_name, &rules, &categories) {
                matched_category_id = Some(cat_id);
                final_category_name = cat_name;
            }
        }

        // 3. Fallback to fuzzy matching the category name
        if matched_category_id.is_none() && !category_name.is_empty() {
            let matched = fuzzy_match_name(&category_name, &categories);
            if matched.is_none() {
                unmatched_categories.insert(category_name.clone(), true);
            }
            matched_category_id = matched;
            if matched_category_id.is_some() {
                // Find the real category name
                if let Some(name) = categories.iter().find(|(id, _)| Some(*id) == matched_category_id).map(|(_, n)| n.clone()) {
                    final_category_name = name;
                }
            }
        }

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
            category_name: final_category_name,
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

#[tauri::command]
pub fn get_import_matches(
    state: State<'_, AppState>,
    names: Vec<String>,
    match_type: String,
) -> Result<Vec<MatchSuggestion>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let db_items = if match_type == "account" {
        load_accounts(&conn)?
    } else {
        load_categories(&conn)?
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

#[tauri::command]
pub fn execute_import(
    state: State<'_, AppState>,
    file_path: String,
    mapping: ColumnMapping,
    options: ImportOptions,
) -> Result<ImportResult, String> {
    let pool = crate::get_db(&state)?;
    let mut conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let content = std::fs::read(&file_path)
        .map_err(|e| format!("Failed to read file: {}", e))?;
    let text = strip_bom(&content);
    let delimiter = detect_delimiter(&text);

    let batch_id = uuid::Uuid::new_v4().to_string();
    let can_undo_until = chrono::Utc::now() + chrono::Duration::hours(24);

    let existing_txns = load_existing_transaction_keys(&conn)?;

    let mut reader = csv::ReaderBuilder::new()
        .delimiter(delimiter)
        .has_headers(true)
        .flexible(true)
        .from_reader(text.as_bytes());

    let mut imported: i64 = 0;
    let mut skipped: i64 = 0;
    let mut errors: i64 = 0;
    let mut total_rows: i64 = 0;

    let tx = conn.transaction().map_err(|e| format!("Failed to begin transaction: {}", e))?;

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

        let raw_date = fields.get(mapping.date_col).cloned().unwrap_or_default();
        let date = match parse_date(&raw_date, &mapping.date_format) {
            Some(d) => d,
            None => {
                errors += 1;
                continue;
            }
        };

        let raw_amount = fields.get(mapping.amount_col).cloned().unwrap_or_default();
        let parsed_amount = parse_amount(&raw_amount);

        let mut final_type = String::new();
        let mut amount = 0.0;

        if let Some(credit_col) = mapping.credit_col {
            let raw_credit = fields.get(credit_col).cloned().unwrap_or_default();
            if let Some(c) = parse_amount(&raw_credit) {
                if c > 0.0 {
                    final_type = "INCOME".to_string();
                    amount = c;
                }
            }
            if amount == 0.0 {
                if let Some(d) = parsed_amount {
                    final_type = "EXPENSE".to_string();
                    amount = d.abs();
                }
            }
        } else if let Some(type_col) = mapping.type_col {
            let raw_type = fields.get(type_col).cloned().unwrap_or_default();
            final_type = guess_transaction_type(&raw_type);
            amount = parsed_amount.unwrap_or(0.0).abs();
        } else if mapping.negative_as_expense {
            let amt = parsed_amount.unwrap_or(0.0);
            if amt < 0.0 {
                final_type = "EXPENSE".to_string();
                amount = amt.abs();
            } else {
                final_type = "INCOME".to_string();
                amount = amt;
            }
        } else {
            final_type = "EXPENSE".to_string();
            amount = parsed_amount.unwrap_or(0.0).abs();
        };

        let txn_type = final_type;

        if amount <= 0.0 {
            errors += 1;
            continue;
        }

        if options.skip_duplicates {
            let key = format!("{}|{:.2}|{}", date, amount, txn_type);
            if existing_txns.contains(&key) {
                skipped += 1;
                continue;
            }
        }

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

        let category_name = mapping
            .category_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();
        let category_id: Option<i64> = if !category_name.is_empty() {
            if let Some(&id) = options.category_mapping.get(&category_name) {
                Some(id)
            } else if options.create_missing_categories {
                let cat_type = if txn_type == "INCOME" {
                    "INCOME"
                } else {
                    "EXPENSE"
                };

                let result = tx.execute(
                    "INSERT INTO categories (name, type) VALUES (?1, ?2)",
                    params![category_name, cat_type],
                );

                match result {
                    Ok(_) => Some(tx.last_insert_rowid()),
                    Err(_) => {
                        let mut stmt = tx.prepare("SELECT id FROM categories WHERE name = ?1").unwrap();
                        let existing: Option<i64> = stmt.query_row(params![category_name], |row| row.get(0)).ok();
                        existing
                    }
                }
            } else {
                None
            }
        } else {
            None
        };

        let memo = mapping
            .memo_col
            .and_then(|col| fields.get(col).cloned())
            .unwrap_or_default();
        let memo_val = if memo.is_empty() { None } else { Some(memo) };

        let result = tx.execute(
            "INSERT INTO transactions (date, type, amount, account_id, category_id, memo, import_batch_id)
             VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![date, txn_type, amount, account_id, category_id, memo_val, batch_id],
        );

        let txn_id = match result {
            Ok(_) => tx.last_insert_rowid(),
            Err(e) => {
                eprintln!("Failed to import row {}: {}", total_rows, e);
                errors += 1;
                continue;
            }
        };

        match txn_type.as_str() {
            "INCOME" => {
                let _ = tx.execute(
                    "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?1, ?2, ?3, 0)",
                    params![txn_id, account_id, amount],
                );
            }
            "EXPENSE" => {
                let _ = tx.execute(
                    "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?1, ?2, 0, ?3)",
                    params![txn_id, account_id, amount],
                );
            }
            _ => {}
        }

        imported += 1;
    }

    tx.execute(
        "INSERT INTO import_history (batch_id, filename, total_rows, imported_count, skipped_count, error_count, status, can_undo_until)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, 'COMPLETED', ?7)",
        params![batch_id, file_path, total_rows, imported, skipped, errors, can_undo_until.to_rfc3339()],
    ).map_err(|e| format!("Failed to log import history: {}", e))?;

    tx.commit().map_err(|e| format!("Failed to commit import: {}", e))?;

    Ok(ImportResult {
        batch_id,
        imported,
        skipped,
        errors,
    })
}

// ======================== UNDO & HISTORY ========================

#[tauri::command]
pub fn undo_import(
    state: State<'_, AppState>,
    batch_id: String,
) -> Result<i64, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, status, can_undo_until FROM import_history WHERE batch_id = ?1",
    ).map_err(|e| format!("Database error: {}", e))?;

    let history = stmt.query_row(params![batch_id], |row| {
        Ok((row.get::<_, String>(1)?, row.get::<_, String>(2)?))
    }).ok();

    let (status, can_undo_until) = history.ok_or_else(|| "Import batch not found".to_string())?;

    if status == "UNDONE" {
        return Err("This import has already been undone".to_string());
    }

    let deadline = chrono::DateTime::parse_from_rfc3339(&can_undo_until)
        .map_err(|_| "Invalid undo deadline".to_string())?;

    if chrono::Utc::now() > deadline {
        return Err("Undo window has expired (24 hours)".to_string());
    }

    let deleted = conn.execute("DELETE FROM transactions WHERE import_batch_id = ?1", params![batch_id])
        .map_err(|e| format!("Failed to undo import: {}", e))? as i64;

    conn.execute("UPDATE import_history SET status = 'UNDONE' WHERE batch_id = ?1", params![batch_id])
        .map_err(|e| format!("Failed to update import history: {}", e))?;

    Ok(deleted)
}

#[tauri::command]
pub fn get_import_history(
    state: State<'_, AppState>,
) -> Result<Vec<ImportHistoryEntry>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
        "SELECT id, batch_id, filename, total_rows, imported_count, skipped_count, error_count,
                status, imported_at, can_undo_until
         FROM import_history
         ORDER BY imported_at DESC",
    ).map_err(|e| format!("Database error: {}", e))?;

    let rows: Vec<ImportHistoryEntry> = stmt.query_map([], |row| {
        let status: String = row.get(7)?;
        let can_undo_until: String = row.get(9)?;
        let now = chrono::Utc::now();
        let can_undo = status == "COMPLETED"
            && chrono::DateTime::parse_from_rfc3339(&can_undo_until)
                .map(|d| now < d)
                .unwrap_or(false);

        Ok(ImportHistoryEntry {
            id: row.get(0)?,
            batch_id: row.get(1)?,
            filename: row.get(2)?,
            total_rows: row.get(3)?,
            imported_count: row.get(4)?,
            skipped_count: row.get(5)?,
            error_count: row.get(6)?,
            status,
            imported_at: row.get(8)?,
            can_undo,
        })
    }).unwrap().filter_map(Result::ok).collect();

    Ok(rows)
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

    let chrono_fmt = format
        .replace("YYYY", "%Y")
        .replace("MM", "%m")
        .replace("DD", "%d");

    if let Ok(d) = chrono::NaiveDate::parse_from_str(trimmed, &chrono_fmt) {
        return Some(d.format("%Y-%m-%d").to_string());
    }

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
        .replace(',', "")
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

fn load_accounts(conn: &rusqlite::Connection) -> Result<Vec<(i64, String)>, String> {
    let mut stmt = conn.prepare("SELECT id, name FROM accounts ORDER BY name").unwrap();
    let rows: Vec<(i64, String)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?))).unwrap().filter_map(Result::ok).collect();
    Ok(rows)
}

fn load_categories(conn: &rusqlite::Connection) -> Result<Vec<(i64, String)>, String> {
    let mut stmt = conn.prepare("SELECT id, name FROM categories ORDER BY name").unwrap();
    let rows: Vec<(i64, String)> = stmt.query_map([], |row| Ok((row.get(0)?, row.get(1)?))).unwrap().filter_map(Result::ok).collect();
    Ok(rows)
}

fn load_existing_transaction_keys(conn: &rusqlite::Connection) -> Result<std::collections::HashSet<String>, String> {
    let mut stmt = conn.prepare("SELECT date, amount, type FROM transactions").unwrap();
    let rows: std::collections::HashSet<String> = stmt.query_map([], |row| {
        let date: String = row.get(0)?;
        let amount: f64 = row.get(1)?;
        let txn_type: String = row.get(2)?;
        Ok(format!("{}|{:.2}|{}", date, amount, txn_type))
    }).unwrap().filter_map(Result::ok).collect();
    Ok(rows)
}

fn load_categorization_rules(conn: &rusqlite::Connection) -> Result<Vec<CategorizationRule>, String> {
    let mut stmt = conn.prepare(
        "SELECT id, match_pattern, match_type, category_id, priority, created_at, updated_at 
         FROM categorization_rules ORDER BY priority DESC"
    ).map_err(|e| format!("Query error: {}", e))?;

    let rules = stmt.query_map([], |row| {
        Ok(CategorizationRule {
            id: row.get(0)?,
            match_pattern: row.get(1)?,
            match_type: row.get(2)?,
            category_id: row.get(3)?,
            priority: row.get(4)?,
            created_at: row.get(5)?,
            updated_at: row.get(6)?,
        })
    }).unwrap().filter_map(Result::ok).collect();
    
    Ok(rules)
}

fn apply_categorization_rules(text: &str, rules: &[CategorizationRule], categories: &[(i64, String)]) -> Option<(i64, String)> {
    let text_lower = text.to_lowercase();
    
    for rule in rules {
        let matched = match rule.match_type.as_str() {
            "exact" => text_lower == rule.match_pattern.to_lowercase(),
            "contains" => text_lower.contains(&rule.match_pattern.to_lowercase()),
            "starts_with" => text_lower.starts_with(&rule.match_pattern.to_lowercase()),
            "regex" => {
                if let Ok(re) = Regex::new(&rule.match_pattern) {
                    re.is_match(text)
                } else {
                    false
                }
            },
            _ => false,
        };

        if matched {
            if let Ok(cat_id) = rule.category_id.parse::<i64>() {
                if let Some((_, name)) = categories.iter().find(|(id, _)| *id == cat_id) {
                    return Some((cat_id, name.clone()));
                }
            }
        }
    }
    None
}

fn fuzzy_match_name(input: &str, items: &[(i64, String)]) -> Option<i64> {
    let input_lower = input.trim().to_lowercase();

    for (id, name) in items {
        if name.to_lowercase() == input_lower {
            return Some(*id);
        }
    }

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

    for (id, name) in items {
        if name.to_lowercase() == input_lower {
            return Some((*id, name.clone(), 1.0));
        }
    }

    for (id, name) in items {
        let name_lower = name.to_lowercase();
        if name_lower.contains(&input_lower) || input_lower.contains(&name_lower) {
            return Some((*id, name.clone(), 0.7));
        }
    }

    for (id, name) in items {
        let name_lower = name.to_lowercase();
        if name_lower.starts_with(&input_lower) || input_lower.starts_with(&name_lower) {
            return Some((*id, name.clone(), 0.5));
        }
    }

    None
}
