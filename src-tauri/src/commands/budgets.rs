// File: src-tauri/src/commands/budgets.rs
use crate::models::budget::{
    Budget, BudgetAlert, BudgetStatus, CreateBudgetInput, UpdateBudgetInput,
};
use crate::AppState;
use chrono::{Datelike, NaiveDate};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn get_budgets(state: State<'_, AppState>) -> Result<Vec<Budget>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            "SELECT id, category_id, amount, period, start_date 
             FROM budgets 
             ORDER BY start_date DESC",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let budgets = stmt
        .query_map([], |row| {
            Ok(Budget {
                id: row.get(0)?,
                category_id: row.get(1)?,
                amount: row.get(2)?,
                period: row.get(3)?,
                start_date: row.get(4)?,
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(budgets)
}

#[tauri::command]
pub fn create_budget(
    state: State<'_, AppState>,
    input: CreateBudgetInput,
) -> Result<i64, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Validate period
    if input.period != "MONTHLY" && input.period != "YEARLY" {
        return Err("Period must be MONTHLY or YEARLY".to_string());
    }

    // Validate amount
    if input.amount <= 0.0 {
        return Err("Budget amount must be greater than zero".to_string());
    }

    // Validate category exists
    let category_exists: bool = conn
        .query_row(
            "SELECT COUNT(id) FROM categories WHERE id = ?1",
            params![input.category_id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    if !category_exists {
        return Err("Category does not exist".to_string());
    }

    // Validate date format
    NaiveDate::parse_from_str(&input.start_date, "%Y-%m-%d")
        .map_err(|_| "Invalid date format. Use YYYY-MM-DD".to_string())?;

    // Check if budget already exists for this category and period
    let existing: bool = conn
        .query_row(
            "SELECT COUNT(id) FROM budgets WHERE category_id = ?1 AND period = ?2 AND start_date = ?3",
            params![input.category_id, input.period, input.start_date],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    if existing {
        return Err("Budget already exists for this category and period".to_string());
    }

    conn.execute(
        "INSERT INTO budgets (category_id, amount, period, start_date) VALUES (?1, ?2, ?3, ?4)",
        params![input.category_id, input.amount, input.period, input.start_date],
    )
    .map_err(|e| format!("Failed to create budget: {}", e))?;

    Ok(conn.last_insert_rowid())
}

#[tauri::command]
pub fn update_budget(
    state: State<'_, AppState>,
    input: UpdateBudgetInput,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Check if budget exists
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(id) FROM budgets WHERE id = ?1",
            params![input.id],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    if !exists {
        return Err("Budget not found".to_string());
    }

    let mut updates = Vec::new();

    if let Some(amount) = input.amount {
        if amount <= 0.0 {
            return Err("Budget amount must be greater than zero".to_string());
        }
        updates.push(format!("amount = {}", amount));
    }

    if let Some(start_date) = &input.start_date {
        NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
            .map_err(|_| "Invalid date format. Use YYYY-MM-DD".to_string())?;
        updates.push(format!("start_date = '{}'", start_date));
    }

    if updates.is_empty() {
        return Err("No fields to update".to_string());
    }

    let query = format!(
        "UPDATE budgets SET {} WHERE id = {}",
        updates.join(", "),
        input.id
    );

    conn.execute(&query, [])
        .map_err(|e| format!("Failed to update budget: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn delete_budget(state: State<'_, AppState>, budget_id: i64) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let rows_affected = conn
        .execute("DELETE FROM budgets WHERE id = ?1", params![budget_id])
        .map_err(|e| format!("Failed to delete budget: {}", e))?;

    if rows_affected == 0 {
        return Err("Budget not found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn get_budget_status(
    state: State<'_, AppState>,
    budget_id: i64,
) -> Result<BudgetStatus, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    get_budget_status_internal(&conn, budget_id)
}

fn get_budget_status_internal(
    conn: &rusqlite::Connection,
    budget_id: i64,
) -> Result<BudgetStatus, String> {
    // Get budget details
    let mut stmt = conn.prepare(
        "SELECT b.id, b.category_id, b.amount, b.period, b.start_date, c.name as category_name
         FROM budgets b
         INNER JOIN categories c ON b.category_id = c.id
         WHERE b.id = ?1",
    ).map_err(|e| format!("Query error: {}", e))?;

    let (budget, category_name) = stmt.query_row(params![budget_id], |row| {
        Ok((
            Budget {
                id: row.get(0)?,
                category_id: row.get(1)?,
                amount: row.get(2)?,
                period: row.get(3)?,
                start_date: row.get(4)?,
            },
            row.get::<_, String>(5)?,
        ))
    }).map_err(|_| "Budget not found".to_string())?;

    // Calculate date range for the budget period
    let start_date = NaiveDate::parse_from_str(&budget.start_date, "%Y-%m-%d")
        .map_err(|_| "Invalid start date in database".to_string())?;

    let end_date = match budget.period.as_str() {
        "MONTHLY" => {
            let next_month = if start_date.month() == 12 {
                NaiveDate::from_ymd_opt(start_date.year() + 1, 1, start_date.day())
            } else {
                NaiveDate::from_ymd_opt(start_date.year(), start_date.month() + 1, start_date.day())
            };
            next_month.unwrap_or(start_date)
        }
        "YEARLY" => {
            NaiveDate::from_ymd_opt(start_date.year() + 1, start_date.month(), start_date.day())
                .unwrap_or(start_date)
        }
        _ => return Err("Invalid budget period".to_string()),
    };

    let today = chrono::Local::now().naive_local().date();
    let days_remaining = (end_date - today).num_days().max(0);

    // Calculate actual spending (including subcategories)
    let spent_amount: f64 = conn.query_row(
        "SELECT CAST(COALESCE(SUM(t.amount), 0) AS REAL) as spent_amount
         FROM transactions t
         INNER JOIN categories c ON t.category_id = c.id
         WHERE t.type = 'EXPENSE'
           AND t.date >= ?1 AND t.date < ?2
           AND (c.id = ?3 OR c.parent_id = ?4)",
        params![
            budget.start_date,
            end_date.format("%Y-%m-%d").to_string(),
            budget.category_id,
            budget.category_id
        ],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let remaining_amount = budget.amount - spent_amount;
    let percentage_used = if budget.amount > 0.0 {
        (spent_amount / budget.amount) * 100.0
    } else {
        0.0
    };

    // Calculate daily averages
    let days_elapsed = (today - start_date).num_days().max(1);
    let daily_average_spent = spent_amount / days_elapsed as f64;
    let daily_budget_remaining = if days_remaining > 0 {
        remaining_amount / days_remaining as f64
    } else {
        0.0
    };

    Ok(BudgetStatus {
        budget: budget.clone(),
        category_name,
        spent_amount,
        remaining_amount,
        percentage_used,
        days_remaining,
        daily_average_spent,
        daily_budget_remaining,
        is_over_budget: spent_amount > budget.amount,
    })
}

#[tauri::command]
pub fn get_all_budget_statuses(
    state: State<'_, AppState>,
) -> Result<Vec<BudgetStatus>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare("SELECT id FROM budgets")
        .map_err(|e| format!("Query error: {}", e))?;

    let budget_ids: Vec<i64> = stmt.query_map([], |row| row.get(0))
        .map_err(|e| format!("Execute error: {}", e))?
        .filter_map(Result::ok)
        .collect();

    let mut statuses = Vec::new();

    for budget_id in budget_ids {
        match get_budget_status_internal(&conn, budget_id) {
            Ok(status) => statuses.push(status),
            Err(e) => eprintln!("Failed to get status for budget {}: {}", budget_id, e),
        }
    }

    Ok(statuses)
}

#[tauri::command]
pub fn get_budget_alerts(state: State<'_, AppState>) -> Result<Vec<BudgetAlert>, String> {
    let statuses = get_all_budget_statuses(state)?;

    let alerts: Vec<BudgetAlert> = statuses
        .into_iter()
        .filter_map(|status| {
            let alert_level = if status.percentage_used >= 120.0 {
                Some("CRITICAL")
            } else if status.percentage_used >= 100.0 {
                Some("DANGER")
            } else if status.percentage_used >= 80.0 {
                Some("WARNING")
            } else {
                None
            };

            alert_level.map(|level| BudgetAlert {
                budget_id: status.budget.id,
                category_name: status.category_name,
                budget_amount: status.budget.amount,
                spent_amount: status.spent_amount,
                percentage_used: status.percentage_used,
                alert_level: level.to_string(),
            })
        })
        .collect();

    Ok(alerts)
}
