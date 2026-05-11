// File: src-tauri/src/commands/networth.rs
use crate::models::networth::{NetWorthSnapshot, NetWorthSummary};
use crate::AppState;
use chrono::{Datelike, Local, NaiveDate};
use rusqlite::params;
use tauri::State;

// ── Helpers ──────────────────────────────────────────────────────────

fn calc_net_worth_at(
    conn: &rusqlite::Connection,
    as_of_date: Option<&str>,
) -> Result<(f64, f64), String> {
    let mut stmt = if let Some(_date) = as_of_date {
        conn.prepare(
            r#"
            SELECT a.initial_balance, ag.type as account_type,
                   CAST(COALESCE(
                       (SELECT SUM(je2.debit) - SUM(je2.credit)
                        FROM journal_entries je2
                        JOIN transactions t2 ON je2.transaction_id = t2.id
                        WHERE je2.account_id = a.id AND t2.date <= ?1),
                   0) AS REAL) as journal_balance
            FROM accounts a
            JOIN account_groups ag ON a.group_id = ag.id
            GROUP BY a.id
            "#,
        ).map_err(|e| format!("Prepare error: {}", e))?
    } else {
        conn.prepare(
            r#"
            SELECT a.initial_balance, ag.type as account_type,
                   CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL) as journal_balance
            FROM accounts a
            JOIN account_groups ag ON a.group_id = ag.id
            LEFT JOIN journal_entries je ON je.account_id = a.id
            GROUP BY a.id
            "#,
        ).map_err(|e| format!("Prepare error: {}", e))?
    };

    let rows = if let Some(date) = as_of_date {
        stmt.query_map(params![date], |row| {
            Ok((
                row.get::<_, f64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
            ))
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?
    } else {
        stmt.query_map([], |row| {
            Ok((
                row.get::<_, f64>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, f64>(2)?,
            ))
        })
        .map_err(|e| format!("Execute error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?
    };

    let mut assets = 0.0_f64;
    let mut liabilities = 0.0_f64;

    for (initial, acc_type, journal) in rows {
        let balance = initial + journal;
        match acc_type.as_str() {
            "ASSET" => assets += balance,
            "LIABILITY" => liabilities += (-balance).max(0.0),
            _ => {}
        }
    }

    Ok((
        (assets * 100.0).round() / 100.0,
        (liabilities * 100.0).round() / 100.0,
    ))
}

fn last_day_of_month(year: i32, month: u32) -> NaiveDate {
    if month == 12 {
        NaiveDate::from_ymd_opt(year + 1, 1, 1)
    } else {
        NaiveDate::from_ymd_opt(year, month + 1, 1)
    }
    .and_then(|d| d.pred_opt())
    .unwrap_or_else(|| NaiveDate::from_ymd_opt(year, month, 28).unwrap())
}

// ── Commands ─────────────────────────────────────────────────────────

#[tauri::command]
pub fn get_current_net_worth(state: State<'_, AppState>) -> Result<NetWorthSummary, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let (assets, liabilities) = calc_net_worth_at(&conn, None)?;
    let net_worth = assets - liabilities;

    // Previous month-end for comparison
    let today = Local::now().date_naive();
    let first_of_month =
        NaiveDate::from_ymd_opt(today.year(), today.month(), 1).ok_or("Invalid date")?;
    let prev_month_end = first_of_month.pred_opt().ok_or("Invalid date")?;
    let prev_date_str = prev_month_end.format("%Y-%m-%d").to_string();

    let (prev_assets, prev_liabilities) = calc_net_worth_at(&conn, Some(&prev_date_str))?;
    let prev_net_worth = prev_assets - prev_liabilities;

    let change_amount = ((net_worth - prev_net_worth) * 100.0).round() / 100.0;
    let change_percentage = if prev_net_worth.abs() > 0.01 {
        ((change_amount / prev_net_worth.abs()) * 100.0 * 100.0).round() / 100.0
    } else {
        0.0
    };

    Ok(NetWorthSummary {
        assets,
        liabilities,
        net_worth,
        change_amount,
        change_percentage,
    })
}

#[tauri::command]
pub fn get_net_worth_snapshots(
    state: State<'_, AppState>,
    months: Option<i64>,
) -> Result<Vec<NetWorthSnapshot>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let limit = months.unwrap_or(12);

    let mut stmt = conn
        .prepare(
            "SELECT id, snapshot_date, total_assets, total_liabilities, net_worth
             FROM net_worth_snapshots
             ORDER BY snapshot_date DESC
             LIMIT ?1",
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let mut snapshots = stmt
        .query_map(params![limit], |row| {
            Ok(NetWorthSnapshot {
                id: row.get(0)?,
                snapshot_date: row.get(1)?,
                total_assets: row.get(2)?,
                total_liabilities: row.get(3)?,
                net_worth: row.get(4)?,
            })
        })
        .map_err(|e| format!("Failed to fetch snapshots: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    // Return in chronological order (oldest first) for the chart
    snapshots.reverse();
    Ok(snapshots)
}

pub fn generate_net_worth_snapshot(conn: &rusqlite::Connection) -> Result<(), String> {
    let today = Local::now().date_naive();
    let snapshot_date = last_day_of_month(today.year(), today.month());
    let date_str = snapshot_date.format("%Y-%m-%d").to_string();

    // Check if snapshot already exists for this month
    let exists: bool = conn
        .query_row(
            "SELECT COUNT(*) FROM net_worth_snapshots WHERE snapshot_date = ?1",
            params![date_str],
            |row| row.get::<_, i64>(0),
        )
        .unwrap_or(0) > 0;

    let (assets, liabilities) = calc_net_worth_at(conn, None)?;
    let net_worth = assets - liabilities;

    if exists {
        conn.execute(
            "UPDATE net_worth_snapshots SET total_assets = ?1, total_liabilities = ?2, net_worth = ?3 WHERE snapshot_date = ?4",
            params![assets, liabilities, net_worth, date_str],
        )
        .map_err(|e| format!("Failed to update snapshot: {}", e))?;
    } else {
        conn.execute(
            "INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth) VALUES (?1, ?2, ?3, ?4)",
            params![date_str, assets, liabilities, net_worth],
        )
        .map_err(|e| format!("Failed to insert snapshot: {}", e))?;
    }

    Ok(())
}

pub fn backfill_net_worth_snapshots(conn: &rusqlite::Connection) -> Result<(), String> {
    let count: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM net_worth_snapshots",
            [],
            |row| row.get(0),
        )
        .unwrap_or(0);

    if count > 0 {
        return Ok(()); // Already populated
    }

    let min_date_str: Option<String> = conn
        .query_row(
            "SELECT MIN(date) FROM transactions",
            [],
            |row| row.get(0),
        )
        .ok()
        .flatten();

    let start = match min_date_str {
        Some(d) => NaiveDate::parse_from_str(&d, "%Y-%m-%d")
            .map_err(|_| "Failed to parse earliest date".to_string())?,
        None => return Ok(()), // No transactions
    };

    let today = Local::now().date_naive();
    let mut year = start.year();
    let mut month = start.month();

    loop {
        let end_of_month = last_day_of_month(year, month);
        if end_of_month > today {
            break; // Current month handled by generate_net_worth_snapshot
        }

        let date_str = end_of_month.format("%Y-%m-%d").to_string();
        let (assets, liabilities) = calc_net_worth_at(conn, Some(&date_str))?;
        let net_worth = assets - liabilities;

        conn.execute(
            "INSERT OR IGNORE INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth) VALUES (?1, ?2, ?3, ?4)",
            params![date_str, assets, liabilities, net_worth],
        )
        .map_err(|e| format!("Failed to backfill snapshot: {}", e))?;

        if month == 12 {
            year += 1;
            month = 1;
        } else {
            month += 1;
        }
    }

    Ok(())
}
