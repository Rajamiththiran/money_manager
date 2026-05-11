// File: src-tauri/src/commands/recurring.rs
use crate::models::recurring::{
    CreateRecurringTransactionInput, RecurringTransaction, RecurringTransactionWithDetails,
    UpcomingExecution, UpdateRecurringTransactionInput,
};
use crate::models::transactions::CreateTransactionInput;
use crate::AppState;
use chrono::{Datelike, Duration, NaiveDate};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_recurring_transactions(
    state: State<'_, AppState>,
) -> Result<Vec<RecurringTransaction>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, name, description, transaction_type, amount, account_id, to_account_id, 
                    category_id, frequency, interval_days, start_date, end_date, next_execution_date, 
                    is_active, last_executed_date, execution_count, created_at
             FROM recurring_transactions
             ORDER BY next_execution_date ASC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let transactions = stmt
        .query_map([], |row| {
            Ok(RecurringTransaction {
                id: row.get(0)?,
                name: row.get(1)?,
                description: row.get(2)?,
                transaction_type: row.get(3)?,
                amount: row.get(4)?,
                account_id: row.get(5)?,
                to_account_id: row.get(6)?,
                category_id: row.get(7)?,
                frequency: row.get(8)?,
                interval_days: row.get(9)?,
                start_date: row.get(10)?,
                end_date: row.get(11)?,
                next_execution_date: row.get(12)?,
                is_active: row.get::<_, i64>(13)? == 1,
                last_executed_date: row.get(14)?,
                execution_count: row.get(15)?,
                created_at: row.get(16)?,
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(transactions)
}

#[tauri::command]
pub fn get_recurring_transactions_with_details(
    state: State<'_, AppState>,
) -> Result<Vec<RecurringTransactionWithDetails>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT 
                rt.id, rt.name, rt.description, rt.transaction_type, rt.amount, 
                rt.account_id, rt.to_account_id, rt.category_id, rt.frequency, 
                rt.interval_days, rt.start_date, rt.end_date, rt.next_execution_date, 
                rt.is_active, rt.last_executed_date, rt.execution_count, rt.created_at,
                a.name as account_name,
                ta.name as to_account_name,
                c.name as category_name
             FROM recurring_transactions rt
             INNER JOIN accounts a ON rt.account_id = a.id
             LEFT JOIN accounts ta ON rt.to_account_id = ta.id
             LEFT JOIN categories c ON rt.category_id = c.id
             ORDER BY rt.next_execution_date ASC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let details = stmt
        .query_map([], |row| {
            Ok(RecurringTransactionWithDetails {
                recurring: RecurringTransaction {
                    id: row.get(0)?,
                    name: row.get(1)?,
                    description: row.get(2)?,
                    transaction_type: row.get(3)?,
                    amount: row.get(4)?,
                    account_id: row.get(5)?,
                    to_account_id: row.get(6)?,
                    category_id: row.get(7)?,
                    frequency: row.get(8)?,
                    interval_days: row.get(9)?,
                    start_date: row.get(10)?,
                    end_date: row.get(11)?,
                    next_execution_date: row.get(12)?,
                    is_active: row.get::<_, i64>(13)? == 1,
                    last_executed_date: row.get(14)?,
                    execution_count: row.get(15)?,
                    created_at: row.get(16)?,
                },
                account_name: row.get(17)?,
                to_account_name: row.get(18)?,
                category_name: row.get(19)?,
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(details)
}

#[tauri::command]
pub fn create_recurring_transaction(
    state: State<'_, AppState>,
    input: CreateRecurringTransactionInput,
) -> Result<i64, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Validate transaction type
    if input.transaction_type != "INCOME"
        && input.transaction_type != "EXPENSE"
        && input.transaction_type != "TRANSFER"
    {
        return Err("Invalid transaction type".to_string());
    }

    // Validate frequency
    if input.frequency != "DAILY"
        && input.frequency != "WEEKLY"
        && input.frequency != "MONTHLY"
        && input.frequency != "YEARLY"
        && input.frequency != "CUSTOM"
    {
        return Err("Invalid frequency".to_string());
    }

    let interval_days = if input.frequency == "CUSTOM" {
        input.interval_days.unwrap_or(1).max(1)
    } else {
        1
    };

    if input.amount <= 0.0 {
        return Err("Amount must be greater than zero".to_string());
    }

    // Validate account
    let acct_exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM accounts WHERE id = ?1",
            params![input.account_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;
    if !acct_exists {
        return Err("Account does not exist".to_string());
    }

    if input.transaction_type == "TRANSFER" {
        let to_account_id = input.to_account_id.ok_or("Transfer requires to_account_id")?;
        if to_account_id == input.account_id {
            return Err("Cannot transfer to the same account".to_string());
        }
        let to_acct_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM accounts WHERE id = ?1",
                params![to_account_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;
        if !to_acct_exists {
            return Err("Destination account does not exist".to_string());
        }
    }

    if let Some(category_id) = input.category_id {
        let cat_exists: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM categories WHERE id = ?1",
                params![category_id],
                |row| row.get::<_, i64>(0),
            )
            .unwrap_or(0) > 0;
        if !cat_exists {
            return Err("Category does not exist".to_string());
        }
    }

    let start_date = NaiveDate::parse_from_str(&input.start_date, "%Y-%m-%d")
        .map_err(|_| "Invalid start date format. Use YYYY-MM-DD")?;

    if let Some(end_date_str) = &input.end_date {
        let end_date = NaiveDate::parse_from_str(end_date_str, "%Y-%m-%d")
            .map_err(|_| "Invalid end date format. Use YYYY-MM-DD")?;
        if end_date <= start_date {
            return Err("End date must be after start date".to_string());
        }
    }

    let next_execution_date = input.start_date.clone();

    conn.execute(
        "INSERT INTO recurring_transactions 
         (name, description, transaction_type, amount, account_id, to_account_id, 
          category_id, frequency, interval_days, start_date, end_date, next_execution_date) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            input.name,
            input.description,
            input.transaction_type,
            input.amount,
            input.account_id,
            input.to_account_id,
            input.category_id,
            input.frequency,
            interval_days,
            input.start_date,
            input.end_date,
            next_execution_date
        ],
    )
    .map_err(|e| format!("Failed to create recurring transaction: {}", e))?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_recurring_transaction(
    state: State<'_, AppState>,
    input: UpdateRecurringTransactionInput,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM recurring_transactions WHERE id = ?1",
            params![input.id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    if !exists {
        return Err("Recurring transaction not found".to_string());
    }

    let mut updates = Vec::new();

    if let Some(name) = &input.name {
        updates.push(format!("name = '{}'", name.replace('\'', "''")));
    }
    if let Some(description) = &input.description {
        updates.push(format!("description = '{}'", description.replace('\'', "''")));
    }
    if let Some(amount) = input.amount {
        if amount <= 0.0 {
            return Err("Amount must be greater than zero".to_string());
        }
        updates.push(format!("amount = {}", amount));
    }
    if let Some(frequency) = &input.frequency {
        if !["DAILY", "WEEKLY", "MONTHLY", "YEARLY", "CUSTOM"].contains(&frequency.as_str()) {
            return Err("Invalid frequency".to_string());
        }
        updates.push(format!("frequency = '{}'", frequency));
    }
    if let Some(interval_days) = input.interval_days {
        if interval_days < 1 {
            return Err("Interval days must be at least 1".to_string());
        }
        updates.push(format!("interval_days = {}", interval_days));
    }
    if let Some(end_date) = &input.end_date {
        NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
            .map_err(|_| "Invalid end date format")?;
        updates.push(format!("end_date = '{}'", end_date));
    }

    if updates.is_empty() {
        return Err("No fields to update".to_string());
    }

    let query = format!(
        "UPDATE recurring_transactions SET {} WHERE id = {}",
        updates.join(", "),
        input.id
    );

    conn.execute(&query, [])
        .map_err(|e| format!("Failed to update recurring transaction: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_recurring_transaction(
    state: State<'_, AppState>,
    recurring_id: i64,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let rows = conn
        .execute(
            "DELETE FROM recurring_transactions WHERE id = ?1",
            params![recurring_id],
        )
        .map_err(|e| format!("Failed to delete recurring transaction: {}", e))?;

    if rows == 0 {
        return Err("Recurring transaction not found".to_string());
    }
    Ok(())
}

#[tauri::command]
pub fn toggle_recurring_transaction(
    state: State<'_, AppState>,
    recurring_id: i64,
) -> Result<bool, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let current_state: i64 = conn
        .query_row(
            "SELECT is_active FROM recurring_transactions WHERE id = ?1",
            params![recurring_id],
            |row| row.get(0),
        )
        .map_err(|_| "Recurring transaction not found".to_string())?;

    let new_state = if current_state == 1 { 0 } else { 1 };

    conn.execute(
        "UPDATE recurring_transactions SET is_active = ?1 WHERE id = ?2",
        params![new_state, recurring_id],
    )
    .map_err(|e| format!("Failed to toggle recurring transaction: {}", e))?;

    Ok(new_state == 1)
}

#[tauri::command]
pub fn skip_next_occurrence(
    state: State<'_, AppState>,
    recurring_id: i64,
) -> Result<String, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let (frequency, interval_days, next_execution_date, end_date): (String, i64, String, Option<String>) = conn
        .query_row(
            "SELECT frequency, interval_days, next_execution_date, end_date 
             FROM recurring_transactions 
             WHERE id = ?1",
            params![recurring_id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?)),
        )
        .map_err(|_| "Recurring transaction not found".to_string())?;

    let current_date = NaiveDate::parse_from_str(&next_execution_date, "%Y-%m-%d")
        .map_err(|_| "Invalid next execution date in database".to_string())?;

    let new_next_date = calculate_next_execution_date(&current_date, &frequency, interval_days)?;

    if let Some(end_date_str) = end_date {
        let parsed_end_date = NaiveDate::parse_from_str(&end_date_str, "%Y-%m-%d")
            .map_err(|_| "Invalid end date in database".to_string())?;

        if new_next_date > parsed_end_date {
            conn.execute(
                "UPDATE recurring_transactions SET is_active = 0 WHERE id = ?1",
                params![recurring_id],
            )
            .map_err(|e| format!("Failed to deactivate recurring transaction: {}", e))?;

            return Ok("Recurring transaction has reached its end date and was deactivated".to_string());
        }
    }

    let new_date_str = new_next_date.format("%Y-%m-%d").to_string();

    conn.execute(
        "UPDATE recurring_transactions SET next_execution_date = ?1 WHERE id = ?2",
        params![new_date_str, recurring_id],
    )
    .map_err(|e| format!("Failed to skip occurrence: {}", e))?;

    Ok(new_date_str)
}

#[tauri::command]
pub fn execute_recurring_transaction(
    state: State<'_, AppState>,
    recurring_id: i64,
) -> Result<i64, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let (
        transaction_type, amount, account_id, to_account_id, category_id,
        frequency, interval_days, next_execution_date, end_date, is_active
    ): (String, f64, i64, Option<i64>, Option<i64>, String, i64, String, Option<String>, i64) = conn
        .query_row(
            "SELECT transaction_type, amount, account_id, to_account_id, category_id,
                    frequency, interval_days, next_execution_date, end_date, is_active
             FROM recurring_transactions
             WHERE id = ?1",
            params![recurring_id],
            |row| Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
                row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?
            )),
        )
        .map_err(|_| "Recurring transaction not found".to_string())?;

    if is_active == 0 {
        return Err("Cannot execute a paused recurring transaction. Activate it first.".to_string());
    }

    let today = chrono::Local::now().naive_local().date();
    let today_str = today.format("%Y-%m-%d").to_string();

    let transaction_input = CreateTransactionInput {
        date: today_str.clone(),
        transaction_type,
        amount,
        account_id,
        to_account_id,
        category_id,
        memo: Some("Auto-generated from recurring transaction".to_string()),
        tag_ids: None,
    };

    // Need to release lock before calling create_transaction
    drop(conn);

    let txn_id = crate::commands::transactions::create_transaction(state.clone(), transaction_input)
        .map_err(|e| format!("Failed to create transaction: {}", e))?;

    // Reacquire lock
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let current_date = NaiveDate::parse_from_str(&next_execution_date, "%Y-%m-%d")
        .map_err(|_| "Invalid next execution date in database".to_string())?;

    let new_next_date = calculate_next_execution_date(&current_date, &frequency, interval_days)?;

    let mut should_deactivate = false;
    if let Some(end_date_str) = &end_date {
        if let Ok(end_date_parsed) = NaiveDate::parse_from_str(end_date_str, "%Y-%m-%d") {
            if new_next_date > end_date_parsed {
                should_deactivate = true;
            }
        }
    }

    if should_deactivate {
        conn.execute(
            "UPDATE recurring_transactions 
             SET last_executed_date = ?1, execution_count = execution_count + 1, is_active = 0
             WHERE id = ?2",
            params![today_str, recurring_id],
        )
        .map_err(|e| format!("Failed to update recurring transaction: {}", e))?;
    } else {
        conn.execute(
            "UPDATE recurring_transactions 
             SET next_execution_date = ?1, last_executed_date = ?2, execution_count = execution_count + 1
             WHERE id = ?3",
            params![new_next_date.format("%Y-%m-%d").to_string(), today_str, recurring_id],
        )
        .map_err(|e| format!("Failed to update recurring transaction: {}", e))?;
    }

    Ok(txn_id)
}

#[tauri::command]
pub fn get_upcoming_executions(
    state: State<'_, AppState>,
    days_ahead: i64,
) -> Result<Vec<UpcomingExecution>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let today = chrono::Local::now().naive_local().date();
    let future_date = today + Duration::days(days_ahead);

    let mut stmt = conn
        .prepare(
            "SELECT id, name, transaction_type, amount, next_execution_date
             FROM recurring_transactions
             WHERE is_active = 1 
               AND next_execution_date >= ?1 
               AND next_execution_date <= ?2
             ORDER BY next_execution_date ASC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let executions = stmt
        .query_map(
            params![
                today.format("%Y-%m-%d").to_string(),
                future_date.format("%Y-%m-%d").to_string()
            ],
            |row| {
                let next_date_str: String = row.get(4)?;
                let next_date = NaiveDate::parse_from_str(&next_date_str, "%Y-%m-%d").unwrap();
                let days_until = (next_date - today).num_days();

                Ok(UpcomingExecution {
                    recurring_id: row.get(0)?,
                    name: row.get(1)?,
                    transaction_type: row.get(2)?,
                    amount: row.get(3)?,
                    next_execution_date: next_date_str,
                    days_until_execution: days_until,
                })
            },
        )
        .map_err(|e| format!("Execution error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(executions)
}

#[tauri::command]
pub fn process_recurring_transactions(
    state: State<'_, AppState>,
) -> Result<Vec<i64>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let today = chrono::Local::now().naive_local().date();
    let today_str = today.format("%Y-%m-%d").to_string();

    let mut stmt = conn
        .prepare(
            "SELECT id, transaction_type, amount, account_id, to_account_id, category_id, 
                    frequency, interval_days, next_execution_date, end_date
             FROM recurring_transactions
             WHERE is_active = 1 AND next_execution_date <= ?1",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let rows = stmt
        .query_map(params![today_str], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, String>(8)?,
                row.get::<_, Option<String>>(9)?,
            ))
        })
        .map_err(|e| format!("Execution error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    drop(stmt);
    // Drop lock before processing
    drop(conn);

    let mut created_transaction_ids = Vec::new();

    for (
        recurring_id, transaction_type, amount, account_id, to_account_id, category_id,
        frequency, interval_days, next_execution_date, end_date
    ) in rows {
        let transaction_input = CreateTransactionInput {
            date: today_str.clone(),
            transaction_type,
            amount,
            account_id,
            to_account_id,
            category_id,
            memo: Some("Auto-generated from recurring transaction".to_string()),
            tag_ids: None,
        };

        match crate::commands::transactions::create_transaction(state.clone(), transaction_input) {
            Ok(txn_id) => {
                created_transaction_ids.push(txn_id);

                let current_date = NaiveDate::parse_from_str(&next_execution_date, "%Y-%m-%d").unwrap();
                let new_next_date = calculate_next_execution_date(&current_date, &frequency, interval_days)?;

                let mut should_deactivate = false;
                if let Some(end_date_str) = &end_date {
                    let parsed_end_date = NaiveDate::parse_from_str(end_date_str, "%Y-%m-%d").unwrap();
                    if new_next_date > parsed_end_date {
                        should_deactivate = true;
                    }
                }

                // Reacquire lock just to update this transaction
                let update_conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

                if should_deactivate {
                    let _ = update_conn.execute(
                        "UPDATE recurring_transactions 
                         SET last_executed_date = ?1, execution_count = execution_count + 1, is_active = 0
                         WHERE id = ?2",
                        params![today_str, recurring_id],
                    );
                } else {
                    let _ = update_conn.execute(
                        "UPDATE recurring_transactions 
                         SET next_execution_date = ?1, last_executed_date = ?2, execution_count = execution_count + 1
                         WHERE id = ?3",
                        params![new_next_date.format("%Y-%m-%d").to_string(), today_str, recurring_id],
                    );
                }
            }
            Err(e) => {
                eprintln!("Failed to create transaction for recurring ID {}: {}", recurring_id, e);
            }
        }
    }

    Ok(created_transaction_ids)
}

fn calculate_next_execution_date(
    current_date: &NaiveDate,
    frequency: &str,
    interval_days: i64,
) -> Result<NaiveDate, String> {
    match frequency {
        "DAILY" => Ok(*current_date + Duration::days(1)),
        "WEEKLY" => Ok(*current_date + Duration::weeks(1)),
        "MONTHLY" => {
            let next_month = if current_date.month() == 12 {
                NaiveDate::from_ymd_opt(current_date.year() + 1, 1, current_date.day())
            } else {
                NaiveDate::from_ymd_opt(
                    current_date.year(),
                    current_date.month() + 1,
                    current_date.day(),
                )
            };
            next_month.ok_or_else(|| "Invalid next month date".to_string())
        }
        "YEARLY" => {
            let next_year = NaiveDate::from_ymd_opt(
                current_date.year() + 1,
                current_date.month(),
                current_date.day(),
            );
            next_year.ok_or_else(|| "Invalid next year date".to_string())
        }
        "CUSTOM" => Ok(*current_date + Duration::days(interval_days)),
        _ => Err("Invalid frequency".to_string()),
    }
}
