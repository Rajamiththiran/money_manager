// File: src-tauri/src/commands/goals.rs
use crate::models::goal::*;
use crate::AppState;
use chrono::{Duration, NaiveDate};
use rusqlite::params;
use tauri::State;

// ======================== CRUD ========================

#[tauri::command]
pub fn create_goal(
    state: State<'_, AppState>,
    input: CreateGoalInput,
) -> Result<SavingsGoal, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    if input.target_amount <= 0.0 {
        return Err("Target amount must be greater than zero".to_string());
    }

    // Validate linked account if provided
    if let Some(account_id) = input.linked_account_id {
        let exists: bool = conn.query_row(
            "SELECT COUNT(id) FROM accounts WHERE id = ?1",
            params![account_id],
            |row| row.get::<_, i64>(0),
        ).unwrap_or(0) > 0;
        if !exists {
            return Err("Linked account does not exist".to_string());
        }
    }

    let color = input.color.unwrap_or_else(|| "#6B7280".to_string());
    let icon = input.icon.unwrap_or_else(|| "target".to_string());

    conn.execute(
        "INSERT INTO savings_goals (name, target_amount, target_date, linked_account_id, color, icon)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![input.name, input.target_amount, input.target_date, input.linked_account_id, color, icon],
    ).map_err(|e| format!("Failed to create goal: {}", e))?;

    let goal_id = conn.last_insert_rowid();
    get_goal_by_id(&conn, goal_id)
}

#[tauri::command]
pub fn get_goals(
    state: State<'_, AppState>,
    status_filter: Option<String>,
) -> Result<Vec<GoalWithProgress>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let goals: Vec<SavingsGoal> = if let Some(status) = &status_filter {
        let mut stmt = conn.prepare(
            "SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at
             FROM savings_goals WHERE status = ?1 ORDER BY created_at DESC",
        ).unwrap();
        stmt.query_map(params![status], row_to_goal).unwrap().filter_map(Result::ok).collect()
    } else {
        let mut stmt = conn.prepare(
            "SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at
             FROM savings_goals ORDER BY
             CASE status WHEN 'ACTIVE' THEN 1 WHEN 'PAUSED' THEN 2 WHEN 'COMPLETED' THEN 3 WHEN 'ARCHIVED' THEN 4 END,
             created_at DESC",
        ).unwrap();
        stmt.query_map([], row_to_goal).unwrap().filter_map(Result::ok).collect()
    };

    let mut results = Vec::new();
    for goal in goals {
        let progress = calculate_progress(&conn, &goal)?;
        let (linked_account_name, linked_account_balance) = if let Some(account_id) = goal.linked_account_id {
            let mut stmt = conn.prepare(
                "SELECT a.name, a.initial_balance +
                        COALESCE((SELECT SUM(je.debit - je.credit) FROM journal_entries je
                                  INNER JOIN transactions t ON je.transaction_id = t.id
                                  WHERE je.account_id = a.id), 0.0) as balance
                 FROM accounts a WHERE a.id = ?1",
            ).unwrap();
            let row = stmt.query_row(params![account_id], |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, f64>(1)?,
                ))
            });
            row.ok().unzip()
        } else {
            (None, None)
        };
        results.push(GoalWithProgress {
            goal,
            progress,
            linked_account_name,
            linked_account_balance,
        });
    }

    Ok(results)
}

#[tauri::command]
pub fn get_goal_progress(
    state: State<'_, AppState>,
    goal_id: i64,
) -> Result<GoalProgress, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let goal = get_goal_by_id(&conn, goal_id)?;
    calculate_progress(&conn, &goal)
}

#[tauri::command]
pub fn update_goal(
    state: State<'_, AppState>,
    input: UpdateGoalInput,
) -> Result<SavingsGoal, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Verify goal exists
    let _goal = get_goal_by_id(&conn, input.id)?;

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
        updates.push(format!("color = '{}'", color.replace('\'', "''")));
    }
    if let Some(icon) = &input.icon {
        updates.push(format!("icon = '{}'", icon.replace('\'', "''")));
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

    conn.execute(&query, [])
        .map_err(|e| format!("Failed to update goal: {}", e))?;

    get_goal_by_id(&conn, input.id)
}

#[tauri::command]
pub fn delete_goal(
    state: State<'_, AppState>,
    goal_id: i64,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let rows_affected = conn.execute("DELETE FROM savings_goals WHERE id = ?1", params![goal_id])
        .map_err(|e| format!("Failed to delete goal: {}", e))?;

    if rows_affected == 0 {
        return Err("Goal not found".to_string());
    }
    Ok(())
}

// ======================== CONTRIBUTIONS ========================

#[tauri::command]
pub fn add_goal_contribution(
    state: State<'_, AppState>,
    input: AddContributionInput,
) -> Result<GoalContribution, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let goal = get_goal_by_id(&conn, input.goal_id)?;

    if goal.status != "ACTIVE" {
        return Err(format!("Cannot add contributions to a {} goal", goal.status.to_lowercase()));
    }

    conn.execute(
        "INSERT INTO goal_contributions (goal_id, amount, contribution_date, note)
         VALUES (?1, ?2, ?3, ?4)",
        params![input.goal_id, input.amount, input.date, input.note],
    ).map_err(|e| format!("Failed to add contribution: {}", e))?;

    let contribution_id = conn.last_insert_rowid();

    let mut stmt = conn.prepare(
        "SELECT id, goal_id, amount, contribution_date, note, created_at
         FROM goal_contributions WHERE id = ?1",
    ).unwrap();

    stmt.query_row(params![contribution_id], |row| {
        Ok(GoalContribution {
            id: row.get(0)?,
            goal_id: row.get(1)?,
            amount: row.get(2)?,
            contribution_date: row.get(3)?,
            note: row.get(4)?,
            created_at: row.get(5)?,
        })
    }).map_err(|e| format!("Failed to fetch contribution: {}", e))
}

// ======================== LIFECYCLE ========================

#[tauri::command]
pub fn complete_goal(
    state: State<'_, AppState>,
    goal_id: i64,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let goal = get_goal_by_id(&conn, goal_id)?;
    if goal.status != "ACTIVE" {
        return Err(format!("Only active goals can be completed. Current status: {}", goal.status));
    }
    update_goal_status(&conn, goal_id, "COMPLETED")
}

#[tauri::command]
pub fn pause_goal(
    state: State<'_, AppState>,
    goal_id: i64,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let goal = get_goal_by_id(&conn, goal_id)?;
    if goal.status != "ACTIVE" {
        return Err(format!("Only active goals can be paused. Current status: {}", goal.status));
    }
    update_goal_status(&conn, goal_id, "PAUSED")
}

#[tauri::command]
pub fn resume_goal(
    state: State<'_, AppState>,
    goal_id: i64,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let goal = get_goal_by_id(&conn, goal_id)?;
    if goal.status != "PAUSED" {
        return Err(format!("Only paused goals can be resumed. Current status: {}", goal.status));
    }
    update_goal_status(&conn, goal_id, "ACTIVE")
}

#[tauri::command]
pub fn archive_goal(
    state: State<'_, AppState>,
    goal_id: i64,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let _goal = get_goal_by_id(&conn, goal_id)?;
    update_goal_status(&conn, goal_id, "ARCHIVED")
}

// ======================== HELPERS ========================

fn row_to_goal(row: &rusqlite::Row) -> rusqlite::Result<SavingsGoal> {
    Ok(SavingsGoal {
        id: row.get(0)?,
        name: row.get(1)?,
        target_amount: row.get(2)?,
        target_date: row.get(3)?,
        linked_account_id: row.get(4)?,
        color: row.get(5)?,
        icon: row.get(6)?,
        status: row.get(7)?,
        created_at: row.get(8)?,
        updated_at: row.get(9)?,
    })
}

fn get_goal_by_id(conn: &rusqlite::Connection, goal_id: i64) -> Result<SavingsGoal, String> {
    let mut stmt = conn.prepare(
        "SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at
         FROM savings_goals WHERE id = ?1",
    ).unwrap();
    stmt.query_row(params![goal_id], row_to_goal).map_err(|_| "Goal not found".to_string())
}

fn calculate_progress(conn: &rusqlite::Connection, goal: &SavingsGoal) -> Result<GoalProgress, String> {
    let today = chrono::Local::now().naive_local().date();

    let current_amount: f64 = conn.query_row(
        "SELECT COALESCE(SUM(amount), 0.0) as total FROM goal_contributions WHERE goal_id = ?1",
        params![goal.id],
        |row| row.get(0),
    ).unwrap_or(0.0);

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

fn update_goal_status(conn: &rusqlite::Connection, goal_id: i64, status: &str) -> Result<(), String> {
    conn.execute("UPDATE savings_goals SET status = ?1, updated_at = datetime('now') WHERE id = ?2", params![status, goal_id])
        .map_err(|e| format!("Failed to update goal status: {}", e))?;
    Ok(())
}
