// File: src-tauri/src/commands/analytics.rs
use crate::models::transactions::CategorySpending;
use crate::models::analytics::{
    AccountBalanceHistory, NetWorthHistory,
    SubCategorySpending, YearOverYearComparison,
};
use crate::AppState;
use chrono::{Datelike, Local, NaiveDate};
use rusqlite::params;
use tauri::State;

// ======================== NET WORTH ========================

#[tauri::command]
pub fn get_net_worth_history(
    state: State<'_, AppState>,
    months: i64,
) -> Result<Vec<NetWorthHistory>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let today = Local::now().date_naive();
    let mut history = Vec::new();

    for m in (0..months).rev() {
        let mut year = today.year();
        let mut month = today.month() as i32 - m as i32;
        while month <= 0 {
            month += 12;
            year -= 1;
        }

        let end_of_month = last_day_of_month(year, month as u32);
        let end_of_month_str = end_of_month.format("%Y-%m-%d").to_string();
        let month_name = end_of_month.format("%b %Y").to_string();

        let (assets, liabilities) = calc_net_worth_at(&conn, Some(&end_of_month_str))?;

        history.push(NetWorthHistory {
            month: month_name,
            assets,
            liabilities,
            net_worth: assets - liabilities,
        });
    }

    Ok(history)
}

// ======================== ACCOUNT BALANCE ========================

#[tauri::command]
pub fn get_account_balance_history(
    state: State<'_, AppState>,
    account_id: i64,
    days: i64,
) -> Result<Vec<AccountBalanceHistory>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let initial_balance: f64 = conn
        .query_row(
            "SELECT initial_balance FROM accounts WHERE id = ?1",
            params![account_id],
            |row| row.get(0),
        )
        .map_err(|e| format!("Account not found: {}", e))?;

    let mut history = Vec::new();
    let today = Local::now().date_naive();

    for d in (0..=days).rev() {
        let target_date = today - chrono::Duration::days(d);
        let date_str = target_date.format("%Y-%m-%d").to_string();

        let journal_balance: f64 = conn
            .query_row(
                r#"
                SELECT CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL)
                FROM journal_entries je
                JOIN transactions t ON je.transaction_id = t.id
                WHERE je.account_id = ?1 AND t.date <= ?2
                "#,
                params![account_id, date_str],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        let balance = (initial_balance + journal_balance * 100.0).round() / 100.0;

        history.push(AccountBalanceHistory {
            date: date_str,
            balance,
        });
    }

    Ok(history)
}

// ======================== CATEGORIES ========================

#[tauri::command]
pub fn get_top_categories(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
    limit: i64,
) -> Result<Vec<CategorySpending>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let total_expense: f64 = conn
        .query_row(
            r#"
            SELECT COALESCE(SUM(amount), 0)
            FROM transactions
            WHERE type = 'EXPENSE' AND date >= ?1 AND date <= ?2
            "#,
            params![start_date, end_date],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    if total_expense == 0.0 {
        return Ok(Vec::new());
    }

    let mut stmt = conn
        .prepare(
            r#"
            SELECT
                COALESCE(p.id, c.id) as category_id,
                COALESCE(p.name, c.name) as category_name,
                SUM(t.amount) as total_amount,
                COUNT(t.id) as transaction_count
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            LEFT JOIN categories p ON c.parent_id = p.id
            WHERE t.type = 'EXPENSE' AND t.date >= ?1 AND t.date <= ?2
            GROUP BY category_id, category_name
            ORDER BY total_amount DESC
            LIMIT ?3
            "#,
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let spending = stmt
        .query_map(params![start_date, end_date, limit], |row| {
            let amount: f64 = row.get(2)?;
            let percentage = (amount / total_expense * 10000.0).round() / 100.0;
            Ok(CategorySpending {
                category_id: row.get(0)?,
                category_name: row.get(1)?,
                total_amount: amount,
                transaction_count: row.get(3)?,
                percentage,
            })
        })
        .map_err(|e| format!("Execution error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(spending)
}

#[tauri::command]
pub fn get_subcategory_breakdown(
    state: State<'_, AppState>,
    parent_category_id: i64,
    start_date: String,
    end_date: String,
) -> Result<Vec<SubCategorySpending>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn
        .prepare(
            r#"
            SELECT c.id, c.name, SUM(t.amount) as total_amount
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            WHERE t.type = 'EXPENSE'
              AND (c.id = ?1 OR c.parent_id = ?1)
              AND t.date >= ?2 AND t.date <= ?3
            GROUP BY c.id, c.name
            ORDER BY total_amount DESC
            "#,
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let breakdown = stmt
        .query_map(params![parent_category_id, start_date, end_date], |row| {
            Ok(SubCategorySpending {
                category_id: row.get(0)?,
                category_name: row.get(1)?,
                total_amount: row.get(2)?,
            })
        })
        .map_err(|e| format!("Execution error: {}", e))?
        .collect::<Result<Vec<_>, _>>()
        .map_err(|e| format!("Read error: {}", e))?;

    Ok(breakdown)
}

// ======================== DASHBOARD ========================

#[tauri::command]
pub fn get_analytics_dashboard(
    state: State<'_, AppState>,
) -> Result<AnalyticsDashboardData, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let today = Local::now().date_naive();
    let current_month_start =
        NaiveDate::from_ymd_opt(today.year(), today.month(), 1).unwrap().format("%Y-%m-%d").to_string();
    let end_date = today.format("%Y-%m-%d").to_string();

    // 1. Current Net Worth
    let (assets, liabilities) = calc_net_worth_at(&conn, None)?;
    let net_worth = assets - liabilities;

    // 2. This month's income & expense
    let this_month_income: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'INCOME' AND date >= ?1",
            params![current_month_start],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    let this_month_expense: f64 = conn
        .query_row(
            "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'EXPENSE' AND date >= ?1",
            params![current_month_start],
            |row| row.get(0),
        )
        .unwrap_or(0.0);

    // 3. Top categories this month (reusing logic but inline)
    let top_categories = {
        let mut stmt = conn.prepare(
            r#"
            SELECT COALESCE(p.name, c.name) as name, SUM(t.amount) as amount
            FROM transactions t
            JOIN categories c ON t.category_id = c.id
            LEFT JOIN categories p ON c.parent_id = p.id
            WHERE t.type = 'EXPENSE' AND t.date >= ?1
            GROUP BY name
            ORDER BY amount DESC
            LIMIT 5
            "#
        ).unwrap();

        stmt.query_map(params![current_month_start], |row| {
            let name: String = row.get(0)?;
            let amount: f64 = row.get(1)?;
            let percentage = if this_month_expense > 0.0 {
                (amount / this_month_expense * 100.0).round()
            } else {
                0.0
            };
            Ok(DashboardCategory { name, amount, percentage })
        })
        .unwrap()
        .collect::<Result<Vec<_>, _>>()
        .unwrap_or_default()
    };

    // 4. Daily spending (last 30 days)
    let start_30_days = (today - chrono::Duration::days(30)).format("%Y-%m-%d").to_string();
    let daily_spending = {
        let mut stmt = conn.prepare(
            r#"
            SELECT date, SUM(amount)
            FROM transactions
            WHERE type = 'EXPENSE' AND date >= ?1 AND date <= ?2
            GROUP BY date
            ORDER BY date ASC
            "#
        ).unwrap();

        let mut daily_map = std::collections::HashMap::new();
        let _ = stmt.query_map(params![start_30_days, end_date], |row| {
            let date: String = row.get(0)?;
            let amount: f64 = row.get(1)?;
            daily_map.insert(date, amount);
            Ok(())
        }).unwrap().collect::<Result<Vec<_>, _>>();

        let mut series = Vec::new();
        for d in (0..=30).rev() {
            let date = (today - chrono::Duration::days(d)).format("%Y-%m-%d").to_string();
            let amount = *daily_map.get(&date).unwrap_or(&0.0);
            series.push(DashboardDailySummary { date, amount });
        }
        series
    };

    Ok(AnalyticsDashboardData {
        net_worth,
        total_assets: assets,
        total_liabilities: liabilities,
        this_month_income,
        this_month_expense,
        savings_rate: if this_month_income > 0.0 {
            ((this_month_income - this_month_expense) / this_month_income * 100.0).max(0.0).round()
        } else {
            0.0
        },
        top_categories,
        daily_spending,
    })
}

#[tauri::command]
pub fn get_year_over_year_comparison(
    state: State<'_, AppState>,
    year: i32,
) -> Result<Vec<YearOverYearComparison>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let prev_year = year - 1;
    let mut comparison = Vec::new();

    for month in 1..=12 {
        let month_str = format!("{:02}", month);
        let month_name = chrono::Month::try_from(month as u8)
            .unwrap()
            .name()
            .to_string();

        let current_amount: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'EXPENSE' AND strftime('%Y', date) = ?1 AND strftime('%m', date) = ?2",
                params![year.to_string(), month_str],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        let previous_amount: f64 = conn
            .query_row(
                "SELECT COALESCE(SUM(amount), 0) FROM transactions WHERE type = 'EXPENSE' AND strftime('%Y', date) = ?1 AND strftime('%m', date) = ?2",
                params![prev_year.to_string(), month_str],
                |row| row.get(0),
            )
            .unwrap_or(0.0);

        let percentage_change = if previous_amount > 0.0 {
            ((current_amount - previous_amount) / previous_amount * 10000.0).round() / 100.0
        } else if current_amount > 0.0 {
            100.0
        } else {
            0.0
        };

        comparison.push(YearOverYearComparison {
            month: month_name,
            current_year_amount: current_amount,
            previous_year_amount: previous_amount,
            percentage_change,
        });
    }

    Ok(comparison)
}

// ======================== HELPERS ========================

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
        ).unwrap()
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
        ).unwrap()
    };

    let rows = if let Some(date) = as_of_date {
        stmt.query_map(params![date], |row| {
            Ok((row.get::<_, f64>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?))
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap()
    } else {
        stmt.query_map([], |row| {
            Ok((row.get::<_, f64>(0)?, row.get::<_, String>(1)?, row.get::<_, f64>(2)?))
        }).unwrap().collect::<Result<Vec<_>, _>>().unwrap()
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

#[derive(Debug, serde::Serialize)]
pub struct AnalyticsDashboardData {
    pub net_worth: f64,
    pub total_assets: f64,
    pub total_liabilities: f64,
    pub this_month_income: f64,
    pub this_month_expense: f64,
    pub savings_rate: f64,
    pub top_categories: Vec<DashboardCategory>,
    pub daily_spending: Vec<DashboardDailySummary>,
}

#[derive(Debug, serde::Serialize)]
pub struct DashboardDailySummary {
    pub date: String,
    pub amount: f64,
}

#[derive(Debug, serde::Serialize)]
pub struct DashboardCategory {
    pub name: String,
    pub amount: f64,
    pub percentage: f64,
}
