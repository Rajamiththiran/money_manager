// File: src-tauri/src/commands/goals.rs
use crate::models::goal::*;
use chrono::{Duration, NaiveDate};
use sqlx::{Row, SqlitePool};
use tauri::State;

// ======================== CRUD ========================

#[tauri::command]
pub async fn create_goal(
    pool: State<'_, SqlitePool>,
    input: CreateGoalInput,
) -> Result<SavingsGoal, String> {
    if input.target_amount <= 0.0 {
        return Err("Target amount must be greater than zero".to_string());
    }

    // Validate linked account if provided
    if let Some(account_id) = input.linked_account_id {
        let exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
            .bind(account_id)
            .fetch_optional(pool.inner())
            .await
            .map_err(|e| format!("Database error: {}", e))?
            .is_some();
        if !exists {
            return Err("Linked account does not exist".to_string());
        }
    }

    let color = input.color.unwrap_or_else(|| "#6B7280".to_string());
    let icon = input.icon.unwrap_or_else(|| "target".to_string());

    let result = sqlx::query(
        "INSERT INTO savings_goals (name, target_amount, target_date, linked_account_id, color, icon)
         VALUES (?, ?, ?, ?, ?, ?)",
    )
    .bind(&input.name)
    .bind(input.target_amount)
    .bind(&input.target_date)
    .bind(input.linked_account_id)
    .bind(&color)
    .bind(&icon)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to create goal: {}", e))?;

    let goal_id = result.last_insert_rowid();
    get_goal_by_id(pool.inner(), goal_id).await
}

#[tauri::command]
pub async fn get_goals(
    pool: State<'_, SqlitePool>,
    status_filter: Option<String>,
) -> Result<Vec<GoalWithProgress>, String> {
    let goals = if let Some(status) = &status_filter {
        sqlx::query(
            "SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at
             FROM savings_goals WHERE status = ? ORDER BY created_at DESC",
        )
        .bind(status)
        .fetch_all(pool.inner())
        .await
    } else {
        sqlx::query(
            "SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at
             FROM savings_goals ORDER BY
             CASE status WHEN 'ACTIVE' THEN 1 WHEN 'PAUSED' THEN 2 WHEN 'COMPLETED' THEN 3 WHEN 'ARCHIVED' THEN 4 END,
             created_at DESC",
        )
        .fetch_all(pool.inner())
        .await
    }
    .map_err(|e| format!("Failed to fetch goals: {}", e))?;

    let mut results = Vec::new();
    for row in &goals {
        let goal = row_to_goal(row);
        let progress = calculate_progress(pool.inner(), &goal).await?;
        let linked_account_name = if let Some(account_id) = goal.linked_account_id {
            sqlx::query("SELECT name FROM accounts WHERE id = ?")
                .bind(account_id)
                .fetch_optional(pool.inner())
                .await
                .ok()
                .flatten()
                .map(|r| r.get::<String, _>("name"))
        } else {
            None
        };
        results.push(GoalWithProgress {
            goal,
            progress,
            linked_account_name,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_goal_progress(
    pool: State<'_, SqlitePool>,
    goal_id: i64,
) -> Result<GoalProgress, String> {
    let goal = get_goal_by_id(pool.inner(), goal_id).await?;
    calculate_progress(pool.inner(), &goal).await
}

#[tauri::command]
pub async fn update_goal(
    pool: State<'_, SqlitePool>,
    input: UpdateGoalInput,
) -> Result<SavingsGoal, String> {
    // Verify goal exists
    let _goal = get_goal_by_id(pool.inner(), input.id).await?;

    let mut updates = Vec::new();

    if let Some(name) = &input.name {
        updates.push(format!("name = '{}'", name.replace('\'', "''")));
    }
    if let Some(target_amount) = input.target_amount {
        if target_amount <= 0.0 {
            return Err("Target amount must be greater than zero".to_string());
        }
        updates.push(format!("target_amount = {}", target_amount));
    }
    if let Some(target_date) = &input.target_date {
        if target_date.is_empty() {
            updates.push("target_date = NULL".to_string());
        } else {
            updates.push(format!("target_date = '{}'", target_date));
        }
    }
    if let Some(color) = &input.color {
        updates.push(format!("color = '{}'", color));
    }
    if let Some(icon) = &input.icon {
        updates.push(format!("icon = '{}'", icon));
    }

    if updates.is_empty() {
        return Err("No fields to update".to_string());
    }

    updates.push("updated_at = datetime('now')".to_string());

    let query = format!(
        "UPDATE savings_goals SET {} WHERE id = {}",
        updates.join(", "),
        input.id
    );

    sqlx::query(&query)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update goal: {}", e))?;

    get_goal_by_id(pool.inner(), input.id).await
}

#[tauri::command]
pub async fn delete_goal(
    pool: State<'_, SqlitePool>,
    goal_id: i64,
) -> Result<(), String> {
    let result = sqlx::query("DELETE FROM savings_goals WHERE id = ?")
        .bind(goal_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete goal: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Goal not found".to_string());
    }
    Ok(())
}

// ======================== CONTRIBUTIONS ========================

#[tauri::command]
pub async fn add_goal_contribution(
    pool: State<'_, SqlitePool>,
    input: AddContributionInput,
) -> Result<GoalContribution, String> {
    let goal = get_goal_by_id(pool.inner(), input.goal_id).await?;

    if goal.linked_account_id.is_some() {
        return Err("Cannot add manual contributions to an account-linked goal. The progress is tracked automatically from the account balance.".to_string());
    }

    if goal.status != "ACTIVE" {
        return Err(format!("Cannot add contributions to a {} goal", goal.status.to_lowercase()));
    }

    let result = sqlx::query(
        "INSERT INTO goal_contributions (goal_id, amount, contribution_date, note)
         VALUES (?, ?, ?, ?)",
    )
    .bind(input.goal_id)
    .bind(input.amount)
    .bind(&input.date)
    .bind(&input.note)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to add contribution: {}", e))?;

    let contribution_id = result.last_insert_rowid();

    let row = sqlx::query(
        "SELECT id, goal_id, amount, contribution_date, note, created_at
         FROM goal_contributions WHERE id = ?",
    )
    .bind(contribution_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch contribution: {}", e))?;

    Ok(GoalContribution {
        id: row.get("id"),
        goal_id: row.get("goal_id"),
        amount: row.get("amount"),
        contribution_date: row.get("contribution_date"),
        note: row.get("note"),
        created_at: row.get("created_at"),
    })
}

// ======================== LIFECYCLE ========================

#[tauri::command]
pub async fn complete_goal(
    pool: State<'_, SqlitePool>,
    goal_id: i64,
) -> Result<(), String> {
    let goal = get_goal_by_id(pool.inner(), goal_id).await?;
    if goal.status != "ACTIVE" {
        return Err(format!("Only active goals can be completed. Current status: {}", goal.status));
    }
    update_goal_status(pool.inner(), goal_id, "COMPLETED").await
}

#[tauri::command]
pub async fn pause_goal(
    pool: State<'_, SqlitePool>,
    goal_id: i64,
) -> Result<(), String> {
    let goal = get_goal_by_id(pool.inner(), goal_id).await?;
    if goal.status != "ACTIVE" {
        return Err(format!("Only active goals can be paused. Current status: {}", goal.status));
    }
    update_goal_status(pool.inner(), goal_id, "PAUSED").await
}

#[tauri::command]
pub async fn resume_goal(
    pool: State<'_, SqlitePool>,
    goal_id: i64,
) -> Result<(), String> {
    let goal = get_goal_by_id(pool.inner(), goal_id).await?;
    if goal.status != "PAUSED" {
        return Err(format!("Only paused goals can be resumed. Current status: {}", goal.status));
    }
    update_goal_status(pool.inner(), goal_id, "ACTIVE").await
}

#[tauri::command]
pub async fn archive_goal(
    pool: State<'_, SqlitePool>,
    goal_id: i64,
) -> Result<(), String> {
    let _goal = get_goal_by_id(pool.inner(), goal_id).await?;
    update_goal_status(pool.inner(), goal_id, "ARCHIVED").await
}

// ======================== HELPERS ========================

fn row_to_goal(row: &sqlx::sqlite::SqliteRow) -> SavingsGoal {
    SavingsGoal {
        id: row.get("id"),
        name: row.get("name"),
        target_amount: row.get("target_amount"),
        target_date: row.get("target_date"),
        linked_account_id: row.get("linked_account_id"),
        color: row.get("color"),
        icon: row.get("icon"),
        status: row.get("status"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

async fn get_goal_by_id(pool: &SqlitePool, goal_id: i64) -> Result<SavingsGoal, String> {
    let row = sqlx::query(
        "SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at
         FROM savings_goals WHERE id = ?",
    )
    .bind(goal_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Goal not found".to_string())?;

    Ok(row_to_goal(&row))
}

async fn calculate_progress(pool: &SqlitePool, goal: &SavingsGoal) -> Result<GoalProgress, String> {
    let today = chrono::Local::now().naive_local().date();

    // Calculate current amount based on goal type
    let current_amount = if let Some(account_id) = goal.linked_account_id {
        // Linked goal: current = account balance
        let row = sqlx::query(
            "SELECT a.initial_balance +
                    COALESCE((SELECT SUM(je.debit - je.credit) FROM journal_entries je
                              INNER JOIN transactions t ON je.transaction_id = t.id
                              WHERE je.account_id = a.id), 0.0) as balance
             FROM accounts a WHERE a.id = ?",
        )
        .bind(account_id)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to get account balance: {}", e))?;

        row.map(|r| r.get::<f64, _>("balance")).unwrap_or(0.0)
    } else {
        // Unlinked goal: current = sum of contributions
        let row = sqlx::query(
            "SELECT COALESCE(SUM(amount), 0.0) as total FROM goal_contributions WHERE goal_id = ?",
        )
        .bind(goal.id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Failed to sum contributions: {}", e))?;

        row.get::<f64, _>("total")
    };

    let percentage = if goal.target_amount > 0.0 {
        ((current_amount / goal.target_amount) * 100.0).min(100.0).max(0.0)
    } else {
        0.0
    };

    // Calculate projection
    let created_date = NaiveDate::parse_from_str(
        &goal.created_at.split('T').next().unwrap_or(&goal.created_at).split(' ').next().unwrap_or("2024-01-01"),
        "%Y-%m-%d",
    )
    .unwrap_or(today);

    let days_elapsed = (today - created_date).num_days().max(1);
    let daily_rate = if days_elapsed > 0 { current_amount / days_elapsed as f64 } else { 0.0 };

    let remaining = goal.target_amount - current_amount;
    let (projected_completion_date, on_track) = if daily_rate > 0.0 && remaining > 0.0 {
        let days_needed = (remaining / daily_rate).ceil() as i64;
        let projected = today + Duration::days(days_needed);
        let projected_str = projected.format("%Y-%m-%d").to_string();

        let on_track = if let Some(target_date_str) = &goal.target_date {
            if let Ok(target_date) = NaiveDate::parse_from_str(target_date_str, "%Y-%m-%d") {
                projected <= target_date
            } else {
                true
            }
        } else {
            true // No target date = always on track
        };

        (Some(projected_str), on_track)
    } else if remaining <= 0.0 {
        // Already reached or exceeded target
        (None, true)
    } else {
        // No progress yet
        (None, false)
    };

    let days_remaining = goal.target_date.as_ref().and_then(|td| {
        NaiveDate::parse_from_str(td, "%Y-%m-%d")
            .ok()
            .map(|target| (target - today).num_days())
    });

    Ok(GoalProgress {
        current_amount,
        target_amount: goal.target_amount,
        percentage,
        on_track,
        projected_completion_date,
        days_remaining,
    })
}

async fn update_goal_status(pool: &SqlitePool, goal_id: i64, status: &str) -> Result<(), String> {
    sqlx::query("UPDATE savings_goals SET status = ?, updated_at = datetime('now') WHERE id = ?")
        .bind(status)
        .bind(goal_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update goal status: {}", e))?;
    Ok(())
}
