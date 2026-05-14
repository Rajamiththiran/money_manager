// File: src-tauri/src/commands/bills.rs
use crate::models::bill::UpcomingBill;
use crate::AppState;
use chrono::{Duration, NaiveDate};
use rusqlite::params;
use tauri::State;

// ======================== GET UPCOMING BILLS ========================

#[tauri::command]
pub fn get_upcoming_bills(
    state: State<'_, AppState>,
    days_ahead: i64,
) -> Result<Vec<UpcomingBill>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let today = chrono::Local::now().naive_local().date();
    let future_date = today + Duration::days(days_ahead);
    let _today_str = today.format("%Y-%m-%d").to_string();
    let future_str = future_date.format("%Y-%m-%d").to_string();

    let mut bills: Vec<UpcomingBill> = Vec::new();

    // ── 1. Recurring transactions ──
    let mut recurring_stmt = conn
        .prepare(
            r#"
            SELECT rt.id, rt.name, rt.amount, rt.transaction_type, rt.next_execution_date,
                   a.name as account_name,
                   c.name as category_name
            FROM recurring_transactions rt
            INNER JOIN accounts a ON rt.account_id = a.id
            LEFT JOIN categories c ON rt.category_id = c.id
            WHERE rt.is_active = 1
              AND rt.next_execution_date <= ?1
            ORDER BY rt.next_execution_date ASC
            "#,
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let recurring_iter = recurring_stmt
        .query_map(params![future_str], |row| {
            let due_date_str: String = row.get(4)?;
            let due_date = NaiveDate::parse_from_str(&due_date_str, "%Y-%m-%d").unwrap_or(today);
            let days_until = (due_date - today).num_days();

            Ok(UpcomingBill {
                source: "RECURRING".to_string(),
                source_id: row.get(0)?,
                name: row.get(1)?,
                amount: row.get(2)?,
                due_date: due_date_str,
                days_until_due: days_until,
                transaction_type: row.get(3)?,
                account_name: row.get(5)?,
                category_name: row.get(6)?,
                is_overdue: days_until < 0,
                is_due_today: days_until == 0,
                installment_progress: None,
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?;

    for bill in recurring_iter {
        if let Ok(b) = bill {
            bills.push(b);
        }
    }

    // ── 2. Installment plans ──
    let mut installment_stmt = conn
        .prepare(
            r#"
            SELECT ip.id, ip.name, ip.amount_per_installment, ip.next_due_date,
                   ip.installments_paid, ip.num_installments,
                   a.name as account_name,
                   c.name as category_name
            FROM installment_plans ip
            INNER JOIN accounts a ON ip.account_id = a.id
            INNER JOIN categories c ON ip.category_id = c.id
            WHERE ip.status = 'ACTIVE'
              AND ip.next_due_date <= ?1
            ORDER BY ip.next_due_date ASC
            "#,
        )
        .map_err(|e| format!("Query error: {}", e))?;

    let installment_iter = installment_stmt
        .query_map(params![future_str], |row| {
            let due_date_str: String = row.get(3)?;
            let due_date = NaiveDate::parse_from_str(&due_date_str, "%Y-%m-%d").unwrap_or(today);
            let days_until = (due_date - today).num_days();
            let paid: i32 = row.get(4)?;
            let total: i32 = row.get(5)?;

            Ok(UpcomingBill {
                source: "INSTALLMENT".to_string(),
                source_id: row.get(0)?,
                name: row.get(1)?,
                amount: row.get(2)?,
                due_date: due_date_str,
                days_until_due: days_until,
                transaction_type: "EXPENSE".to_string(),
                account_name: row.get(6)?,
                category_name: row.get(7)?,
                is_overdue: days_until < 0,
                is_due_today: days_until == 0,
                installment_progress: Some(format!("{}/{}", paid + 1, total)),
            })
        })
        .map_err(|e| format!("Execute error: {}", e))?;

    for bill in installment_iter {
        if let Ok(b) = bill {
            bills.push(b);
        }
    }

    // Sort by due_date (overdue first, then today, then future)
    bills.sort_by(|a, b| a.days_until_due.cmp(&b.days_until_due));

    Ok(bills)
}

// ======================== GET OVERDUE BILL COUNT ========================

#[tauri::command]
pub fn get_overdue_bill_count(state: State<'_, AppState>) -> Result<i64, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let today_str = chrono::Local::now()
        .naive_local()
        .date()
        .format("%Y-%m-%d")
        .to_string();

    let recurring_count: i64 = conn
        .query_row(
            r#"
            SELECT COUNT(*) FROM recurring_transactions
            WHERE is_active = 1 AND next_execution_date <= ?1
            "#,
            params![today_str],
            |row| row.get(0),
        )
        .unwrap_or(0);

    let installment_count: i64 = conn
        .query_row(
            r#"
            SELECT COUNT(*) FROM installment_plans
            WHERE status = 'ACTIVE' AND next_due_date <= ?1
            "#,
            params![today_str],
            |row| row.get(0),
        )
        .unwrap_or(0);

    Ok(recurring_count + installment_count)
}

// ======================== SKIP BILL OCCURRENCE ========================

#[tauri::command]
pub fn skip_bill_occurrence(
    state: State<'_, AppState>,
    source: String,
    source_id: i64,
) -> Result<String, String> {
    match source.as_str() {
        "RECURRING" => crate::commands::recurring::skip_next_occurrence(state, source_id),
        "INSTALLMENT" => Err("Installment payments cannot be skipped. Pay the installment or cancel the plan instead.".to_string()),
        _ => Err(format!("Unknown bill source: {}", source)),
    }
}

// ======================== PAY BILL NOW ========================

#[tauri::command]
pub fn pay_bill_now(
    state: State<'_, AppState>,
    source: String,
    source_id: i64,
) -> Result<i64, String> {
    match source.as_str() {
        "RECURRING" => crate::commands::recurring::execute_recurring_transaction(state, source_id),
        "INSTALLMENT" => {
            let payment = crate::commands::installments::process_installment_payment(state, source_id)?;
            Ok(payment.transaction_id)
        }
        _ => Err(format!("Unknown bill source: {}", source)),
    }
}
