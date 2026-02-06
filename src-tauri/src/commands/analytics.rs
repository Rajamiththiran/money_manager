// File: src-tauri/src/commands/analytics.rs
use crate::models::analytics::{
    AccountBalancePoint, AccountPerformance, AnalyticsDashboard, NetWorthSnapshot,
    SubcategoryBreakdown, SubcategoryItem, TopCategory, YearComparison,
};
use chrono::{Datelike, Local, NaiveDate};
use sqlx::{Row, SqlitePool};
use tauri::State;

// ======================== NET WORTH TRACKING ========================

/// Get net worth history as monthly snapshots
/// Calculates cumulative balance for all accounts at each month-end
#[tauri::command]
pub async fn get_net_worth_history(
    pool: State<'_, SqlitePool>,
    months: Option<i32>,
) -> Result<Vec<NetWorthSnapshot>, String> {
    let num_months = months.unwrap_or(12);
    let today = Local::now().date_naive();

    // Get all accounts with their types and initial balances
    let accounts = sqlx::query(
        r#"
        SELECT a.id, a.initial_balance, ag.type as account_type
        FROM accounts a
        JOIN account_groups ag ON a.group_id = ag.id
        "#,
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch accounts: {}", e))?;

    let mut snapshots: Vec<NetWorthSnapshot> = Vec::new();

    for i in (0..num_months).rev() {
        // Calculate month-end date
        let target_date = if i == 0 {
            today
        } else {
            let year = today.year();
            let month = today.month() as i32 - i;
            let (adj_year, adj_month) = if month <= 0 {
                (
                    year - 1 + (month - 1) / 12,
                    ((month - 1) % 12 + 12) % 12 + 1,
                )
            } else {
                (year, month)
            };
            // Last day of month
            let next_month = if adj_month == 12 {
                NaiveDate::from_ymd_opt(adj_year + 1, 1, 1)
            } else {
                NaiveDate::from_ymd_opt(adj_year, (adj_month + 1) as u32, 1)
            };
            next_month
                .map(|d| d.pred_opt().unwrap_or(d))
                .unwrap_or(today)
        };

        let date_str = target_date.format("%Y-%m-%d").to_string();
        let month_label = target_date.format("%Y-%m").to_string();

        let mut total_assets = 0.0_f64;
        let mut total_liabilities = 0.0_f64;

        for acc in accounts.iter() {
            let acc_id: i64 = acc.get("id");
            let initial_balance: f64 = acc.get("initial_balance");
            let acc_type: String = acc.get("account_type");

            // Get journal balance up to this date
            let journal_row = sqlx::query(
                r#"
                SELECT CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL) as balance
                FROM journal_entries je
                JOIN transactions t ON je.transaction_id = t.id
                WHERE je.account_id = ? AND t.date <= ?
                "#,
            )
            .bind(acc_id)
            .bind(&date_str)
            .fetch_one(pool.inner())
            .await
            .map_err(|e| format!("Failed to calculate journal balance: {}", e))?;

            let journal_balance: f64 = journal_row.get("balance");
            let balance = initial_balance + journal_balance;

            match acc_type.as_str() {
                "ASSET" => total_assets += balance,
                "LIABILITY" => total_liabilities += (-balance).max(0.0), // Flip sign for liabilities
                _ => {}
            }
        }

        let net_worth = total_assets - total_liabilities;

        let (growth, growth_percentage) = if let Some(prev) = snapshots.last() {
            let g = net_worth - prev.net_worth;
            let gp = if prev.net_worth.abs() > 0.01 {
                (g / prev.net_worth.abs()) * 100.0
            } else {
                0.0
            };
            (g, (gp * 100.0).round() / 100.0)
        } else {
            (0.0, 0.0)
        };

        snapshots.push(NetWorthSnapshot {
            date: month_label,
            total_assets: (total_assets * 100.0).round() / 100.0,
            total_liabilities: (total_liabilities * 100.0).round() / 100.0,
            net_worth: (net_worth * 100.0).round() / 100.0,
            growth: (growth * 100.0).round() / 100.0,
            growth_percentage,
        });
    }

    Ok(snapshots)
}

// ======================== ACCOUNT PERFORMANCE ========================

/// Get detailed performance metrics for a single account over a date range
#[tauri::command]
pub async fn get_account_balance_history(
    pool: State<'_, SqlitePool>,
    account_id: i64,
    start_date: String,
    end_date: String,
) -> Result<AccountPerformance, String> {
    // Get account info
    let acc_row = sqlx::query(
        r#"
        SELECT a.id, a.name, a.initial_balance, ag.type as account_type
        FROM accounts a
        JOIN account_groups ag ON a.group_id = ag.id
        WHERE a.id = ?
        "#,
    )
    .bind(account_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Account not found".to_string())?;

    let account_name: String = acc_row.get("name");
    let initial_balance: f64 = acc_row.get("initial_balance");
    let account_type: String = acc_row.get("account_type");

    // Opening balance: initial_balance + journal entries before start_date
    let opening_journal = sqlx::query(
        r#"
        SELECT CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL) as balance
        FROM journal_entries je
        JOIN transactions t ON je.transaction_id = t.id
        WHERE je.account_id = ? AND t.date < ?
        "#,
    )
    .bind(account_id)
    .bind(&start_date)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to calc opening balance: {}", e))?;
    let opening_balance = initial_balance + opening_journal.get::<f64, _>("balance");

    // Closing balance: initial_balance + journal entries up to end_date
    let closing_journal = sqlx::query(
        r#"
        SELECT CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL) as balance
        FROM journal_entries je
        JOIN transactions t ON je.transaction_id = t.id
        WHERE je.account_id = ? AND t.date <= ?
        "#,
    )
    .bind(account_id)
    .bind(&end_date)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to calc closing balance: {}", e))?;
    let closing_balance = initial_balance + closing_journal.get::<f64, _>("balance");

    // Current balance (all time)
    let current_journal = sqlx::query(
        r#"
        SELECT CAST(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS REAL) as balance
        FROM journal_entries WHERE account_id = ?
        "#,
    )
    .bind(account_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to calc current balance: {}", e))?;
    let current_balance = initial_balance + current_journal.get::<f64, _>("balance");

    // Inflow/outflow during period
    let flow_row = sqlx::query(
        r#"
        SELECT 
            CAST(COALESCE(SUM(je.debit), 0) AS REAL) as total_inflow,
            CAST(COALESCE(SUM(je.credit), 0) AS REAL) as total_outflow,
            COUNT(DISTINCT je.transaction_id) as transaction_count
        FROM journal_entries je
        JOIN transactions t ON je.transaction_id = t.id
        WHERE je.account_id = ? AND t.date >= ? AND t.date <= ?
        "#,
    )
    .bind(account_id)
    .bind(&start_date)
    .bind(&end_date)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to calc flows: {}", e))?;

    let total_inflow: f64 = flow_row.get("total_inflow");
    let total_outflow: f64 = flow_row.get("total_outflow");
    let transaction_count: i64 = flow_row.get("transaction_count");

    // Daily balance history for the period
    let daily_rows = sqlx::query(
        r#"
        SELECT t.date,
               CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL) as day_change
        FROM journal_entries je
        JOIN transactions t ON je.transaction_id = t.id
        WHERE je.account_id = ? AND t.date >= ? AND t.date <= ?
        GROUP BY t.date
        ORDER BY t.date ASC
        "#,
    )
    .bind(account_id)
    .bind(&start_date)
    .bind(&end_date)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch daily changes: {}", e))?;

    let mut running_balance = opening_balance;
    let mut balance_history: Vec<AccountBalancePoint> = Vec::new();
    let mut highest = opening_balance;
    let mut lowest = opening_balance;
    let mut balance_sum = 0.0_f64;
    let mut day_count = 0_i64;

    // Add opening point
    balance_history.push(AccountBalancePoint {
        date: start_date.clone(),
        balance: (opening_balance * 100.0).round() / 100.0,
    });

    // Parse dates for iteration
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {}", e))?;
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid end date: {}", e))?;

    // Build a map of date -> day_change
    let mut change_map = std::collections::HashMap::new();
    for row in daily_rows.iter() {
        let date: String = row.get("date");
        let change: f64 = row.get("day_change");
        change_map.insert(date, change);
    }

    // Walk through each day
    let mut current_date = start;
    running_balance = opening_balance;
    while current_date <= end {
        let date_str = current_date.format("%Y-%m-%d").to_string();
        if let Some(change) = change_map.get(&date_str) {
            running_balance += change;
        }

        if running_balance > highest {
            highest = running_balance;
        }
        if running_balance < lowest {
            lowest = running_balance;
        }
        balance_sum += running_balance;
        day_count += 1;

        // Only add to history at weekly intervals or first/last day to keep data manageable
        let days_from_start = (current_date - start).num_days();
        if days_from_start % 7 == 0 || current_date == end {
            balance_history.push(AccountBalancePoint {
                date: date_str,
                balance: (running_balance * 100.0).round() / 100.0,
            });
        }

        current_date = current_date.succ_opt().unwrap_or(current_date);
    }

    let average_daily_balance = if day_count > 0 {
        balance_sum / day_count as f64
    } else {
        opening_balance
    };

    Ok(AccountPerformance {
        account_id,
        account_name,
        account_type,
        current_balance: (current_balance * 100.0).round() / 100.0,
        opening_balance: (opening_balance * 100.0).round() / 100.0,
        closing_balance: (closing_balance * 100.0).round() / 100.0,
        highest_balance: (highest * 100.0).round() / 100.0,
        lowest_balance: (lowest * 100.0).round() / 100.0,
        average_daily_balance: (average_daily_balance * 100.0).round() / 100.0,
        total_inflow: (total_inflow * 100.0).round() / 100.0,
        total_outflow: (total_outflow * 100.0).round() / 100.0,
        net_change: ((total_inflow - total_outflow) * 100.0).round() / 100.0,
        transaction_count,
        balance_history,
    })
}

// ======================== TOP CATEGORIES ========================

/// Get top spending/income categories with comparison to previous period
#[tauri::command]
pub async fn get_top_categories(
    pool: State<'_, SqlitePool>,
    start_date: String,
    end_date: String,
    transaction_type: String, // "INCOME" or "EXPENSE"
    limit: Option<i32>,
) -> Result<Vec<TopCategory>, String> {
    let max_items = limit.unwrap_or(10);

    // Calculate previous period (same duration before start_date)
    let start = NaiveDate::parse_from_str(&start_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {}", e))?;
    let end = NaiveDate::parse_from_str(&end_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid end date: {}", e))?;
    let duration = (end - start).num_days();
    let prev_end = start.pred_opt().unwrap_or(start);
    let prev_start = prev_end - chrono::Duration::days(duration);

    // Current period spending by parent category
    let current_rows = sqlx::query(
        r#"
        SELECT 
            COALESCE(c.parent_id, c.id) as category_id,
            COALESCE(pc.name, c.name) as category_name,
            CAST(SUM(t.amount) AS REAL) as total_amount,
            COUNT(*) as transaction_count
        FROM transactions t
        INNER JOIN categories c ON t.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        WHERE t.date >= ? AND t.date <= ? AND t.type = ?
        GROUP BY COALESCE(c.parent_id, c.id)
        ORDER BY total_amount DESC
        LIMIT ?
        "#,
    )
    .bind(&start_date)
    .bind(&end_date)
    .bind(&transaction_type)
    .bind(max_items)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch current categories: {}", e))?;

    let total: f64 = current_rows
        .iter()
        .map(|r| r.get::<f64, _>("total_amount"))
        .sum();

    // Previous period - get ALL categories for comparison
    let prev_rows = sqlx::query(
        r#"
        SELECT 
            COALESCE(c.parent_id, c.id) as category_id,
            CAST(SUM(t.amount) AS REAL) as total_amount
        FROM transactions t
        INNER JOIN categories c ON t.category_id = c.id
        WHERE t.date >= ? AND t.date <= ? AND t.type = ?
        GROUP BY COALESCE(c.parent_id, c.id)
        "#,
    )
    .bind(prev_start.format("%Y-%m-%d").to_string())
    .bind(prev_end.format("%Y-%m-%d").to_string())
    .bind(&transaction_type)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch previous categories: {}", e))?;

    // Build prev lookup
    let mut prev_map = std::collections::HashMap::new();
    for row in prev_rows.iter() {
        let cat_id: i64 = row.get("category_id");
        let amount: f64 = row.get("total_amount");
        prev_map.insert(cat_id, amount);
    }

    Ok(current_rows
        .iter()
        .map(|row| {
            let cat_id: i64 = row.get("category_id");
            let current_amount: f64 = row.get("total_amount");
            let previous_amount = *prev_map.get(&cat_id).unwrap_or(&0.0);
            let change = current_amount - previous_amount;
            let change_percentage = if previous_amount > 0.0 {
                (change / previous_amount) * 100.0
            } else if current_amount > 0.0 {
                100.0
            } else {
                0.0
            };

            TopCategory {
                category_id: cat_id,
                category_name: row.get("category_name"),
                current_amount: (current_amount * 100.0).round() / 100.0,
                previous_amount: (previous_amount * 100.0).round() / 100.0,
                change: (change * 100.0).round() / 100.0,
                change_percentage: (change_percentage * 100.0).round() / 100.0,
                transaction_count: row.get("transaction_count"),
                percentage_of_total: if total > 0.0 {
                    ((current_amount / total) * 100.0 * 100.0).round() / 100.0
                } else {
                    0.0
                },
            }
        })
        .collect())
}

// ======================== SUBCATEGORY DRILL-DOWN ========================

/// Get subcategory breakdown for a specific parent category
#[tauri::command]
pub async fn get_subcategory_breakdown(
    pool: State<'_, SqlitePool>,
    parent_category_id: i64,
    start_date: String,
    end_date: String,
    transaction_type: String,
) -> Result<SubcategoryBreakdown, String> {
    // Get parent name
    let parent_row = sqlx::query("SELECT name FROM categories WHERE id = ?")
        .bind(parent_category_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| "Category not found".to_string())?;
    let parent_name: String = parent_row.get("name");

    // Get spending for parent category itself (transactions directly on parent)
    let direct_row = sqlx::query(
        r#"
        SELECT CAST(COALESCE(SUM(t.amount), 0) AS REAL) as total, COUNT(*) as count
        FROM transactions t
        WHERE t.category_id = ? AND t.date >= ? AND t.date <= ? AND t.type = ?
        "#,
    )
    .bind(parent_category_id)
    .bind(&start_date)
    .bind(&end_date)
    .bind(&transaction_type)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    let direct_amount: f64 = direct_row.get("total");
    let direct_count: i64 = direct_row.get("count");

    // Get spending per subcategory
    let sub_rows = sqlx::query(
        r#"
        SELECT c.id as category_id, c.name as category_name,
               CAST(COALESCE(SUM(t.amount), 0) AS REAL) as total_amount,
               COUNT(*) as transaction_count
        FROM categories c
        LEFT JOIN transactions t ON t.category_id = c.id
            AND t.date >= ? AND t.date <= ? AND t.type = ?
        WHERE c.parent_id = ?
        GROUP BY c.id
        ORDER BY total_amount DESC
        "#,
    )
    .bind(&start_date)
    .bind(&end_date)
    .bind(&transaction_type)
    .bind(parent_category_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch subcategories: {}", e))?;

    let mut subcategories: Vec<SubcategoryItem> = Vec::new();

    // Include direct spending as "Other / Uncategorized" if there are subcategories
    let has_subcategories = !sub_rows.is_empty();

    for row in sub_rows.iter() {
        subcategories.push(SubcategoryItem {
            category_id: row.get("category_id"),
            category_name: row.get("category_name"),
            amount: row.get("total_amount"),
            percentage: 0.0, // Will calculate after
            transaction_count: row.get("transaction_count"),
        });
    }

    if has_subcategories && direct_amount > 0.0 {
        subcategories.push(SubcategoryItem {
            category_id: parent_category_id,
            category_name: format!("{} (Direct)", parent_name),
            amount: direct_amount,
            percentage: 0.0,
            transaction_count: direct_count,
        });
    }

    let total_amount: f64 = subcategories.iter().map(|s| s.amount).sum::<f64>()
        + if !has_subcategories {
            direct_amount
        } else {
            0.0
        };

    // Calculate percentages
    for sub in subcategories.iter_mut() {
        sub.percentage = if total_amount > 0.0 {
            ((sub.amount / total_amount) * 100.0 * 100.0).round() / 100.0
        } else {
            0.0
        };
    }

    let grand_total = if has_subcategories {
        total_amount
    } else {
        direct_amount
    };

    Ok(SubcategoryBreakdown {
        parent_category_id,
        parent_category_name: parent_name,
        total_amount: (grand_total * 100.0).round() / 100.0,
        subcategories,
    })
}

// ======================== YEAR-OVER-YEAR COMPARISON ========================

/// Compare income/expenses month-by-month between two years
#[tauri::command]
pub async fn get_year_over_year_comparison(
    pool: State<'_, SqlitePool>,
    current_year: i32,
) -> Result<Vec<YearComparison>, String> {
    let previous_year = current_year - 1;

    let rows = sqlx::query(
        r#"
        SELECT 
            CAST(strftime('%m', date) AS INTEGER) as month_num,
            CAST(strftime('%Y', date) AS INTEGER) as year,
            CAST(COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS REAL) as income,
            CAST(COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS REAL) as expense
        FROM transactions
        WHERE strftime('%Y', date) IN (?, ?)
        GROUP BY year, month_num
        ORDER BY month_num ASC
        "#,
    )
    .bind(current_year.to_string())
    .bind(previous_year.to_string())
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch YoY data: {}", e))?;

    let month_names = [
        "January",
        "February",
        "March",
        "April",
        "May",
        "June",
        "July",
        "August",
        "September",
        "October",
        "November",
        "December",
    ];

    // Build lookup: (year, month) -> (income, expense)
    let mut data: std::collections::HashMap<(i32, i32), (f64, f64)> =
        std::collections::HashMap::new();
    for row in rows.iter() {
        let year: i32 = row.get("year");
        let month_num: i32 = row.get("month_num");
        let income: f64 = row.get("income");
        let expense: f64 = row.get("expense");
        data.insert((year, month_num), (income, expense));
    }

    let mut comparisons = Vec::new();
    for m in 1..=12 {
        let (cur_income, cur_expense) = data.get(&(current_year, m)).copied().unwrap_or((0.0, 0.0));
        let (prev_income, prev_expense) =
            data.get(&(previous_year, m)).copied().unwrap_or((0.0, 0.0));

        let income_change = if prev_income > 0.0 {
            ((cur_income - prev_income) / prev_income * 100.0 * 100.0).round() / 100.0
        } else if cur_income > 0.0 {
            100.0
        } else {
            0.0
        };

        let expense_change = if prev_expense > 0.0 {
            ((cur_expense - prev_expense) / prev_expense * 100.0 * 100.0).round() / 100.0
        } else if cur_expense > 0.0 {
            100.0
        } else {
            0.0
        };

        comparisons.push(YearComparison {
            month: month_names[(m - 1) as usize].to_string(),
            month_num: m,
            current_year_income: (cur_income * 100.0).round() / 100.0,
            current_year_expense: (cur_expense * 100.0).round() / 100.0,
            previous_year_income: (prev_income * 100.0).round() / 100.0,
            previous_year_expense: (prev_expense * 100.0).round() / 100.0,
            income_change,
            expense_change,
        });
    }

    Ok(comparisons)
}

// ======================== DASHBOARD ANALYTICS ========================

/// Single command that returns key analytics metrics for the dashboard
#[tauri::command]
pub async fn get_analytics_dashboard(
    pool: State<'_, SqlitePool>,
) -> Result<AnalyticsDashboard, String> {
    let today = Local::now().date_naive();
    let month_start = NaiveDate::from_ymd_opt(today.year(), today.month(), 1)
        .ok_or_else(|| "Failed to compute month start".to_string())?;
    let month_start_str = month_start.format("%Y-%m-%d").to_string();
    let today_str = today.format("%Y-%m-%d").to_string();

    // Income & expense this month
    let summary_row = sqlx::query(
        r#"
        SELECT 
            CAST(COALESCE(SUM(CASE WHEN type = 'INCOME' THEN amount ELSE 0 END), 0) AS REAL) as income,
            CAST(COALESCE(SUM(CASE WHEN type = 'EXPENSE' THEN amount ELSE 0 END), 0) AS REAL) as expense
        FROM transactions
        WHERE date >= ? AND date <= ?
        "#,
    )
    .bind(&month_start_str)
    .bind(&today_str)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch summary: {}", e))?;

    let income: f64 = summary_row.get("income");
    let expense: f64 = summary_row.get("expense");

    // Net worth = sum of all account balances
    let accounts = sqlx::query(
        r#"
        SELECT a.initial_balance, ag.type as account_type,
               CAST(COALESCE(SUM(je.debit), 0) - COALESCE(SUM(je.credit), 0) AS REAL) as journal_balance
        FROM accounts a
        JOIN account_groups ag ON a.group_id = ag.id
        LEFT JOIN journal_entries je ON je.account_id = a.id
        GROUP BY a.id
        "#,
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to calc net worth: {}", e))?;

    let mut total_assets = 0.0_f64;
    let mut total_liabilities = 0.0_f64;
    for acc in accounts.iter() {
        let initial: f64 = acc.get("initial_balance");
        let journal: f64 = acc.get("journal_balance");
        let balance = initial + journal;
        let acc_type: String = acc.get("account_type");
        match acc_type.as_str() {
            "ASSET" => total_assets += balance,
            "LIABILITY" => total_liabilities += (-balance).max(0.0),
            _ => {}
        }
    }
    let net_worth = total_assets - total_liabilities;

    // Previous month net worth for change calculation
    let prev_month_end = month_start.pred_opt().unwrap_or(month_start);
    let prev_month_end_str = prev_month_end.format("%Y-%m-%d").to_string();

    let prev_accounts = sqlx::query(
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
    .bind(&prev_month_end_str)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to calc prev net worth: {}", e))?;

    let mut prev_assets = 0.0_f64;
    let mut prev_liabilities = 0.0_f64;
    for acc in prev_accounts.iter() {
        let initial: f64 = acc.get("initial_balance");
        let journal: f64 = acc.get("journal_balance");
        let balance = initial + journal;
        let acc_type: String = acc.get("account_type");
        match acc_type.as_str() {
            "ASSET" => prev_assets += balance,
            "LIABILITY" => prev_liabilities += (-balance).max(0.0),
            _ => {}
        }
    }
    let prev_net_worth = prev_assets - prev_liabilities;
    let net_worth_change = net_worth - prev_net_worth;

    // Top expense category this month
    let top_cat_row = sqlx::query(
        r#"
        SELECT COALESCE(pc.name, c.name) as category_name,
               CAST(SUM(t.amount) AS REAL) as total
        FROM transactions t
        INNER JOIN categories c ON t.category_id = c.id
        LEFT JOIN categories pc ON c.parent_id = pc.id
        WHERE t.date >= ? AND t.date <= ? AND t.type = 'EXPENSE'
        GROUP BY COALESCE(c.parent_id, c.id)
        ORDER BY total DESC
        LIMIT 1
        "#,
    )
    .bind(&month_start_str)
    .bind(&today_str)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch top category: {}", e))?;

    let (top_expense_category, top_expense_amount) = match top_cat_row {
        Some(r) => (
            Some(r.get::<String, _>("category_name")),
            r.get::<f64, _>("total"),
        ),
        None => (None, 0.0),
    };

    // Days in period & daily average
    let days_in_period = (today - month_start).num_days() + 1;
    let daily_average_expense = if days_in_period > 0 {
        expense / days_in_period as f64
    } else {
        0.0
    };

    let savings_rate = if income > 0.0 {
        ((income - expense) / income * 100.0 * 100.0).round() / 100.0
    } else {
        0.0
    };

    Ok(AnalyticsDashboard {
        net_worth: (net_worth * 100.0).round() / 100.0,
        net_worth_change: (net_worth_change * 100.0).round() / 100.0,
        total_income_this_month: (income * 100.0).round() / 100.0,
        total_expense_this_month: (expense * 100.0).round() / 100.0,
        savings_rate,
        top_expense_category,
        top_expense_amount: (top_expense_amount * 100.0).round() / 100.0,
        daily_average_expense: (daily_average_expense * 100.0).round() / 100.0,
        days_in_period,
    })
}
