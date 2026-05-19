// File: src-tauri/src/commands/recurring.rs
use crate::models::recurring::{
    CreateRecurringTransactionInput, RecurringExecutionLog, RecurringTransaction,
    RecurringTransactionWithDetails, UpcomingExecution, UpdateRecurringTransactionInput,
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
                    is_active, last_executed_date, execution_count, created_at,
                    amount_mode, resume_date, active_months, auto_approve
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
                amount_mode: row.get(17)?,
                resume_date: row.get(18)?,
                active_months: row.get(19)?,
                auto_approve: row.get::<_, i64>(20)? == 1,
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
                rt.amount_mode, rt.resume_date, rt.active_months, rt.auto_approve,
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
                    amount_mode: row.get(17)?,
                    resume_date: row.get(18)?,
                    active_months: row.get(19)?,
                    auto_approve: row.get::<_, i64>(20)? == 1,
                },
                account_name: row.get(21)?,
                to_account_name: row.get(22)?,
                category_name: row.get(23)?,
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
        // VARIABLE mode allows 0 as placeholder amount
        let amount_mode = input.amount_mode.as_deref().unwrap_or("FIXED");
        if amount_mode != "VARIABLE" {
            return Err("Amount must be greater than zero".to_string());
        }
    }

    // Validate amount_mode
    let amount_mode = input.amount_mode.as_deref().unwrap_or("FIXED");
    if amount_mode != "FIXED" && amount_mode != "VARIABLE" {
        return Err("amount_mode must be FIXED or VARIABLE".to_string());
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

    // Variable amount mode forces manual approval
    let auto_approve = if amount_mode == "VARIABLE" {
        false
    } else {
        input.auto_approve.unwrap_or(false)
    };

    conn.execute(
        "INSERT INTO recurring_transactions 
         (name, description, transaction_type, amount, account_id, to_account_id, 
          category_id, frequency, interval_days, start_date, end_date, next_execution_date,
          amount_mode, active_months, auto_approve) 
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12, ?13, ?14, ?15)",
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
            next_execution_date,
            amount_mode,
            input.active_months,
            auto_approve as i64
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
    if let Some(amount_mode) = &input.amount_mode {
        if amount_mode != "FIXED" && amount_mode != "VARIABLE" {
            return Err("amount_mode must be FIXED or VARIABLE".to_string());
        }
        updates.push(format!("amount_mode = '{}'", amount_mode));
    }
    if let Some(resume_date) = &input.resume_date {
        if !resume_date.is_empty() {
            NaiveDate::parse_from_str(resume_date, "%Y-%m-%d")
                .map_err(|_| "Invalid resume date format")?;
            updates.push(format!("resume_date = '{}'", resume_date));
        } else {
            updates.push("resume_date = NULL".to_string());
        }
    }
    if let Some(active_months) = &input.active_months {
        if !active_months.is_empty() {
            updates.push(format!("active_months = '{}'", active_months.replace('\'', "''")));
        } else {
            updates.push("active_months = NULL".to_string());
        }
    }
    if let Some(auto_approve) = input.auto_approve {
        updates.push(format!("auto_approve = {}", if auto_approve { 1 } else { 0 }));
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

    // Write skip log
    let today_str = chrono::Local::now().naive_local().date().format("%Y-%m-%d").to_string();
    let _ = conn.execute(
        "INSERT INTO recurring_execution_log (recurring_id, execution_date, status, notes)
         VALUES (?1, ?2, 'SKIPPED', 'Manually skipped')",
        params![recurring_id, today_str],
    );

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
        frequency, interval_days, next_execution_date, end_date, is_active, amount_mode
    ): (String, f64, i64, Option<i64>, Option<i64>, String, i64, String, Option<String>, i64, String) = conn
        .query_row(
            "SELECT transaction_type, amount, account_id, to_account_id, category_id,
                    frequency, interval_days, next_execution_date, end_date, is_active, amount_mode
             FROM recurring_transactions
             WHERE id = ?1",
            params![recurring_id],
            |row| Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?, row.get(4)?,
                row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?, row.get(10)?
            )),
        )
        .map_err(|_| "Recurring transaction not found".to_string())?;

    if is_active == 0 {
        return Err("Cannot execute a paused recurring transaction. Activate it first.".to_string());
    }

    if amount_mode == "VARIABLE" {
        return Err("Variable recurring transactions require manual amount confirmation. Use confirm_variable_amount instead.".to_string());
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
    // Write execution log
    let _ = conn.execute(
        "INSERT INTO recurring_execution_log (recurring_id, execution_date, status, amount, transaction_id, notes)
         VALUES (?1, ?2, 'SUCCESS', ?3, ?4, 'Auto-executed')",
        params![recurring_id, today_str, amount, txn_id],
    );

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

// ======================== NEW COMMANDS (V1.2.0) ========================

/// Check if a given month is active for a recurring transaction.
pub fn is_month_active(active_months: &Option<String>, month: u32) -> bool {
    match active_months {
        None => true,
        Some(months_str) if months_str.is_empty() => true,
        Some(months_str) => months_str
            .split(',')
            .any(|m| m.trim().parse::<u32>().map(|v| v == month).unwrap_or(false)),
    }
}

#[tauri::command]
pub fn get_execution_history(
    state: State<'_, AppState>,
    recurring_id: i64,
) -> Result<Vec<RecurringExecutionLog>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, recurring_id, execution_date, status, amount, transaction_id, notes, created_at
             FROM recurring_execution_log
             WHERE recurring_id = ?1
             ORDER BY execution_date DESC
             LIMIT 50",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let logs = stmt
        .query_map(params![recurring_id], |row| {
            Ok(RecurringExecutionLog {
                id: row.get(0)?,
                recurring_id: row.get(1)?,
                execution_date: row.get(2)?,
                status: row.get(3)?,
                amount: row.get(4)?,
                transaction_id: row.get(5)?,
                notes: row.get(6)?,
                created_at: row.get(7)?,
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(logs)
}

#[tauri::command]
pub fn confirm_variable_amount(
    state: State<'_, AppState>,
    recurring_id: i64,
    amount: f64,
) -> Result<i64, String> {
    if amount <= 0.0 {
        return Err("Amount must be greater than zero".to_string());
    }

    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let (
        transaction_type, account_id, to_account_id, category_id,
        frequency, interval_days, next_execution_date, end_date, is_active, amount_mode
    ): (String, i64, Option<i64>, Option<i64>, String, i64, String, Option<String>, i64, String) = conn
        .query_row(
            "SELECT transaction_type, account_id, to_account_id, category_id,
                    frequency, interval_days, next_execution_date, end_date, is_active, amount_mode
             FROM recurring_transactions
             WHERE id = ?1",
            params![recurring_id],
            |row| Ok((
                row.get(0)?, row.get(1)?, row.get(2)?, row.get(3)?,
                row.get(4)?, row.get(5)?, row.get(6)?, row.get(7)?, row.get(8)?, row.get(9)?
            )),
        )
        .map_err(|_| "Recurring transaction not found".to_string())?;

    if is_active == 0 {
        return Err("Cannot execute a paused recurring transaction".to_string());
    }
    if amount_mode != "VARIABLE" {
        return Err("This command is only for VARIABLE recurring transactions".to_string());
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
        memo: Some(format!("Variable recurring — confirmed amount: {:.2}", amount)),
        tag_ids: None,
    };

    drop(conn);

    let txn_id = crate::commands::transactions::create_transaction(state.clone(), transaction_input)
        .map_err(|e| format!("Failed to create transaction: {}", e))?;

    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let current_date = NaiveDate::parse_from_str(&next_execution_date, "%Y-%m-%d")
        .map_err(|_| "Invalid next execution date".to_string())?;
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
            "UPDATE recurring_transactions SET last_executed_date = ?1, execution_count = execution_count + 1, is_active = 0 WHERE id = ?2",
            params![today_str, recurring_id],
        ).map_err(|e| format!("Failed to update: {}", e))?;
    } else {
        conn.execute(
            "UPDATE recurring_transactions SET next_execution_date = ?1, last_executed_date = ?2, execution_count = execution_count + 1 WHERE id = ?3",
            params![new_next_date.format("%Y-%m-%d").to_string(), today_str, recurring_id],
        ).map_err(|e| format!("Failed to update: {}", e))?;
    }

    // Write execution log
    let _ = conn.execute(
        "INSERT INTO recurring_execution_log (recurring_id, execution_date, status, amount, transaction_id, notes)
         VALUES (?1, ?2, 'SUCCESS', ?3, ?4, 'Variable amount confirmed by user')",
        params![recurring_id, today_str, amount, txn_id],
    );

    Ok(txn_id)
}

#[tauri::command]
pub fn pause_with_resume(
    state: State<'_, AppState>,
    recurring_id: i64,
    resume_date: Option<String>,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    if let Some(ref date_str) = resume_date {
        if !date_str.is_empty() {
            NaiveDate::parse_from_str(date_str, "%Y-%m-%d")
                .map_err(|_| "Invalid resume date format. Use YYYY-MM-DD".to_string())?;
        }
    }

    conn.execute(
        "UPDATE recurring_transactions SET is_active = 0, resume_date = ?1 WHERE id = ?2",
        params![resume_date, recurring_id],
    )
    .map_err(|e| format!("Failed to pause: {}", e))?;

    Ok(())
}

/// Called on app startup or bill refresh. Reactivates paused items whose resume_date has arrived.
pub fn check_and_resume(pool: &std::sync::Mutex<rusqlite::Connection>) -> Result<(), String> {
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
    let today_str = chrono::Local::now().naive_local().date().format("%Y-%m-%d").to_string();

    conn.execute(
        "UPDATE recurring_transactions SET is_active = 1, resume_date = NULL
         WHERE is_active = 0 AND resume_date IS NOT NULL AND resume_date <= ?1",
        params![today_str],
    )
    .map_err(|e| format!("Failed to auto-resume: {}", e))?;

    Ok(())
}

/// Auto-execute all due recurring transactions that have auto_approve=1 and amount_mode='FIXED'.
/// Called before loading the bills widget, so auto-approved items never sit in the pending list.
pub fn process_auto_approvals(pool: &std::sync::Mutex<rusqlite::Connection>) -> Result<Vec<i64>, String> {
    let today = chrono::Local::now().naive_local().date();
    let today_str = today.format("%Y-%m-%d").to_string();
    let current_month = today.month();
    let mut executed_ids: Vec<i64> = Vec::new();

    // Collect all auto-approvable items
    let items: Vec<(i64, String, f64, i64, Option<i64>, Option<i64>, String, i64, Option<String>, Option<String>)> = {
        let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
        let mut stmt = conn.prepare(
            "SELECT id, transaction_type, amount, account_id, to_account_id, category_id,
                    frequency, interval_days, end_date, active_months
             FROM recurring_transactions
             WHERE is_active = 1
               AND auto_approve = 1
               AND amount_mode = 'FIXED'
               AND next_execution_date <= ?1"
        ).map_err(|e| format!("Query error: {}", e))?;

        let rows = stmt.query_map(params![today_str], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
                row.get::<_, i64>(3)?,
                row.get::<_, Option<i64>>(4)?,
                row.get::<_, Option<i64>>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, i64>(7)?,
                row.get::<_, Option<String>>(8)?,
                row.get::<_, Option<String>>(9)?,
            ))
        }).map_err(|e| format!("Execute error: {}", e))?;

        rows.filter_map(|r| r.ok()).collect()
    };

    for (id, txn_type, amount, account_id, to_account_id, category_id, frequency, interval_days, end_date, active_months) in items {
        // Skip if not in active month
        if !is_month_active(&active_months, current_month) {
            // Advance the next_execution_date silently
            let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
            if let Ok(next_str) = conn.query_row(
                "SELECT next_execution_date FROM recurring_transactions WHERE id = ?1",
                params![id],
                |row| row.get::<_, String>(0),
            ) {
                if let Ok(current_date) = NaiveDate::parse_from_str(&next_str, "%Y-%m-%d") {
                    if let Ok(new_date) = calculate_next_execution_date(&current_date, &frequency, interval_days) {
                        let _ = conn.execute(
                            "UPDATE recurring_transactions SET next_execution_date = ?1 WHERE id = ?2",
                            params![new_date.format("%Y-%m-%d").to_string(), id],
                        );
                    }
                }
            }
            continue;
        }

        // Create the transaction
        let transaction_input = crate::models::transactions::CreateTransactionInput {
            date: today_str.clone(),
            transaction_type: txn_type,
            amount,
            account_id,
            to_account_id,
            category_id,
            memo: Some("Auto-executed from recurring transaction".to_string()),
            tag_ids: None,
        };

        // Insert transaction directly using pool
        let txn_id = {
            let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

            // Insert the transaction
            conn.execute(
                "INSERT INTO transactions (date, transaction_type, amount, account_id, to_account_id, category_id, memo)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)",
                params![
                    transaction_input.date,
                    transaction_input.transaction_type,
                    transaction_input.amount,
                    transaction_input.account_id,
                    transaction_input.to_account_id,
                    transaction_input.category_id,
                    transaction_input.memo
                ],
            ).map_err(|e| format!("Failed to auto-execute transaction: {}", e))?;

            let txn_id = conn.last_insert_rowid();

            // Update account balances
            match transaction_input.transaction_type.as_str() {
                "INCOME" => {
                    conn.execute(
                        "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
                        params![transaction_input.amount, transaction_input.account_id],
                    ).ok();
                }
                "EXPENSE" => {
                    conn.execute(
                        "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
                        params![transaction_input.amount, transaction_input.account_id],
                    ).ok();
                }
                "TRANSFER" => {
                    conn.execute(
                        "UPDATE accounts SET balance = balance - ?1 WHERE id = ?2",
                        params![transaction_input.amount, transaction_input.account_id],
                    ).ok();
                    if let Some(to_id) = transaction_input.to_account_id {
                        conn.execute(
                            "UPDATE accounts SET balance = balance + ?1 WHERE id = ?2",
                            params![transaction_input.amount, to_id],
                        ).ok();
                    }
                }
                _ => {}
            }

            // Update recurring transaction
            let next_str: String = conn.query_row(
                "SELECT next_execution_date FROM recurring_transactions WHERE id = ?1",
                params![id],
                |row| row.get(0),
            ).map_err(|_| "Not found".to_string())?;

            let current_date = NaiveDate::parse_from_str(&next_str, "%Y-%m-%d")
                .map_err(|_| "Invalid date".to_string())?;
            let new_next_date = calculate_next_execution_date(&current_date, &frequency, interval_days)?;

            let mut should_deactivate = false;
            if let Some(ref end_date_str) = end_date {
                if let Ok(end_date_parsed) = NaiveDate::parse_from_str(end_date_str, "%Y-%m-%d") {
                    if new_next_date > end_date_parsed {
                        should_deactivate = true;
                    }
                }
            }

            if should_deactivate {
                conn.execute(
                    "UPDATE recurring_transactions SET last_executed_date = ?1, execution_count = execution_count + 1, is_active = 0 WHERE id = ?2",
                    params![today_str, id],
                ).ok();
            } else {
                conn.execute(
                    "UPDATE recurring_transactions SET next_execution_date = ?1, last_executed_date = ?2, execution_count = execution_count + 1 WHERE id = ?3",
                    params![new_next_date.format("%Y-%m-%d").to_string(), today_str, id],
                ).ok();
            }

            // Write execution log
            conn.execute(
                "INSERT INTO recurring_execution_log (recurring_id, execution_date, status, amount, transaction_id, notes)
                 VALUES (?1, ?2, 'SUCCESS', ?3, ?4, 'Auto-approved execution')",
                params![id, today_str, amount, txn_id],
            ).ok();

            txn_id
        };

        executed_ids.push(txn_id);
    }

    Ok(executed_ids)
}
