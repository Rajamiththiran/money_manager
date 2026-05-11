// File: src-tauri/src/commands/installments.rs
use crate::models::installment::{
    CreateInstallmentPlan, InstallmentPayment, InstallmentPaymentDetails, InstallmentPlan,
    InstallmentPlanWithDetails,
};
use crate::AppState;
use chrono::{Duration, NaiveDate};
use rusqlite::params;
use tauri::State;

#[tauri::command]
pub fn create_installment_plan(
    state: State<'_, AppState>,
    plan: CreateInstallmentPlan,
) -> Result<InstallmentPlan, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    if plan.total_amount <= 0.0 {
        return Err("Total amount must be greater than 0".to_string());
    }
    if plan.num_installments <= 0 {
        return Err("Number of installments must be greater than 0".to_string());
    }

    let amount_per_installment =
        (plan.total_amount / plan.num_installments as f64 * 100.0).round() / 100.0;

    let account_exists: bool = conn.query_row(
        "SELECT COUNT(id) FROM accounts WHERE id = ?1",
        params![plan.account_id],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !account_exists {
        return Err("Account not found".to_string());
    }

    let category_exists: bool = conn.query_row(
        "SELECT COUNT(id) FROM categories WHERE id = ?1",
        params![plan.category_id],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if !category_exists {
        return Err("Category not found".to_string());
    }

    let next_due_date = calculate_next_due_date(&plan.start_date, &plan.frequency, 1)?;

    conn.execute(
        r#"
        INSERT INTO installment_plans (
            name, total_amount, num_installments, amount_per_installment,
            account_id, category_id, start_date, frequency, next_due_date, memo
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            plan.name,
            plan.total_amount,
            plan.num_installments,
            amount_per_installment,
            plan.account_id,
            plan.category_id,
            plan.start_date,
            plan.frequency,
            next_due_date,
            plan.memo
        ],
    ).map_err(|e| e.to_string())?;

    let plan_id = conn.last_insert_rowid();

    get_installment_plan_internal(&conn, plan_id)
}

#[tauri::command]
pub fn get_installment_plan(
    state: State<'_, AppState>,
    plan_id: i64,
) -> Result<InstallmentPlan, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    get_installment_plan_internal(&conn, plan_id)
}

fn get_installment_plan_internal(
    conn: &rusqlite::Connection,
    plan_id: i64,
) -> Result<InstallmentPlan, String> {
    let mut stmt = conn.prepare(
        r#"
        SELECT 
            id, name, total_amount, num_installments, amount_per_installment,
            account_id, category_id, start_date, frequency, next_due_date,
            installments_paid, total_paid, status, memo, created_at, updated_at
        FROM installment_plans
        WHERE id = ?1
        "#,
    ).map_err(|e| e.to_string())?;

    stmt.query_row(params![plan_id], row_to_installment_plan)
        .map_err(|_| "Installment plan not found".to_string())
}

#[tauri::command]
pub fn get_installment_plans(
    state: State<'_, AppState>,
    status_filter: Option<String>,
) -> Result<Vec<InstallmentPlan>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let plans = if let Some(status) = status_filter {
        let mut stmt = conn.prepare(
            r#"
            SELECT 
                id, name, total_amount, num_installments, amount_per_installment,
                account_id, category_id, start_date, frequency, next_due_date,
                installments_paid, total_paid, status, memo, created_at, updated_at
            FROM installment_plans
            WHERE status = ?1
            ORDER BY next_due_date ASC
            "#,
        ).unwrap();
        stmt.query_map(params![status], row_to_installment_plan)
            .unwrap()
            .filter_map(Result::ok)
            .collect()
    } else {
        let mut stmt = conn.prepare(
            r#"
            SELECT 
                id, name, total_amount, num_installments, amount_per_installment,
                account_id, category_id, start_date, frequency, next_due_date,
                installments_paid, total_paid, status, memo, created_at, updated_at
            FROM installment_plans
            ORDER BY status ASC, next_due_date ASC
            "#,
        ).unwrap();
        stmt.query_map([], row_to_installment_plan)
            .unwrap()
            .filter_map(Result::ok)
            .collect()
    };

    Ok(plans)
}

#[tauri::command]
pub fn get_installment_plan_with_details(
    state: State<'_, AppState>,
    plan_id: i64,
) -> Result<InstallmentPlanWithDetails, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let plan = get_installment_plan_internal(&conn, plan_id)?;

    let account_name: String = conn.query_row(
        "SELECT name FROM accounts WHERE id = ?1",
        params![plan.account_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let category_name: String = conn.query_row(
        "SELECT name FROM categories WHERE id = ?1",
        params![plan.category_id],
        |row| row.get(0),
    ).map_err(|e| e.to_string())?;

    let mut stmt = conn.prepare(
        r#"
        SELECT 
            id, installment_plan_id, transaction_id, installment_number,
            amount, due_date, paid_date, created_at
        FROM installment_payments
        WHERE installment_plan_id = ?1
        ORDER BY installment_number ASC
        "#,
    ).map_err(|e| e.to_string())?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let payment_details: Vec<InstallmentPaymentDetails> = stmt.query_map(params![plan_id], |row| {
        let paid_date: String = row.get(6)?;
        let status = if paid_date <= today {
            "PAID".to_string()
        } else {
            "PENDING".to_string()
        };

        Ok(InstallmentPaymentDetails {
            installment_number: row.get(3)?,
            amount: row.get(4)?,
            due_date: row.get(5)?,
            paid_date: Some(paid_date.clone()),
            status,
            payment: InstallmentPayment {
                id: row.get(0)?,
                installment_plan_id: row.get(1)?,
                transaction_id: row.get(2)?,
                installment_number: row.get(3)?,
                amount: row.get(4)?,
                due_date: row.get(5)?,
                paid_date,
                created_at: row.get(7)?,
            },
        })
    }).unwrap().filter_map(Result::ok).collect();

    let remaining_amount = plan.total_amount - plan.total_paid;
    let remaining_installments = plan.num_installments - plan.installments_paid;

    Ok(InstallmentPlanWithDetails {
        plan: plan.clone(),
        payments: payment_details,
        account_name,
        category_name,
        remaining_amount,
        remaining_installments,
        next_payment_amount: plan.amount_per_installment,
    })
}

#[tauri::command]
pub fn process_installment_payment(
    state: State<'_, AppState>,
    plan_id: i64,
) -> Result<InstallmentPayment, String> {
    let pool = crate::get_db(&state)?;
    let mut conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut plan = get_installment_plan_internal(&conn, plan_id)?;

    if plan.status != "ACTIVE" {
        return Err("Can only process payments for active installment plans".to_string());
    }

    if plan.installments_paid >= plan.num_installments {
        return Err("All installments have been paid".to_string());
    }

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let next_installment_number = plan.installments_paid + 1;
    let payment_amount = plan.amount_per_installment;

    let memo = format!(
        "Installment {}/{} for {}",
        next_installment_number, plan.num_installments, plan.name
    );

    let tx = conn.transaction().map_err(|e| format!("Transaction error: {}", e))?;

    tx.execute(
        r#"
        INSERT INTO transactions (
            type, date, account_id, category_id,
            amount, memo
        ) VALUES ('EXPENSE', ?1, ?2, ?3, ?4, ?5)
        "#,
        params![today, plan.account_id, plan.category_id, payment_amount, memo],
    ).map_err(|e| e.to_string())?;

    let transaction_id = tx.last_insert_rowid();

    tx.execute(
        r#"
        INSERT INTO journal_entries (transaction_id, account_id, debit, credit)
        VALUES (?1, ?2, 0.0, ?3)
        "#,
        params![transaction_id, plan.account_id, payment_amount],
    ).map_err(|e| e.to_string())?;

    tx.execute(
        r#"
        INSERT INTO installment_payments (
            installment_plan_id, transaction_id, installment_number,
            amount, due_date, paid_date
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6)
        "#,
        params![plan_id, transaction_id, next_installment_number, payment_amount, plan.next_due_date, today],
    ).map_err(|e| e.to_string())?;

    let payment_id = tx.last_insert_rowid();

    plan.installments_paid += 1;
    plan.total_paid += payment_amount;

    let new_status = if plan.installments_paid >= plan.num_installments {
        "COMPLETED"
    } else {
        "ACTIVE"
    };

    let next_due_date = if plan.installments_paid < plan.num_installments {
        calculate_next_due_date(
            &plan.start_date,
            &plan.frequency,
            plan.installments_paid + 1,
        )?
    } else {
        plan.next_due_date.clone()
    };

    tx.execute(
        r#"
        UPDATE installment_plans
        SET installments_paid = ?1,
            total_paid = ?2,
            next_due_date = ?3,
            status = ?4,
            updated_at = datetime('now')
        WHERE id = ?5
        "#,
        params![plan.installments_paid, plan.total_paid, next_due_date, new_status, plan_id],
    ).map_err(|e| e.to_string())?;

    let mut stmt = tx.prepare(
        r#"
        SELECT 
            id, installment_plan_id, transaction_id, installment_number,
            amount, due_date, paid_date, created_at
        FROM installment_payments
        WHERE id = ?1
        "#,
    ).unwrap();

    let payment = stmt.query_row(params![payment_id], |row| {
        Ok(InstallmentPayment {
            id: row.get(0)?,
            installment_plan_id: row.get(1)?,
            transaction_id: row.get(2)?,
            installment_number: row.get(3)?,
            amount: row.get(4)?,
            due_date: row.get(5)?,
            paid_date: row.get(6)?,
            created_at: row.get(7)?,
        })
    }).map_err(|e| e.to_string())?;

    drop(stmt);
    tx.commit().map_err(|e| format!("Failed to commit: {}", e))?;

    Ok(payment)
}

#[tauri::command]
pub fn cancel_installment_plan(
    state: State<'_, AppState>,
    plan_id: i64,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let plan = get_installment_plan_internal(&conn, plan_id)?;

    if plan.status != "ACTIVE" {
        return Err(format!(
            "Cannot cancel a {} plan. Only active plans can be cancelled.",
            plan.status.to_lowercase()
        ));
    }

    conn.execute(
        r#"
        UPDATE installment_plans
        SET status = 'CANCELLED',
            updated_at = datetime('now')
        WHERE id = ?1
        "#,
        params![plan_id],
    ).map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn delete_installment_plan(
    state: State<'_, AppState>,
    plan_id: i64,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let plan = get_installment_plan_internal(&conn, plan_id)?;

    if plan.status == "ACTIVE" {
        return Err(
            "Cannot delete an active installment plan. Cancel it first, then delete.".to_string(),
        );
    }

    conn.execute("DELETE FROM installment_payments WHERE installment_plan_id = ?1", params![plan_id])
        .map_err(|e| e.to_string())?;

    conn.execute("DELETE FROM installment_plans WHERE id = ?1", params![plan_id])
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub fn get_upcoming_installments(
    state: State<'_, AppState>,
    days_ahead: i32,
) -> Result<Vec<InstallmentPlan>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let future_date = (chrono::Local::now() + Duration::days(days_ahead as i64))
        .format("%Y-%m-%d")
        .to_string();

    let mut stmt = conn.prepare(
        r#"
        SELECT 
            id, name, total_amount, num_installments, amount_per_installment,
            account_id, category_id, start_date, frequency, next_due_date,
            installments_paid, total_paid, status, memo, created_at, updated_at
        FROM installment_plans
        WHERE status = 'ACTIVE'
          AND next_due_date >= ?1
          AND next_due_date <= ?2
        ORDER BY next_due_date ASC
        "#,
    ).map_err(|e| e.to_string())?;

    let plans: Vec<InstallmentPlan> = stmt.query_map(params![today, future_date], row_to_installment_plan)
        .unwrap()
        .filter_map(Result::ok)
        .collect();

    Ok(plans)
}

fn row_to_installment_plan(row: &rusqlite::Row) -> rusqlite::Result<InstallmentPlan> {
    Ok(InstallmentPlan {
        id: row.get(0)?,
        name: row.get(1)?,
        total_amount: row.get(2)?,
        num_installments: row.get(3)?,
        amount_per_installment: row.get(4)?,
        account_id: row.get(5)?,
        category_id: row.get(6)?,
        start_date: row.get(7)?,
        frequency: row.get(8)?,
        next_due_date: row.get(9)?,
        installments_paid: row.get(10)?,
        total_paid: row.get(11)?,
        status: row.get(12)?,
        memo: row.get(13)?,
        created_at: row.get(14)?,
        updated_at: row.get(15)?,
    })
}

fn calculate_next_due_date(
    start_date: &str,
    frequency: &str,
    installment_number: i32,
) -> Result<String, String> {
    let start = NaiveDate::parse_from_str(start_date, "%Y-%m-%d")
        .map_err(|e| format!("Invalid start date: {}", e))?;

    let next_date = match frequency {
        "MONTHLY" => start + Duration::days(30 * (installment_number - 1) as i64),
        "WEEKLY" => start + Duration::weeks((installment_number - 1) as i64),
        "DAILY" => start + Duration::days((installment_number - 1) as i64),
        _ => return Err("Invalid frequency".to_string()),
    };

    Ok(next_date.format("%Y-%m-%d").to_string())
}
