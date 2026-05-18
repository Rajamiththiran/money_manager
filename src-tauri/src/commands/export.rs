// File: src-tauri/src/commands/export.rs
use crate::models::transactions::TransactionWithDetails;
use crate::AppState;
use rust_xlsxwriter::{Color, Format, Workbook};
use serde::{Deserialize, Serialize};
use tauri::State;

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct ExportFilter {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub transaction_type: Option<String>,
    pub account_id: Option<i64>,
    pub category_id: Option<i64>,
    pub columns: Option<Vec<String>>,
    pub include_pie_chart: Option<bool>,
    pub include_histogram: Option<bool>,
}

#[tauri::command]
pub fn export_transactions_csv(
    state: State<'_, AppState>,
    filter: Option<ExportFilter>,
) -> Result<String, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let transactions = get_export_transactions(&conn, filter.clone())?;

    let default_cols = vec![
        "Date".to_string(),
        "Type".to_string(),
        "Account".to_string(),
        "To Account".to_string(),
        "Category".to_string(),
        "Amount".to_string(),
        "Memo".to_string(),
    ];
    let cols = filter.as_ref().and_then(|f| f.columns.clone()).unwrap_or(default_cols);

    // CSV Header
    let mut csv = cols.join(",") + "\n";

    // CSV Rows
    for txn in transactions {
        let mut row_vals = Vec::new();
        for col in &cols {
            let val = match col.as_str() {
                "Date" => txn.transaction.date.clone(),
                "Type" => txn.transaction.transaction_type.clone(),
                "Account" => txn.account_name.clone(),
                "To Account" => txn.to_account_name.clone().unwrap_or_default(),
                "Category" => txn.category_name.clone().unwrap_or_default(),
                "Amount" => format!("{:.2}", txn.transaction.amount),
                "Memo" => txn.transaction.memo.clone().unwrap_or_default().replace('\"', "\"\""),
                _ => String::new(),
            };
            row_vals.push(format!("\"{}\"", val));
        }
        csv.push_str(&row_vals.join(","));
        csv.push('\n');
    }

    Ok(csv)
}

#[tauri::command]
pub fn export_transactions_excel(
    state: State<'_, AppState>,
    filter: Option<ExportFilter>,
) -> Result<Vec<u8>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let transactions = get_export_transactions(&conn, filter.clone())?;

    let mut workbook = Workbook::new();
    let worksheet = workbook
        .add_worksheet()
        .set_name("Report")
        .map_err(|e| e.to_string())?;

    // --- Formats ---
    let title_format = Format::new()
        .set_background_color(Color::RGB(0x1e3a8a)) // blue-900
        .set_font_color(Color::White)
        .set_bold()
        .set_font_size(16)
        .set_align(rust_xlsxwriter::FormatAlign::Center)
        .set_align(rust_xlsxwriter::FormatAlign::VerticalCenter);

    let subtitle_format = Format::new()
        .set_background_color(Color::White)
        .set_font_color(Color::RGB(0x1e3a8a))
        .set_bold()
        .set_align(rust_xlsxwriter::FormatAlign::Center)
        .set_align(rust_xlsxwriter::FormatAlign::VerticalCenter)
        .set_border_top(rust_xlsxwriter::FormatBorder::Medium)
        .set_border_bottom(rust_xlsxwriter::FormatBorder::Medium);

    let income_header = Format::new()
        .set_background_color(Color::RGB(0x15803d)) // green-700
        .set_font_color(Color::White)
        .set_bold()
        .set_align(rust_xlsxwriter::FormatAlign::Center)
        .set_align(rust_xlsxwriter::FormatAlign::VerticalCenter);

    let expense_header = Format::new()
        .set_background_color(Color::RGB(0xb91c1c)) // red-700
        .set_font_color(Color::White)
        .set_bold()
        .set_align(rust_xlsxwriter::FormatAlign::Center)
        .set_align(rust_xlsxwriter::FormatAlign::VerticalCenter);

    let transfer_header = Format::new()
        .set_background_color(Color::RGB(0x1d4ed8)) // blue-700
        .set_font_color(Color::White)
        .set_bold()
        .set_align(rust_xlsxwriter::FormatAlign::Center)
        .set_align(rust_xlsxwriter::FormatAlign::VerticalCenter);

    let income_col_header = Format::new()
        .set_background_color(Color::RGB(0xbbf7d0)) // green-200
        .set_font_color(Color::RGB(0x14532d)) // green-900
        .set_bold()
        .set_border_bottom(rust_xlsxwriter::FormatBorder::Thin);

    let expense_col_header = Format::new()
        .set_background_color(Color::RGB(0xfecaca)) // red-200
        .set_font_color(Color::RGB(0x7f1d1d)) // red-900
        .set_bold()
        .set_border_bottom(rust_xlsxwriter::FormatBorder::Thin);

    let transfer_col_header = Format::new()
        .set_background_color(Color::RGB(0xbfdbfe)) // blue-200
        .set_font_color(Color::RGB(0x1e3a8a)) // blue-900
        .set_bold()
        .set_border_bottom(rust_xlsxwriter::FormatBorder::Thin);

    let c_white = Color::White;
    let c_inc_dark = Color::RGB(0xf0fdf4); // green-50
    let c_exp_dark = Color::RGB(0xfef2f2); // red-50
    let c_tra_dark = Color::RGB(0xeff6ff); // blue-50
    let c_text = Color::RGB(0x1f2937);     // gray-800

    worksheet.set_column_width(0, 15).map_err(|e| e.to_string())?;
    worksheet.set_column_width(1, 15).map_err(|e| e.to_string())?;
    worksheet.set_column_width(2, 25).map_err(|e| e.to_string())?;
    worksheet.set_column_width(3, 25).map_err(|e| e.to_string())?;
    worksheet.set_column_width(4, 25).map_err(|e| e.to_string())?;
    worksheet.set_column_width(5, 18).map_err(|e| e.to_string())?;
    worksheet.set_column_width(6, 40).map_err(|e| e.to_string())?;

    worksheet
        .merge_range(0, 0, 1, 6, "MONEY MANAGER - TRANSACTIONS REPORT", &title_format)
        .map_err(|e| e.to_string())?;

    let generated_date = format!(
        "Generated on: {}",
        chrono::Local::now().format("%Y-%m-%d %H:%M")
    );
    worksheet
        .merge_range(2, 0, 2, 6, &generated_date, &subtitle_format)
        .map_err(|e| e.to_string())?;

    let mut current_row = 4;

    macro_rules! write_section {
        ($title:expr, $txns:expr, $h_fmt:expr, $c_fmt:expr, $bg_dark:expr) => {
            if !$txns.is_empty() {
                worksheet
                    .merge_range(current_row, 0, current_row, 6, $title, $h_fmt)
                    .map_err(|e| e.to_string())?;
                current_row += 1;

                let headers = [
                    "Date", "Type", "Account", "To Account", "Category", "Amount", "Memo",
                ];
                for (i, h) in headers.iter().enumerate() {
                    worksheet
                        .write_string_with_format(current_row, i as u16, *h, $c_fmt)
                        .map_err(|e| e.to_string())?;
                }
                current_row += 1;

                for (i, txn) in $txns.iter().enumerate() {
                    let is_dark = i % 2 == 1;
                    let bg_color = if is_dark {
                        $bg_dark.clone()
                    } else {
                        c_white.clone()
                    };

                    let row_fmt = Format::new()
                        .set_background_color(bg_color.clone())
                        .set_font_color(c_text.clone());
                    let num_fmt = Format::new()
                        .set_background_color(bg_color)
                        .set_font_color(c_text.clone())
                        .set_num_format("#,##0.00");

                    worksheet
                        .write_string_with_format(current_row, 0, &txn.transaction.date, &row_fmt)
                        .map_err(|e| e.to_string())?;
                    worksheet
                        .write_string_with_format(
                            current_row,
                            1,
                            &txn.transaction.transaction_type,
                            &row_fmt,
                        )
                        .map_err(|e| e.to_string())?;
                    worksheet
                        .write_string_with_format(current_row, 2, &txn.account_name, &row_fmt)
                        .map_err(|e| e.to_string())?;

                    let to_account = txn.to_account_name.as_deref().unwrap_or("");
                    worksheet
                        .write_string_with_format(current_row, 3, to_account, &row_fmt)
                        .map_err(|e| e.to_string())?;

                    let category = txn.category_name.as_deref().unwrap_or("");
                    worksheet
                        .write_string_with_format(current_row, 4, category, &row_fmt)
                        .map_err(|e| e.to_string())?;

                    worksheet
                        .write_number_with_format(current_row, 5, txn.transaction.amount, &num_fmt)
                        .map_err(|e| e.to_string())?;

                    let memo = txn.transaction.memo.as_deref().unwrap_or("");
                    worksheet
                        .write_string_with_format(current_row, 6, memo, &row_fmt)
                        .map_err(|e| e.to_string())?;

                    current_row += 1;
                }
                current_row += 2; // Spacing after section
            }
        };
    }

    let incomes: Vec<_> = transactions
        .iter()
        .filter(|t| t.transaction.transaction_type == "INCOME")
        .collect();
    let expenses: Vec<_> = transactions
        .iter()
        .filter(|t| t.transaction.transaction_type == "EXPENSE")
        .collect();
    let transfers: Vec<_> = transactions
        .iter()
        .filter(|t| t.transaction.transaction_type == "TRANSFER")
        .collect();

    write_section!(
        "INCOME TRANSACTIONS",
        incomes,
        &income_header,
        &income_col_header,
        &c_inc_dark
    );
    write_section!(
        "EXPENSE TRANSACTIONS",
        expenses,
        &expense_header,
        &expense_col_header,
        &c_exp_dark
    );
    write_section!(
        "TRANSFER TRANSACTIONS",
        transfers,
        &transfer_header,
        &transfer_col_header,
        &c_tra_dark
    );

    let include_pie = filter.as_ref().and_then(|f| f.include_pie_chart).unwrap_or(false);
    let include_hist = filter.as_ref().and_then(|f| f.include_histogram).unwrap_or(false);

    if include_pie || include_hist {
        let mut type_totals: std::collections::BTreeMap<String, f64> = std::collections::BTreeMap::new();
        
        for t in &transactions {
            *type_totals.entry(t.transaction.transaction_type.clone()).or_insert(0.0) += t.transaction.amount;
        }

        if include_pie && !type_totals.is_empty() {
            let data_start_row = current_row;
            worksheet.write_string(current_row, 0, "Type").unwrap();
            worksheet.write_string(current_row, 1, "Amount").unwrap();
            current_row += 1;
            
            for (t_type, amt) in &type_totals {
                worksheet.write_string(current_row, 0, t_type).unwrap();
                worksheet.write_number(current_row, 1, *amt).unwrap();
                current_row += 1;
            }
            
            let mut chart = rust_xlsxwriter::Chart::new(rust_xlsxwriter::ChartType::Pie);
            chart.add_series()
                .set_categories(("Report", data_start_row + 1, 0, current_row - 1, 0))
                .set_values(("Report", data_start_row + 1, 1, current_row - 1, 1));
            chart.title().set_name("Transaction Types Breakdown");
            
            worksheet.insert_chart(current_row + 2, 0, &chart).unwrap();
            current_row += 18;
        }

        if include_hist && !type_totals.is_empty() {
            let data_start_row = current_row;
            worksheet.write_string(current_row, 0, "Type").unwrap();
            worksheet.write_string(current_row, 1, "Amount").unwrap();
            current_row += 1;
            
            for (t_type, amt) in &type_totals {
                worksheet.write_string(current_row, 0, t_type).unwrap();
                worksheet.write_number(current_row, 1, *amt).unwrap();
                current_row += 1;
            }
            
            let mut chart = rust_xlsxwriter::Chart::new(rust_xlsxwriter::ChartType::Column);
            chart.add_series()
                .set_categories(("Report", data_start_row + 1, 0, current_row - 1, 0))
                .set_values(("Report", data_start_row + 1, 1, current_row - 1, 1));
            chart.title().set_name("Transaction Types Comparison");
            
            worksheet.insert_chart(current_row + 2, 0, &chart).unwrap();
            current_row += 18;
        }
    }

    let _ = current_row; // Silence unused assignment warning for the last section

    let buf = workbook.save_to_buffer().map_err(|e| e.to_string())?;
    Ok(buf)
}

#[tauri::command]
pub fn export_transactions_json(
    state: State<'_, AppState>,
    filter: Option<ExportFilter>,
) -> Result<String, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let transactions = get_export_transactions(&conn, filter.clone())?;

    let mut enriched = Vec::new();

    for txn in transactions {
        // Fetch tags
        let mut stmt = conn.prepare(
            "SELECT t.id, t.name, t.color, t.created_at
             FROM tags t
             INNER JOIN transaction_tags tt ON t.id = tt.tag_id
             WHERE tt.transaction_id = ?1"
        ).unwrap();
        let tags: Vec<serde_json::Value> = stmt.query_map([txn.transaction.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "color": row.get::<_, String>(2)?,
            }))
        }).unwrap().filter_map(Result::ok).collect();

        // Fetch journal entries
        let mut stmt = conn.prepare(
            "SELECT id, account_id, debit, credit, created_at 
             FROM journal_entries WHERE transaction_id = ?1"
        ).unwrap();
        let journal_entries: Vec<serde_json::Value> = stmt.query_map([txn.transaction.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "account_id": row.get::<_, i64>(1)?,
                "debit": row.get::<_, f64>(2)?,
                "credit": row.get::<_, f64>(3)?,
                "created_at": row.get::<_, String>(4)?,
            }))
        }).unwrap().filter_map(Result::ok).collect();

        // Fetch photos metadata
        let mut stmt = conn.prepare(
            "SELECT id, file_path, file_size_bytes, mime_type, original_name, created_at
             FROM transaction_photos WHERE transaction_id = ?1"
        ).unwrap();
        let photos: Vec<serde_json::Value> = stmt.query_map([txn.transaction.id], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "file_path": row.get::<_, String>(1)?,
                "file_size_bytes": row.get::<_, i64>(2)?,
                "mime_type": row.get::<_, String>(3)?,
                "original_name": row.get::<_, String>(4)?,
                "created_at": row.get::<_, String>(5)?,
            }))
        }).unwrap().filter_map(Result::ok).collect();

        enriched.push(serde_json::json!({
            "transaction": txn.transaction,
            "account_name": txn.account_name,
            "to_account_name": txn.to_account_name,
            "category_name": txn.category_name,
            "tags": tags,
            "journal_entries": journal_entries,
            "photos_metadata": photos,
        }));
    }

    let result = serde_json::to_string_pretty(&enriched)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    Ok(result)
}

#[tauri::command]
pub fn export_full_backup(state: State<'_, AppState>) -> Result<String, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    pub_export_full_backup_internal(&conn)
}

// Exported for internal scheduled backup
pub fn pub_export_full_backup_internal(conn: &rusqlite::Connection) -> Result<String, String> {
    let accounts = get_all_accounts(conn)?;
    let categories = get_all_categories(conn)?;
    let transactions = get_export_transactions(conn, None)?;
    let budgets = get_all_budgets(conn)?;

    let mut stmt = conn.prepare("SELECT id, name, color, created_at FROM tags ORDER BY id")
        .map_err(|e| format!("Query error: {}", e))?;
    let tags: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "color": row.get::<_, String>(2)?,
                "created_at": row.get::<_, String>(3)?
            }))
        })
        .unwrap()
        .filter_map(Result::ok)
        .collect();

    let mut stmt = conn.prepare("SELECT transaction_id, tag_id FROM transaction_tags")
        .map_err(|e| format!("Query error: {}", e))?;
    let transaction_tags: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "transaction_id": row.get::<_, i64>(0)?,
                "tag_id": row.get::<_, i64>(1)?
            }))
        })
        .unwrap()
        .filter_map(Result::ok)
        .collect();

    let mut stmt = conn.prepare(
        "SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at 
         FROM savings_goals ORDER BY id"
    ).map_err(|e| format!("Query error: {}", e))?;
    let savings_goals: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "target_amount": row.get::<_, f64>(2)?,
                "target_date": row.get::<_, Option<String>>(3)?,
                "linked_account_id": row.get::<_, Option<i64>>(4)?,
                "color": row.get::<_, String>(5)?,
                "icon": row.get::<_, String>(6)?,
                "status": row.get::<_, String>(7)?,
                "created_at": row.get::<_, String>(8)?,
                "updated_at": row.get::<_, String>(9)?
            }))
        })
        .unwrap()
        .filter_map(Result::ok)
        .collect();

    let mut stmt = conn.prepare(
        "SELECT id, goal_id, amount, contribution_date, note, created_at 
         FROM goal_contributions ORDER BY id"
    ).map_err(|e| format!("Query error: {}", e))?;
    let goal_contributions: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "goal_id": row.get::<_, i64>(1)?,
                "amount": row.get::<_, f64>(2)?,
                "contribution_date": row.get::<_, String>(3)?,
                "note": row.get::<_, Option<String>>(4)?,
                "created_at": row.get::<_, String>(5)?
            }))
        })
        .unwrap()
        .filter_map(Result::ok)
        .collect();

    let backup = serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "data": {
            "accounts": accounts,
            "categories": categories,
            "transactions": transactions,
            "budgets": budgets,
            "tags": tags,
            "transaction_tags": transaction_tags,
            "savings_goals": savings_goals,
            "goal_contributions": goal_contributions
        }
    });

    let result = serde_json::to_string_pretty(&backup)
        .map_err(|e| format!("Failed to create backup: {}", e))?;

    Ok(result)
}

// Helper function to get transactions with details
fn get_export_transactions(
    conn: &rusqlite::Connection,
    filter: Option<ExportFilter>,
) -> Result<Vec<TransactionWithDetails>, String> {
    let mut query = String::from(
        "SELECT 
            t.id, t.date, t.type, t.amount, t.account_id, t.to_account_id, 
            t.category_id, t.memo, t.photo_path, t.created_at,
            a.name as account_name,
            ta.name as to_account_name,
            c.name as category_name,
            (SELECT COUNT(*) FROM transaction_photos tp WHERE tp.transaction_id = t.id) as photo_count
         FROM transactions t
         INNER JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts ta ON t.to_account_id = ta.id
         LEFT JOIN categories c ON t.category_id = c.id
         WHERE 1=1",
    );

    if let Some(ref f) = filter {
        if let Some(ref start) = f.start_date {
            query.push_str(&format!(" AND t.date >= '{}'", start));
        }
        if let Some(ref end) = f.end_date {
            query.push_str(&format!(" AND t.date <= '{}'", end));
        }
        if let Some(ref t_type) = f.transaction_type {
            query.push_str(&format!(" AND t.type = '{}'", t_type));
        }
        if let Some(acc_id) = f.account_id {
            query.push_str(&format!(
                " AND (t.account_id = {} OR t.to_account_id = {})",
                acc_id, acc_id
            ));
        }
        if let Some(cat_id) = f.category_id {
            query.push_str(&format!(" AND t.category_id = {}", cat_id));
        }
    }

    query.push_str(" ORDER BY t.date DESC, t.created_at DESC");

    let mut stmt = conn
        .prepare(&query)
        .map_err(|e| format!("Query error: {}", e))?;

    let transactions = stmt
        .query_map([], |row| {
            Ok(TransactionWithDetails {
                transaction: crate::models::transactions::Transaction {
                    id: row.get(0)?,
                    date: row.get(1)?,
                    transaction_type: row.get(2)?,
                    amount: row.get(3)?,
                    account_id: row.get(4)?,
                    to_account_id: row.get(5)?,
                    category_id: row.get(6)?,
                    memo: row.get(7)?,
                    photo_path: row.get(8)?,
                    created_at: row.get(9)?,
                },
                account_name: row.get(10)?,
                to_account_name: row.get(11)?,
                category_name: row.get(12)?,
                photo_count: row.get(13)?,
                tags: Vec::new(),
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(transactions)
}

// Helper to get all accounts
fn get_all_accounts(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut stmt = conn
        .prepare("SELECT id, group_id, name, initial_balance, currency, created_at FROM accounts ORDER BY name")
        .map_err(|e| format!("Query error: {}", e))?;

    let accounts: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "group_id": row.get::<_, i64>(1)?,
                "name": row.get::<_, String>(2)?,
                "initial_balance": row.get::<_, f64>(3)?,
                "currency": row.get::<_, String>(4)?,
                "created_at": row.get::<_, String>(5)?
            }))
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(serde_json::json!(accounts))
}

// Helper to get all categories
fn get_all_categories(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut stmt = conn
        .prepare("SELECT id, name, type, parent_id FROM categories ORDER BY name")
        .map_err(|e| format!("Query error: {}", e))?;

    let categories: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "name": row.get::<_, String>(1)?,
                "type": row.get::<_, String>(2)?,
                "parent_id": row.get::<_, Option<i64>>(3)?
            }))
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(serde_json::json!(categories))
}

// Helper to get all budgets
fn get_all_budgets(conn: &rusqlite::Connection) -> Result<serde_json::Value, String> {
    let mut stmt = conn
        .prepare("SELECT id, category_id, amount, period, start_date FROM budgets ORDER BY id")
        .map_err(|e| format!("Query error: {}", e))?;

    let budgets: Vec<serde_json::Value> = stmt
        .query_map([], |row| {
            Ok(serde_json::json!({
                "id": row.get::<_, i64>(0)?,
                "category_id": row.get::<_, i64>(1)?,
                "amount": row.get::<_, f64>(2)?,
                "period": row.get::<_, String>(3)?,
                "start_date": row.get::<_, String>(4)?
            }))
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(serde_json::json!(budgets))
}
