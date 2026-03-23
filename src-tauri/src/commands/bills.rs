// File: src-tauri/src/commands/bills.rs
use crate::models::bill::UpcomingBill;
use chrono::{Duration, NaiveDate};
use sqlx::{Row, SqlitePool};
use tauri::State;

// ======================== GET UPCOMING BILLS ========================

/// Returns a unified, sorted list of upcoming bills from both
/// recurring transactions and installment plans.
#[tauri::command]
pub async fn get_upcoming_bills(
    pool: State<'_, SqlitePool>,
    days_ahead: i64,
) -> Result<Vec<UpcomingBill>, String> {
    let today = chrono::Local::now().naive_local().date();
    let future_date = today + Duration::days(days_ahead);
    let today_str = today.format("%Y-%m-%d").to_string();
    let future_str = future_date.format("%Y-%m-%d").to_string();

    let mut bills: Vec<UpcomingBill> = Vec::new();

    // ── 1. Recurring transactions ──
    // Include overdue (next_execution_date < today) AND upcoming (up to days_ahead)
    let recurring_rows = sqlx::query(
        "SELECT rt.id, rt.name, rt.amount, rt.transaction_type, rt.next_execution_date,
                a.name as account_name,
                c.name as category_name
         FROM recurring_transactions rt
         INNER JOIN accounts a ON rt.account_id = a.id
         LEFT JOIN categories c ON rt.category_id = c.id
         WHERE rt.is_active = 1
           AND rt.next_execution_date <= ?
         ORDER BY rt.next_execution_date ASC",
    )
    .bind(&future_str)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch recurring transactions: {}", e))?;

    for row in &recurring_rows {
        let due_date_str: String = row.get("next_execution_date");
        let due_date = NaiveDate::parse_from_str(&due_date_str, "%Y-%m-%d")
            .unwrap_or(today);
        let days_until = (due_date - today).num_days();

        bills.push(UpcomingBill {
            source: "RECURRING".to_string(),
            source_id: row.get("id"),
            name: row.get("name"),
            amount: row.get("amount"),
            due_date: due_date_str,
            days_until_due: days_until,
            transaction_type: row.get("transaction_type"),
            account_name: row.get("account_name"),
            category_name: row.get("category_name"),
            is_overdue: days_until < 0,
            is_due_today: days_until == 0,
            installment_progress: None,
        });
    }

    // ── 2. Installment plans ──
    // Include overdue + upcoming active installments
    let installment_rows = sqlx::query(
        "SELECT ip.id, ip.name, ip.amount_per_installment, ip.next_due_date,
                ip.installments_paid, ip.num_installments,
                a.name as account_name,
                c.name as category_name
         FROM installment_plans ip
         INNER JOIN accounts a ON ip.account_id = a.id
         INNER JOIN categories c ON ip.category_id = c.id
         WHERE ip.status = 'ACTIVE'
           AND ip.next_due_date <= ?
         ORDER BY ip.next_due_date ASC",
    )
    .bind(&future_str)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch installment plans: {}", e))?;

    for row in &installment_rows {
        let due_date_str: String = row.get("next_due_date");
        let due_date = NaiveDate::parse_from_str(&due_date_str, "%Y-%m-%d")
            .unwrap_or(today);
        let days_until = (due_date - today).num_days();
        let paid: i32 = row.get("installments_paid");
        let total: i32 = row.get("num_installments");

        bills.push(UpcomingBill {
            source: "INSTALLMENT".to_string(),
            source_id: row.get("id"),
            name: row.get("name"),
            amount: row.get("amount_per_installment"),
            due_date: due_date_str,
            days_until_due: days_until,
            transaction_type: "EXPENSE".to_string(),
            account_name: row.get("account_name"),
            category_name: row.get("category_name"),
            is_overdue: days_until < 0,
            is_due_today: days_until == 0,
            installment_progress: Some(format!("{}/{}", paid + 1, total)),
        });
    }

    // Sort by due_date (overdue first, then today, then future)
    bills.sort_by(|a, b| a.days_until_due.cmp(&b.days_until_due));

    Ok(bills)
}

// ======================== GET OVERDUE BILL COUNT ========================

/// Returns the count of overdue + due-today bills for the sidebar badge.
#[tauri::command]
pub async fn get_overdue_bill_count(
    pool: State<'_, SqlitePool>,
) -> Result<i64, String> {
    let today_str = chrono::Local::now()
        .naive_local()
        .date()
        .format("%Y-%m-%d")
        .to_string();

    // Count overdue + due-today recurring transactions
    let recurring_count: i64 = sqlx::query(
        "SELECT COUNT(*) as cnt FROM recurring_transactions
         WHERE is_active = 1 AND next_execution_date <= ?",
    )
    .bind(&today_str)
    .fetch_one(pool.inner())
    .await
    .map(|row| row.get("cnt"))
    .unwrap_or(0);

    // Count overdue + due-today installments
    let installment_count: i64 = sqlx::query(
        "SELECT COUNT(*) as cnt FROM installment_plans
         WHERE status = 'ACTIVE' AND next_due_date <= ?",
    )
    .bind(&today_str)
    .fetch_one(pool.inner())
    .await
    .map(|row| row.get("cnt"))
    .unwrap_or(0);

    Ok(recurring_count + installment_count)
}

// ======================== SKIP BILL OCCURRENCE ========================

/// Skip a bill occurrence. Only supported for recurring transactions.
/// Installments cannot be skipped — they must be paid or the plan cancelled.
#[tauri::command]
pub async fn skip_bill_occurrence(
    pool: State<'_, SqlitePool>,
    source: String,
    source_id: i64,
) -> Result<String, String> {
    match source.as_str() {
        "RECURRING" => {
            crate::commands::recurring::skip_next_occurrence(pool, source_id).await
        }
        "INSTALLMENT" => {
            Err("Installment payments cannot be skipped. Pay the installment or cancel the plan instead.".to_string())
        }
        _ => Err(format!("Unknown bill source: {}", source)),
    }
}

// ======================== PAY BILL NOW ========================

/// Immediately pay a bill. Creates the actual transaction and advances the schedule.
#[tauri::command]
pub async fn pay_bill_now(
    pool: State<'_, SqlitePool>,
    source: String,
    source_id: i64,
) -> Result<i64, String> {
    match source.as_str() {
        "RECURRING" => {
            crate::commands::recurring::execute_recurring_transaction(pool, source_id).await
        }
        "INSTALLMENT" => {
            let payment = crate::commands::installments::process_installment_payment(pool, source_id).await?;
            Ok(payment.transaction_id)
        }
        _ => Err(format!("Unknown bill source: {}", source)),
    }
}
