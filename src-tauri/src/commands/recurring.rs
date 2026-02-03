// File: src-tauri/src/commands/recurring.rs
use crate::models::recurring::{
    CreateRecurringTransactionInput, RecurringTransaction, RecurringTransactionWithDetails,
    UpcomingExecution, UpdateRecurringTransactionInput,
};
use crate::models::transactions::CreateTransactionInput;
use chrono::{Datelike, Duration, NaiveDate};
use sqlx::{Row, SqlitePool};
use tauri::State;

#[tauri::command]
pub async fn get_recurring_transactions(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<RecurringTransaction>, String> {
    let rows = sqlx::query(
        "SELECT id, name, description, transaction_type, amount, account_id, to_account_id, 
                category_id, frequency, interval_days, start_date, end_date, next_execution_date, 
                is_active, last_executed_date, execution_count, created_at
         FROM recurring_transactions
         ORDER BY next_execution_date ASC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch recurring transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| RecurringTransaction {
            id: row.get("id"),
            name: row.get("name"),
            description: row.get("description"),
            transaction_type: row.get("transaction_type"),
            amount: row.get("amount"),
            account_id: row.get("account_id"),
            to_account_id: row.get("to_account_id"),
            category_id: row.get("category_id"),
            frequency: row.get("frequency"),
            interval_days: row.get("interval_days"),
            start_date: row.get("start_date"),
            end_date: row.get("end_date"),
            next_execution_date: row.get("next_execution_date"),
            is_active: row.get::<i64, _>("is_active") == 1,
            last_executed_date: row.get("last_executed_date"),
            execution_count: row.get("execution_count"),
            created_at: row.get("created_at"),
        })
        .collect())
}

#[tauri::command]
pub async fn get_recurring_transactions_with_details(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<RecurringTransactionWithDetails>, String> {
    let rows = sqlx::query(
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
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch recurring transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| RecurringTransactionWithDetails {
            recurring: RecurringTransaction {
                id: row.get("id"),
                name: row.get("name"),
                description: row.get("description"),
                transaction_type: row.get("transaction_type"),
                amount: row.get("amount"),
                account_id: row.get("account_id"),
                to_account_id: row.get("to_account_id"),
                category_id: row.get("category_id"),
                frequency: row.get("frequency"),
                interval_days: row.get("interval_days"),
                start_date: row.get("start_date"),
                end_date: row.get("end_date"),
                next_execution_date: row.get("next_execution_date"),
                is_active: row.get::<i64, _>("is_active") == 1,
                last_executed_date: row.get("last_executed_date"),
                execution_count: row.get("execution_count"),
                created_at: row.get("created_at"),
            },
            account_name: row.get("account_name"),
            to_account_name: row.get("to_account_name"),
            category_name: row.get("category_name"),
        })
        .collect())
}

#[tauri::command]
pub async fn create_recurring_transaction(
    pool: State<'_, SqlitePool>,
    input: CreateRecurringTransactionInput,
) -> Result<i64, String> {
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

    // Validate interval_days for CUSTOM frequency
    let interval_days = if input.frequency == "CUSTOM" {
        input.interval_days.unwrap_or(1).max(1)
    } else {
        1
    };

    // Validate amount
    if input.amount <= 0.0 {
        return Err("Amount must be greater than zero".to_string());
    }

    // Validate account exists
    let account_exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
        .bind(input.account_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !account_exists {
        return Err("Account does not exist".to_string());
    }

    // Validate transfer requirements
    if input.transaction_type == "TRANSFER" {
        if input.to_account_id.is_none() {
            return Err("Transfer requires to_account_id".to_string());
        }

        let to_account_id = input.to_account_id.unwrap();
        if to_account_id == input.account_id {
            return Err("Cannot transfer to the same account".to_string());
        }

        let to_account_exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
            .bind(to_account_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();

        if !to_account_exists {
            return Err("Destination account does not exist".to_string());
        }
    }

    // Validate category exists if provided
    if let Some(category_id) = input.category_id {
        let category_exists = sqlx::query("SELECT id FROM categories WHERE id = ?")
            .bind(category_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();

        if !category_exists {
            return Err("Category does not exist".to_string());
        }
    }

    // Validate dates
    let start_date = NaiveDate::parse_from_str(&input.start_date, "%Y-%m-%d")
        .map_err(|_| "Invalid start date format. Use YYYY-MM-DD".to_string())?;

    if let Some(end_date_str) = &input.end_date {
        let end_date = NaiveDate::parse_from_str(end_date_str, "%Y-%m-%d")
            .map_err(|_| "Invalid end date format. Use YYYY-MM-DD".to_string())?;

        if end_date <= start_date {
            return Err("End date must be after start date".to_string());
        }
    }

    // Calculate next execution date (same as start date initially)
    let next_execution_date = input.start_date.clone();

    let result = sqlx::query(
        "INSERT INTO recurring_transactions 
         (name, description, transaction_type, amount, account_id, to_account_id, 
          category_id, frequency, interval_days, start_date, end_date, next_execution_date) 
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)",
    )
    .bind(&input.name)
    .bind(&input.description)
    .bind(&input.transaction_type)
    .bind(input.amount)
    .bind(input.account_id)
    .bind(input.to_account_id)
    .bind(input.category_id)
    .bind(&input.frequency)
    .bind(interval_days)
    .bind(&input.start_date)
    .bind(&input.end_date)
    .bind(&next_execution_date)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to create recurring transaction: {}", e))?;

    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn update_recurring_transaction(
    pool: State<'_, SqlitePool>,
    input: UpdateRecurringTransactionInput,
) -> Result<(), String> {
    // Check if recurring transaction exists
    let exists = sqlx::query("SELECT id FROM recurring_transactions WHERE id = ?")
        .bind(input.id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !exists {
        return Err("Recurring transaction not found".to_string());
    }

    let mut updates = Vec::new();
    let mut has_updates = false;

    if let Some(name) = &input.name {
        updates.push(format!("name = '{}'", name.replace("'", "''")));
        has_updates = true;
    }

    if let Some(description) = &input.description {
        updates.push(format!(
            "description = '{}'",
            description.replace("'", "''")
        ));
        has_updates = true;
    }

    if let Some(amount) = input.amount {
        if amount <= 0.0 {
            return Err("Amount must be greater than zero".to_string());
        }
        updates.push(format!("amount = {}", amount));
        has_updates = true;
    }

    if let Some(frequency) = &input.frequency {
        if frequency != "DAILY"
            && frequency != "WEEKLY"
            && frequency != "MONTHLY"
            && frequency != "YEARLY"
            && frequency != "CUSTOM"
        {
            return Err("Invalid frequency".to_string());
        }
        updates.push(format!("frequency = '{}'", frequency));
        has_updates = true;
    }

    if let Some(interval_days) = input.interval_days {
        if interval_days < 1 {
            return Err("Interval days must be at least 1".to_string());
        }
        updates.push(format!("interval_days = {}", interval_days));
        has_updates = true;
    }

    if let Some(end_date) = &input.end_date {
        NaiveDate::parse_from_str(end_date, "%Y-%m-%d")
            .map_err(|_| "Invalid end date format. Use YYYY-MM-DD".to_string())?;
        updates.push(format!("end_date = '{}'", end_date));
        has_updates = true;
    }

    if !has_updates {
        return Err("No fields to update".to_string());
    }

    let query = format!(
        "UPDATE recurring_transactions SET {} WHERE id = {}",
        updates.join(", "),
        input.id
    );

    sqlx::query(&query)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update recurring transaction: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_recurring_transaction(
    pool: State<'_, SqlitePool>,
    recurring_id: i64,
) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM recurring_transactions WHERE id = ?")
        .bind(recurring_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete recurring transaction: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Recurring transaction not found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn toggle_recurring_transaction(
    pool: State<'_, SqlitePool>,
    recurring_id: i64,
) -> Result<bool, String> {
    // Get current state
    let row = sqlx::query("SELECT is_active FROM recurring_transactions WHERE id = ?")
        .bind(recurring_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| "Recurring transaction not found".to_string())?;

    let current_state: i64 = row.get("is_active");
    let new_state = if current_state == 1 { 0 } else { 1 };

    sqlx::query("UPDATE recurring_transactions SET is_active = ? WHERE id = ?")
        .bind(new_state)
        .bind(recurring_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to toggle recurring transaction: {}", e))?;

    Ok(new_state == 1)
}

#[tauri::command]
pub async fn skip_next_occurrence(
    pool: State<'_, SqlitePool>,
    recurring_id: i64,
) -> Result<String, String> {
    // Get recurring transaction
    let row = sqlx::query(
        "SELECT frequency, interval_days, next_execution_date, end_date 
         FROM recurring_transactions 
         WHERE id = ?",
    )
    .bind(recurring_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Recurring transaction not found".to_string())?;

    let frequency: String = row.get("frequency");
    let interval_days: i64 = row.get("interval_days");
    let next_execution_date: String = row.get("next_execution_date");
    let end_date: Option<String> = row.get("end_date");

    let current_date = NaiveDate::parse_from_str(&next_execution_date, "%Y-%m-%d")
        .map_err(|_| "Invalid next execution date in database".to_string())?;

    let new_next_date = calculate_next_execution_date(&current_date, &frequency, interval_days)?;

    // Check if new date exceeds end date
    if let Some(end_date_str) = end_date {
        let end_date = NaiveDate::parse_from_str(&end_date_str, "%Y-%m-%d")
            .map_err(|_| "Invalid end date in database".to_string())?;

        if new_next_date > end_date {
            // Deactivate if past end date
            sqlx::query("UPDATE recurring_transactions SET is_active = 0 WHERE id = ?")
                .bind(recurring_id)
                .execute(pool.inner())
                .await
                .map_err(|e| format!("Failed to deactivate recurring transaction: {}", e))?;

            return Ok(
                "Recurring transaction has reached its end date and was deactivated".to_string(),
            );
        }
    }

    let new_date_str = new_next_date.format("%Y-%m-%d").to_string();

    sqlx::query("UPDATE recurring_transactions SET next_execution_date = ? WHERE id = ?")
        .bind(&new_date_str)
        .bind(recurring_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to skip occurrence: {}", e))?;

    Ok(new_date_str)
}

#[tauri::command]
pub async fn get_upcoming_executions(
    pool: State<'_, SqlitePool>,
    days_ahead: i64,
) -> Result<Vec<UpcomingExecution>, String> {
    let today = chrono::Local::now().naive_local().date();
    let future_date = today + Duration::days(days_ahead);

    let rows = sqlx::query(
        "SELECT id, name, transaction_type, amount, next_execution_date
         FROM recurring_transactions
         WHERE is_active = 1 
           AND next_execution_date >= ? 
           AND next_execution_date <= ?
         ORDER BY next_execution_date ASC",
    )
    .bind(today.format("%Y-%m-%d").to_string())
    .bind(future_date.format("%Y-%m-%d").to_string())
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch upcoming executions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| {
            let next_date_str: String = row.get("next_execution_date");
            let next_date = NaiveDate::parse_from_str(&next_date_str, "%Y-%m-%d").unwrap();
            let days_until = (next_date - today).num_days();

            UpcomingExecution {
                recurring_id: row.get("id"),
                name: row.get("name"),
                transaction_type: row.get("transaction_type"),
                amount: row.get("amount"),
                next_execution_date: next_date_str,
                days_until_execution: days_until,
            }
        })
        .collect())
}

#[tauri::command]
pub async fn process_recurring_transactions(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<i64>, String> {
    let today = chrono::Local::now().naive_local().date();
    let today_str = today.format("%Y-%m-%d").to_string();

    // Get all active recurring transactions that should execute today or before
    let rows = sqlx::query(
        "SELECT id, transaction_type, amount, account_id, to_account_id, category_id, 
                frequency, interval_days, next_execution_date, end_date
         FROM recurring_transactions
         WHERE is_active = 1 AND next_execution_date <= ?",
    )
    .bind(&today_str)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch recurring transactions: {}", e))?;

    let mut created_transaction_ids = Vec::new();

    for row in rows.iter() {
        let recurring_id: i64 = row.get("id");
        let transaction_type: String = row.get("transaction_type");
        let amount: f64 = row.get("amount");
        let account_id: i64 = row.get("account_id");
        let to_account_id: Option<i64> = row.get("to_account_id");
        let category_id: Option<i64> = row.get("category_id");
        let frequency: String = row.get("frequency");
        let interval_days: i64 = row.get("interval_days");
        let next_execution_date: String = row.get("next_execution_date");
        let end_date: Option<String> = row.get("end_date");

        // Create the transaction
        let transaction_input = CreateTransactionInput {
            date: today_str.clone(),
            transaction_type: transaction_type.clone(),
            amount,
            account_id,
            to_account_id,
            category_id,
            memo: Some(format!("Auto-generated from recurring transaction")),
        };

        match crate::commands::transactions::create_transaction(pool.clone(), transaction_input)
            .await
        {
            Ok(txn_id) => {
                created_transaction_ids.push(txn_id);

                // Calculate next execution date
                let current_date =
                    NaiveDate::parse_from_str(&next_execution_date, "%Y-%m-%d").unwrap();
                let new_next_date =
                    calculate_next_execution_date(&current_date, &frequency, interval_days)?;

                // Check if new date exceeds end date
                let mut should_deactivate = false;
                if let Some(end_date_str) = end_date {
                    let end_date = NaiveDate::parse_from_str(&end_date_str, "%Y-%m-%d").unwrap();
                    if new_next_date > end_date {
                        should_deactivate = true;
                    }
                }

                // Update recurring transaction
                if should_deactivate {
                    sqlx::query(
                        "UPDATE recurring_transactions 
                         SET last_executed_date = ?, execution_count = execution_count + 1, is_active = 0
                         WHERE id = ?",
                    )
                    .bind(&today_str)
                    .bind(recurring_id)
                    .execute(pool.inner())
                    .await
                    .map_err(|e| format!("Failed to update recurring transaction: {}", e))?;
                } else {
                    sqlx::query(
                        "UPDATE recurring_transactions 
                         SET next_execution_date = ?, last_executed_date = ?, execution_count = execution_count + 1
                         WHERE id = ?",
                    )
                    .bind(new_next_date.format("%Y-%m-%d").to_string())
                    .bind(&today_str)
                    .bind(recurring_id)
                    .execute(pool.inner())
                    .await
                    .map_err(|e| format!("Failed to update recurring transaction: {}", e))?;
                }
            }
            Err(e) => {
                eprintln!(
                    "Failed to create transaction for recurring ID {}: {}",
                    recurring_id, e
                );
            }
        }
    }

    Ok(created_transaction_ids)
}

// Helper function to calculate next execution date
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
