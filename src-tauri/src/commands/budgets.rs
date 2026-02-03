// File: src-tauri/src/commands/budgets.rs
use crate::models::budget::{
    Budget, BudgetAlert, BudgetStatus, CreateBudgetInput, UpdateBudgetInput,
};
use chrono::{Datelike, NaiveDate};
use sqlx::{Row, SqlitePool};
use tauri::State;

#[tauri::command]
pub async fn get_budgets(pool: State<'_, SqlitePool>) -> Result<Vec<Budget>, String> {
    let rows = sqlx::query(
        "SELECT id, category_id, amount, period, start_date 
         FROM budgets 
         ORDER BY start_date DESC",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch budgets: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| Budget {
            id: row.get("id"),
            category_id: row.get("category_id"),
            amount: row.get("amount"),
            period: row.get("period"),
            start_date: row.get("start_date"),
        })
        .collect())
}

#[tauri::command]
pub async fn create_budget(
    pool: State<'_, SqlitePool>,
    input: CreateBudgetInput,
) -> Result<i64, String> {
    // Validate period
    if input.period != "MONTHLY" && input.period != "YEARLY" {
        return Err("Period must be MONTHLY or YEARLY".to_string());
    }

    // Validate amount
    if input.amount <= 0.0 {
        return Err("Budget amount must be greater than zero".to_string());
    }

    // Validate category exists
    let category_exists = sqlx::query("SELECT id FROM categories WHERE id = ?")
        .bind(input.category_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !category_exists {
        return Err("Category does not exist".to_string());
    }

    // Validate date format
    NaiveDate::parse_from_str(&input.start_date, "%Y-%m-%d")
        .map_err(|_| "Invalid date format. Use YYYY-MM-DD".to_string())?;

    // Check if budget already exists for this category and period
    let existing = sqlx::query(
        "SELECT id FROM budgets 
         WHERE category_id = ? AND period = ? AND start_date = ?",
    )
    .bind(input.category_id)
    .bind(&input.period)
    .bind(&input.start_date)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if existing.is_some() {
        return Err("Budget already exists for this category and period".to_string());
    }

    let result = sqlx::query(
        "INSERT INTO budgets (category_id, amount, period, start_date) 
         VALUES (?, ?, ?, ?)",
    )
    .bind(input.category_id)
    .bind(input.amount)
    .bind(input.period)
    .bind(input.start_date)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to create budget: {}", e))?;

    Ok(result.last_insert_rowid())
}

#[tauri::command]
pub async fn update_budget(
    pool: State<'_, SqlitePool>,
    input: UpdateBudgetInput,
) -> Result<(), String> {
    // Check if budget exists
    let exists = sqlx::query("SELECT id FROM budgets WHERE id = ?")
        .bind(input.id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !exists {
        return Err("Budget not found".to_string());
    }

    let mut updates = Vec::new();
    let mut has_updates = false;

    if let Some(amount) = input.amount {
        if amount <= 0.0 {
            return Err("Budget amount must be greater than zero".to_string());
        }
        updates.push(format!("amount = {}", amount));
        has_updates = true;
    }

    if let Some(start_date) = &input.start_date {
        NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
            .map_err(|_| "Invalid date format. Use YYYY-MM-DD".to_string())?;
        updates.push(format!("start_date = '{}'", start_date));
        has_updates = true;
    }

    if !has_updates {
        return Err("No fields to update".to_string());
    }

    let query = format!(
        "UPDATE budgets SET {} WHERE id = {}",
        updates.join(", "),
        input.id
    );

    sqlx::query(&query)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update budget: {}", e))?;

    Ok(())
}

#[tauri::command]
pub async fn delete_budget(pool: State<'_, SqlitePool>, budget_id: i64) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM budgets WHERE id = ?")
        .bind(budget_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete budget: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Budget not found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub async fn get_budget_status(
    pool: State<'_, SqlitePool>,
    budget_id: i64,
) -> Result<BudgetStatus, String> {
    // Get budget details
    let budget_row = sqlx::query(
        "SELECT b.id, b.category_id, b.amount, b.period, b.start_date, c.name as category_name
         FROM budgets b
         INNER JOIN categories c ON b.category_id = c.id
         WHERE b.id = ?",
    )
    .bind(budget_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Budget not found".to_string())?;

    let budget = Budget {
        id: budget_row.get("id"),
        category_id: budget_row.get("category_id"),
        amount: budget_row.get("amount"),
        period: budget_row.get("period"),
        start_date: budget_row.get("start_date"),
    };

    let category_name: String = budget_row.get("category_name");

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
    let spent_row = sqlx::query(
        "SELECT CAST(COALESCE(SUM(t.amount), 0) AS REAL) as spent_amount
         FROM transactions t
         INNER JOIN categories c ON t.category_id = c.id
         WHERE t.type = 'EXPENSE'
           AND t.date >= ? AND t.date < ?
           AND (c.id = ? OR c.parent_id = ?)",
    )
    .bind(budget.start_date.clone())
    .bind(end_date.format("%Y-%m-%d").to_string())
    .bind(budget.category_id)
    .bind(budget.category_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to calculate spending: {}", e))?;

    let spent_amount: f64 = spent_row.get("spent_amount");
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
        budget: budget.clone(), // Clone here to avoid move
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
pub async fn get_all_budget_statuses(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<BudgetStatus>, String> {
    let budget_ids = sqlx::query("SELECT id FROM budgets")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| format!("Failed to fetch budgets: {}", e))?;

    let mut statuses = Vec::new();

    for row in budget_ids.iter() {
        let budget_id: i64 = row.get("id");
        match get_budget_status(pool.clone(), budget_id).await {
            Ok(status) => statuses.push(status),
            Err(e) => eprintln!("Failed to get status for budget {}: {}", budget_id, e),
        }
    }

    Ok(statuses)
}

#[tauri::command]
pub async fn get_budget_alerts(pool: State<'_, SqlitePool>) -> Result<Vec<BudgetAlert>, String> {
    let statuses = get_all_budget_statuses(pool).await?;

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
