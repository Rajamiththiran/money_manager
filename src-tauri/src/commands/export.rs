// File: src-tauri/src/commands/export.rs
use crate::models::transactions::TransactionWithDetails;
use rust_xlsxwriter::{Color, Format, Workbook};
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use tauri::State;

#[derive(Debug, Serialize, Deserialize)]
pub struct ExportFilter {
    pub start_date: Option<String>,
    pub end_date: Option<String>,
    pub transaction_type: Option<String>,
    pub account_id: Option<i64>,
    pub category_id: Option<i64>,
}

#[tauri::command]
pub async fn export_transactions_csv(
    pool: State<'_, SqlitePool>,
    filter: Option<ExportFilter>,
) -> Result<String, String> {
    println!("=== export_transactions_csv called ===");
    println!("Filter: {:?}", filter);

    let transactions = get_export_transactions(&pool, filter).await?;
    println!("Found {} transactions", transactions.len());

    // CSV Header
    let mut csv = String::from("Date,Type,Account,To Account,Category,Amount,Memo\n");

    // CSV Rows
    for txn in transactions {
        let row = format!(
            "\"{}\",\"{}\",\"{}\",\"{}\",\"{}\",{:.2},\"{}\"\n",
            txn.transaction.date,
            txn.transaction.transaction_type,
            txn.account_name,
            txn.to_account_name.unwrap_or_default(),
            txn.category_name.unwrap_or_default(),
            txn.transaction.amount,
            txn.transaction
                .memo
                .unwrap_or_default()
                .replace("\"", "\"\"")
        );
        csv.push_str(&row);
    }

    println!("CSV generated, length: {}", csv.len());
    Ok(csv)
}

#[tauri::command]
pub async fn export_transactions_excel(
    pool: State<'_, SqlitePool>,
    filter: Option<ExportFilter>,
) -> Result<Vec<u8>, String> {
    println!("=== export_transactions_excel called ===");
    let transactions = get_export_transactions(&pool, filter).await?;
    println!("Found {} transactions for Excel export", transactions.len());

    let mut workbook = Workbook::new();
    let worksheet = workbook
        .add_worksheet()
        .set_name("Report")
        .map_err(|e| e.to_string())?;

    // --- Formats ---
    // Title
    let title_format = Format::new()
        .set_background_color(Color::RGB(0x1e3a8a)) // blue-900
        .set_font_color(Color::White)
        .set_bold()
        .set_font_size(16)
        .set_align(rust_xlsxwriter::FormatAlign::Center)
        .set_align(rust_xlsxwriter::FormatAlign::VerticalCenter);

    // Subtitle
    let subtitle_format = Format::new()
        .set_background_color(Color::White)
        .set_font_color(Color::RGB(0x1e3a8a))
        .set_bold()
        .set_align(rust_xlsxwriter::FormatAlign::Center)
        .set_align(rust_xlsxwriter::FormatAlign::VerticalCenter)
        .set_border_top(rust_xlsxwriter::FormatBorder::Medium)
        .set_border_bottom(rust_xlsxwriter::FormatBorder::Medium);

    // Section Headers
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

    // Column Headers
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

    // Data Row Base Formats (Colors)
    let c_white = Color::White;
    let c_inc_dark = Color::RGB(0xf0fdf4); // green-50
    let c_exp_dark = Color::RGB(0xfef2f2); // red-50
    let c_tra_dark = Color::RGB(0xeff6ff); // blue-50
    let c_text = Color::RGB(0x1f2937);     // gray-800

    // Column widths
    worksheet.set_column_width(0, 15).map_err(|e| e.to_string())?;
    worksheet.set_column_width(1, 15).map_err(|e| e.to_string())?;
    worksheet.set_column_width(2, 25).map_err(|e| e.to_string())?;
    worksheet.set_column_width(3, 25).map_err(|e| e.to_string())?;
    worksheet.set_column_width(4, 25).map_err(|e| e.to_string())?;
    worksheet.set_column_width(5, 18).map_err(|e| e.to_string())?;
    worksheet.set_column_width(6, 40).map_err(|e| e.to_string())?;

    // Write Title & Subtitle
    worksheet
        .merge_range(
            0,
            0,
            1,
            6,
            "MONEY MANAGER - TRANSACTIONS REPORT",
            &title_format,
        )
        .map_err(|e| e.to_string())?;

    let generated_date = format!(
        "Generated on: {}",
        chrono::Local::now().format("%Y-%m-%d %H:%M")
    );
    worksheet
        .merge_range(2, 0, 2, 6, &generated_date, &subtitle_format)
        .map_err(|e| e.to_string())?;

    let mut current_row = 4;

    // We can't use a closure easily with worksheet methods due to borrow checker and &mut,
    // so let's just write a macro or duplicate the loop for the 3 sections.
    // Actually, we can just do it procedurally since we own `worksheet`.

    macro_rules! write_section {
        ($title:expr, $txns:expr, $h_fmt:expr, $c_fmt:expr, $bg_dark:expr) => {
            if !$txns.is_empty() {
                worksheet
                    .merge_range(current_row, 0, current_row, 6, $title, $h_fmt)
                    .map_err(|e| e.to_string())?;
                current_row += 1;

                let headers = [
                    "Date",
                    "Type",
                    "Account",
                    "To Account",
                    "Category",
                    "Amount",
                    "Memo",
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
                        .write_number_with_format(
                            current_row,
                            5,
                            txn.transaction.amount,
                            &num_fmt,
                        )
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

    let buf = workbook.save_to_buffer().map_err(|e| e.to_string())?;
    println!("Excel buffer generated, size: {} bytes", buf.len());

    Ok(buf)
}

#[tauri::command]
pub async fn export_transactions_json(
    pool: State<'_, SqlitePool>,
    filter: Option<ExportFilter>,
) -> Result<String, String> {
    println!("=== export_transactions_json called ===");
    println!("Filter: {:?}", filter);

    let transactions = get_export_transactions(&pool, filter).await?;
    println!("Found {} transactions", transactions.len());

    let result = serde_json::to_string_pretty(&transactions)
        .map_err(|e| format!("Failed to serialize: {}", e))?;

    println!("JSON generated, length: {}", result.len());
    Ok(result)
}

#[tauri::command]
pub async fn export_full_backup(pool: State<'_, SqlitePool>) -> Result<String, String> {
    println!("=== export_full_backup called ===");

    // Get all data for backup
    let accounts = get_all_accounts(&pool).await?;
    println!("Accounts fetched");

    let categories = get_all_categories(&pool).await?;
    println!("Categories fetched");

    let transactions = get_export_transactions(&pool, None).await?;
    println!("Transactions fetched: {}", transactions.len());

    let budgets = get_all_budgets(&pool).await?;
    println!("Budgets fetched");

    // Fetch new tables directly here
    let tag_rows = sqlx::query("SELECT id, name, color, created_at FROM tags ORDER BY id")
        .fetch_all(pool.inner())
        .await
        .unwrap_or_default();
    let tags: Vec<serde_json::Value> = tag_rows.iter().map(|row| serde_json::json!({
        "id": row.get::<i64, _>("id"),
        "name": row.get::<String, _>("name"),
        "color": row.get::<String, _>("color"),
        "created_at": row.get::<String, _>("created_at")
    })).collect();

    let txn_tag_rows = sqlx::query("SELECT transaction_id, tag_id FROM transaction_tags")
        .fetch_all(pool.inner())
        .await
        .unwrap_or_default();
    let transaction_tags: Vec<serde_json::Value> = txn_tag_rows.iter().map(|row| serde_json::json!({
        "transaction_id": row.get::<i64, _>("transaction_id"),
        "tag_id": row.get::<i64, _>("tag_id")
    })).collect();

    let goal_rows = sqlx::query("SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at FROM savings_goals ORDER BY id")
        .fetch_all(pool.inner())
        .await
        .unwrap_or_default();
    let savings_goals: Vec<serde_json::Value> = goal_rows.iter().map(|row| serde_json::json!({
        "id": row.get::<i64, _>("id"),
        "name": row.get::<String, _>("name"),
        "target_amount": row.get::<f64, _>("target_amount"),
        "target_date": row.get::<Option<String>, _>("target_date"),
        "linked_account_id": row.get::<Option<i64>, _>("linked_account_id"),
        "color": row.get::<String, _>("color"),
        "icon": row.get::<String, _>("icon"),
        "status": row.get::<String, _>("status"),
        "created_at": row.get::<String, _>("created_at"),
        "updated_at": row.get::<String, _>("updated_at")
    })).collect();

    let goal_contrib_rows = sqlx::query("SELECT id, goal_id, amount, contribution_date, note, created_at FROM goal_contributions ORDER BY id")
        .fetch_all(pool.inner())
        .await
        .unwrap_or_default();
    let goal_contributions: Vec<serde_json::Value> = goal_contrib_rows.iter().map(|row| serde_json::json!({
        "id": row.get::<i64, _>("id"),
        "goal_id": row.get::<i64, _>("goal_id"),
        "amount": row.get::<f64, _>("amount"),
        "contribution_date": row.get::<String, _>("contribution_date"),
        "note": row.get::<Option<String>, _>("note"),
        "created_at": row.get::<String, _>("created_at")
    })).collect();

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

    println!("Backup generated, length: {}", result.len());
    Ok(result)
}

// Helper function to get transactions with details
async fn get_export_transactions(
    pool: &SqlitePool,
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

    let rows = sqlx::query(&query)
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| TransactionWithDetails {
            transaction: crate::models::transactions::Transaction {
                id: row.get("id"),
                date: row.get("date"),
                transaction_type: row.get("type"),
                amount: row.get("amount"),
                account_id: row.get("account_id"),
                to_account_id: row.get("to_account_id"),
                category_id: row.get("category_id"),
                memo: row.get("memo"),
                photo_path: row.get("photo_path"),
                created_at: row.get("created_at"),
            },
            account_name: row.get("account_name"),
            to_account_name: row.get("to_account_name"),
            category_name: row.get("category_name"),
            photo_count: row.get("photo_count"),
            tags: Vec::new(),
        })
        .collect())
}

// Helper to get all accounts
async fn get_all_accounts(pool: &SqlitePool) -> Result<serde_json::Value, String> {
    let rows = sqlx::query(
        "SELECT id, group_id, name, initial_balance, currency, created_at FROM accounts ORDER BY name"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch accounts: {}", e))?;

    let accounts: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "group_id": row.get::<i64, _>("group_id"),
                "name": row.get::<String, _>("name"),
                "initial_balance": row.get::<f64, _>("initial_balance"),
                "currency": row.get::<String, _>("currency"),
                "created_at": row.get::<String, _>("created_at")
            })
        })
        .collect();

    Ok(serde_json::json!(accounts))
}

// Helper to get all categories
async fn get_all_categories(pool: &SqlitePool) -> Result<serde_json::Value, String> {
    let rows = sqlx::query("SELECT id, name, type, parent_id FROM categories ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch categories: {}", e))?;

    let categories: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "name": row.get::<String, _>("name"),
                "type": row.get::<String, _>("type"),
                "parent_id": row.get::<Option<i64>, _>("parent_id")
            })
        })
        .collect();

    Ok(serde_json::json!(categories))
}

// Helper to get all budgets
async fn get_all_budgets(pool: &SqlitePool) -> Result<serde_json::Value, String> {
    let rows =
        sqlx::query("SELECT id, category_id, amount, period, start_date FROM budgets ORDER BY id")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to fetch budgets: {}", e))?;

    let budgets: Vec<serde_json::Value> = rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "category_id": row.get::<i64, _>("category_id"),
                "amount": row.get::<f64, _>("amount"),
                "period": row.get::<String, _>("period"),
                "start_date": row.get::<String, _>("start_date")
            })
        })
        .collect();

    Ok(serde_json::json!(budgets))
}
