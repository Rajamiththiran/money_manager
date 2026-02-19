// File: src-tauri/src/commands/networth.rs
use crate::models::networth::{NetWorthSnapshot, NetWorthSummary};
use chrono::{Datelike, Local, NaiveDate};
use sqlx::{Row, SqlitePool};
use tauri::State;

// ── Helpers ──────────────────────────────────────────────────────────

/// Calculate assets & liabilities from live account balances up to a given date.
/// If `as_of_date` is None, calculates current (all-time) balances.
async fn calc_net_worth_at(
    pool: &SqlitePool,
    as_of_date: Option<&str>,
) -> Result<(f64, f64), String> {
    let rows = match as_of_date {
        Some(date) => {
            sqlx::query(
                r#"
                SELECT a.initial_balance, ag.type as account_type,
                       CAST(COALESCE(
                           (SELECT SUM(je2.debit) - SUM(je2.credit)
                            FROM journal_entries je2
                            JOIN transactions t2 ON je2.transaction_id = t2.id
                            WHERE je2.account_id = a.id AND t2.date <= ?),
                       0) AS REAL) as journal_balance
                FROM accounts a
                JOIN account_groups ag ON a.group_id = ag.id
                GROUP BY a.id
                "#,
            )
            .bind(date)
            .fetch_all(pool)
            .await
        }
        None => {
            sqlx::query(
                r#"
                SELECT a.initial_balance, ag.type as account_type,
                       CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL) as journal_balance
                FROM accounts a
                JOIN account_groups ag ON a.group_id = ag.id
                LEFT JOIN journal_entries je ON je.account_id = a.id
                GROUP BY a.id
                "#,
            )
            .fetch_all(pool)
            .await
        }
    }
    .map_err(|e| format!("Failed to calculate net worth: {}", e))?;

    let mut assets = 0.0_f64;
    let mut liabilities = 0.0_f64;

    for row in rows.iter() {
        let initial: f64 = row.get("initial_balance");
        let journal: f64 = row.get("journal_balance");
        let balance = initial + journal;
        let acc_type: String = row.get("account_type");
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

/// Return the last day of a given year/month.
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

/// Live net worth with month-over-month change.
#[tauri::command]
pub async fn get_current_net_worth(pool: State<'_, SqlitePool>) -> Result<NetWorthSummary, String> {
    let (assets, liabilities) = calc_net_worth_at(pool.inner(), None).await?;
    let net_worth = assets - liabilities;

    // Previous month-end for comparison
    let today = Local::now().date_naive();
    let first_of_month =
        NaiveDate::from_ymd_opt(today.year(), today.month(), 1).ok_or("Invalid date")?;
    let prev_month_end = first_of_month.pred_opt().ok_or("Invalid date")?;
    let prev_date_str = prev_month_end.format("%Y-%m-%d").to_string();

    let (prev_assets, prev_liabilities) =
        calc_net_worth_at(pool.inner(), Some(&prev_date_str)).await?;
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

/// Return persisted monthly snapshots for the chart.
/// Falls back to the existing `net_worth_snapshots` table.
#[tauri::command]
pub async fn get_net_worth_snapshots(
    pool: State<'_, SqlitePool>,
    months: Option<i64>,
) -> Result<Vec<NetWorthSnapshot>, String> {
    let limit = months.unwrap_or(12);

    let rows = sqlx::query(
        "SELECT id, snapshot_date, total_assets, total_liabilities, net_worth
         FROM net_worth_snapshots
         ORDER BY snapshot_date DESC
         LIMIT ?",
    )
    .bind(limit)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch snapshots: {}", e))?;

    let mut snapshots: Vec<NetWorthSnapshot> = rows
        .iter()
        .map(|r| NetWorthSnapshot {
            id: r.get("id"),
            snapshot_date: r.get("snapshot_date"),
            total_assets: r.get("total_assets"),
            total_liabilities: r.get("total_liabilities"),
            net_worth: r.get("net_worth"),
        })
        .collect();

    // Return in chronological order (oldest first) for the chart
    snapshots.reverse();
    Ok(snapshots)
}

/// Create a snapshot for the current month if one doesn't exist yet.
/// Called from `lib.rs` setup — runs silently on every app start.
pub async fn generate_net_worth_snapshot(pool: &SqlitePool) -> Result<(), String> {
    let today = Local::now().date_naive();
    let snapshot_date = last_day_of_month(today.year(), today.month());
    let date_str = snapshot_date.format("%Y-%m-%d").to_string();

    // Check if snapshot already exists for this month
    let exists = sqlx::query("SELECT id FROM net_worth_snapshots WHERE snapshot_date = ?")
        .bind(&date_str)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("DB error: {}", e))?
        .is_some();

    if exists {
        // Update existing snapshot with current values
        let (assets, liabilities) = calc_net_worth_at(pool, None).await?;
        let net_worth = assets - liabilities;

        sqlx::query(
            "UPDATE net_worth_snapshots SET total_assets = ?, total_liabilities = ?, net_worth = ? WHERE snapshot_date = ?"
        )
        .bind(assets)
        .bind(liabilities)
        .bind(net_worth)
        .bind(&date_str)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update snapshot: {}", e))?;
    } else {
        let (assets, liabilities) = calc_net_worth_at(pool, None).await?;
        let net_worth = assets - liabilities;

        sqlx::query(
            "INSERT INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth) VALUES (?, ?, ?, ?)"
        )
        .bind(&date_str)
        .bind(assets)
        .bind(liabilities)
        .bind(net_worth)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to insert snapshot: {}", e))?;
    }

    Ok(())
}

/// One-time backfill: replay history from the earliest transaction month to now.
/// Only runs if the snapshots table is empty.
pub async fn backfill_net_worth_snapshots(pool: &SqlitePool) -> Result<(), String> {
    // Check if we already have snapshots
    let count_row = sqlx::query("SELECT COUNT(*) as cnt FROM net_worth_snapshots")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("DB error: {}", e))?;
    let count: i64 = count_row.get("cnt");
    if count > 0 {
        return Ok(()); // Already populated
    }

    // Find earliest transaction date
    let earliest = sqlx::query("SELECT MIN(date) as min_date FROM transactions")
        .fetch_one(pool)
        .await
        .map_err(|e| format!("DB error: {}", e))?;

    let min_date_str: Option<String> = earliest.get("min_date");
    let start = match min_date_str {
        Some(d) => NaiveDate::parse_from_str(&d, "%Y-%m-%d")
            .map_err(|_| "Failed to parse earliest date".to_string())?,
        None => return Ok(()), // No transactions, nothing to backfill
    };

    let today = Local::now().date_naive();
    let mut year = start.year();
    let mut month = start.month();

    loop {
        let end_of_month = last_day_of_month(year, month);
        if end_of_month > today {
            break; // Current month will be handled by generate_net_worth_snapshot
        }

        let date_str = end_of_month.format("%Y-%m-%d").to_string();
        let (assets, liabilities) = calc_net_worth_at(pool, Some(&date_str)).await?;
        let net_worth = assets - liabilities;

        sqlx::query(
            "INSERT OR IGNORE INTO net_worth_snapshots (snapshot_date, total_assets, total_liabilities, net_worth) VALUES (?, ?, ?, ?)"
        )
        .bind(&date_str)
        .bind(assets)
        .bind(liabilities)
        .bind(net_worth)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to backfill snapshot: {}", e))?;

        // Next month
        if month == 12 {
            year += 1;
            month = 1;
        } else {
            month += 1;
        }
    }

    Ok(())
}
