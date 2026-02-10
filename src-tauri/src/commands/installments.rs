// File: src-tauri/src/commands/installments.rs
use crate::models::installment::{
    CreateInstallmentPlan, InstallmentPayment, InstallmentPaymentDetails, InstallmentPlan,
    InstallmentPlanWithDetails,
};
use chrono::{Duration, NaiveDate};
use sqlx::{Row, SqlitePool};

#[tauri::command]
pub async fn create_installment_plan(
    pool: tauri::State<'_, SqlitePool>,
    plan: CreateInstallmentPlan,
) -> Result<InstallmentPlan, String> {
    if plan.total_amount <= 0.0 {
        return Err("Total amount must be greater than 0".to_string());
    }
    if plan.num_installments <= 0 {
        return Err("Number of installments must be greater than 0".to_string());
    }

    let amount_per_installment =
        (plan.total_amount / plan.num_installments as f64 * 100.0).round() / 100.0;

    let account_exists = sqlx::query("SELECT id FROM accounts WHERE id = ?")
        .bind(plan.account_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    if account_exists.is_none() {
        return Err("Account not found".to_string());
    }

    let category_exists = sqlx::query("SELECT id FROM categories WHERE id = ?")
        .bind(plan.category_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    if category_exists.is_none() {
        return Err("Category not found".to_string());
    }

    let next_due_date = calculate_next_due_date(&plan.start_date, &plan.frequency, 1)?;

    let result = sqlx::query(
        r#"
        INSERT INTO installment_plans (
            name, total_amount, num_installments, amount_per_installment,
            account_id, category_id, start_date, frequency, next_due_date, memo
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&plan.name)
    .bind(plan.total_amount)
    .bind(plan.num_installments)
    .bind(amount_per_installment)
    .bind(plan.account_id)
    .bind(plan.category_id)
    .bind(&plan.start_date)
    .bind(&plan.frequency)
    .bind(&next_due_date)
    .bind(&plan.memo)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let plan_id = result.last_insert_rowid();

    get_installment_plan(pool, plan_id).await
}

#[tauri::command]
pub async fn get_installment_plan(
    pool: tauri::State<'_, SqlitePool>,
    plan_id: i64,
) -> Result<InstallmentPlan, String> {
    let row = sqlx::query(
        r#"
        SELECT 
            id, name, total_amount, num_installments, amount_per_installment,
            account_id, category_id, start_date, frequency, next_due_date,
            installments_paid, total_paid, status, memo, created_at, updated_at
        FROM installment_plans
        WHERE id = ?
        "#,
    )
    .bind(plan_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| e.to_string())?
    .ok_or_else(|| "Installment plan not found".to_string())?;

    Ok(InstallmentPlan {
        id: row.get("id"),
        name: row.get("name"),
        total_amount: row.get("total_amount"),
        num_installments: row.get("num_installments"),
        amount_per_installment: row.get("amount_per_installment"),
        account_id: row.get("account_id"),
        category_id: row.get("category_id"),
        start_date: row.get("start_date"),
        frequency: row.get("frequency"),
        next_due_date: row.get("next_due_date"),
        installments_paid: row.get("installments_paid"),
        total_paid: row.get("total_paid"),
        status: row.get("status"),
        memo: row.get("memo"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    })
}

#[tauri::command]
pub async fn get_installment_plans(
    pool: tauri::State<'_, SqlitePool>,
    status_filter: Option<String>,
) -> Result<Vec<InstallmentPlan>, String> {
    let rows = if let Some(status) = status_filter {
        sqlx::query(
            r#"
            SELECT 
                id, name, total_amount, num_installments, amount_per_installment,
                account_id, category_id, start_date, frequency, next_due_date,
                installments_paid, total_paid, status, memo, created_at, updated_at
            FROM installment_plans
            WHERE status = ?
            ORDER BY next_due_date ASC
            "#,
        )
        .bind(status)
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?
    } else {
        sqlx::query(
            r#"
            SELECT 
                id, name, total_amount, num_installments, amount_per_installment,
                account_id, category_id, start_date, frequency, next_due_date,
                installments_paid, total_paid, status, memo, created_at, updated_at
            FROM installment_plans
            ORDER BY status ASC, next_due_date ASC
            "#,
        )
        .fetch_all(pool.inner())
        .await
        .map_err(|e| e.to_string())?
    };

    let plans = rows
        .iter()
        .map(|row| InstallmentPlan {
            id: row.get("id"),
            name: row.get("name"),
            total_amount: row.get("total_amount"),
            num_installments: row.get("num_installments"),
            amount_per_installment: row.get("amount_per_installment"),
            account_id: row.get("account_id"),
            category_id: row.get("category_id"),
            start_date: row.get("start_date"),
            frequency: row.get("frequency"),
            next_due_date: row.get("next_due_date"),
            installments_paid: row.get("installments_paid"),
            total_paid: row.get("total_paid"),
            status: row.get("status"),
            memo: row.get("memo"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
        .collect();

    Ok(plans)
}

#[tauri::command]
pub async fn get_installment_plan_with_details(
    pool: tauri::State<'_, SqlitePool>,
    plan_id: i64,
) -> Result<InstallmentPlanWithDetails, String> {
    let plan = get_installment_plan(pool.clone(), plan_id).await?;

    let account_row = sqlx::query("SELECT name FROM accounts WHERE id = ?")
        .bind(plan.account_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let account_name: String = account_row.get("name");

    let category_row = sqlx::query("SELECT name FROM categories WHERE id = ?")
        .bind(plan.category_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| e.to_string())?;
    let category_name: String = category_row.get("name");

    let payment_rows = sqlx::query(
        r#"
        SELECT 
            id, installment_plan_id, transaction_id, installment_number,
            amount, due_date, paid_date, created_at
        FROM installment_payments
        WHERE installment_plan_id = ?
        ORDER BY installment_number ASC
        "#,
    )
    .bind(plan_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let payment_details: Vec<InstallmentPaymentDetails> = payment_rows
        .iter()
        .map(|row| {
            let paid_date: String = row.get("paid_date");
            let status = if paid_date <= today {
                "PAID".to_string()
            } else {
                "PENDING".to_string()
            };

            InstallmentPaymentDetails {
                installment_number: row.get("installment_number"),
                amount: row.get("amount"),
                due_date: row.get("due_date"),
                paid_date: Some(paid_date.clone()),
                status,
                payment: InstallmentPayment {
                    id: row.get("id"),
                    installment_plan_id: row.get("installment_plan_id"),
                    transaction_id: row.get("transaction_id"),
                    installment_number: row.get("installment_number"),
                    amount: row.get("amount"),
                    due_date: row.get("due_date"),
                    paid_date,
                    created_at: row.get("created_at"),
                },
            }
        })
        .collect();

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
pub async fn process_installment_payment(
    pool: tauri::State<'_, SqlitePool>,
    plan_id: i64,
) -> Result<InstallmentPayment, String> {
    let mut plan = get_installment_plan(pool.clone(), plan_id).await?;

    if plan.status == "COMPLETED" {
        return Err("Installment plan is already completed".to_string());
    }

    if plan.status == "CANCELLED" {
        return Err("Installment plan is cancelled".to_string());
    }

    if plan.installments_paid >= plan.num_installments {
        return Err("All installments have been paid".to_string());
    }

    let next_installment_number = plan.installments_paid + 1;
    let payment_amount = if next_installment_number == plan.num_installments {
        plan.total_amount - plan.total_paid
    } else {
        plan.amount_per_installment
    };

    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let memo = format!(
        "{} - Installment {}/{}",
        plan.name, next_installment_number, plan.num_installments
    );

    let transaction_result = sqlx::query(
        r#"
        INSERT INTO transactions (
            type, date, account_id, category_id,
            amount, memo
        ) VALUES ('EXPENSE', ?, ?, ?, ?, ?)
        "#,
    )
    .bind(&today)
    .bind(plan.account_id)
    .bind(plan.category_id)
    .bind(payment_amount)
    .bind(&memo)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let transaction_id = transaction_result.last_insert_rowid();

    // EXPENSE: Credit the account (decrease asset) — matches create_transaction pattern
    sqlx::query(
        r#"
        INSERT INTO journal_entries (transaction_id, account_id, debit, credit)
        VALUES (?, ?, 0.0, ?)
        "#,
    )
    .bind(transaction_id)
    .bind(plan.account_id)
    .bind(payment_amount)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let payment_result = sqlx::query(
        r#"
        INSERT INTO installment_payments (
            installment_plan_id, transaction_id, installment_number,
            amount, due_date, paid_date
        ) VALUES (?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(plan_id)
    .bind(transaction_id)
    .bind(next_installment_number)
    .bind(payment_amount)
    .bind(&plan.next_due_date)
    .bind(&today)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let payment_id = payment_result.last_insert_rowid();

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

    sqlx::query(
        r#"
        UPDATE installment_plans
        SET installments_paid = ?,
            total_paid = ?,
            next_due_date = ?,
            status = ?,
            updated_at = datetime('now')
        WHERE id = ?
        "#,
    )
    .bind(plan.installments_paid)
    .bind(plan.total_paid)
    .bind(&next_due_date)
    .bind(new_status)
    .bind(plan_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let payment_row = sqlx::query(
        r#"
        SELECT 
            id, installment_plan_id, transaction_id, installment_number,
            amount, due_date, paid_date, created_at
        FROM installment_payments
        WHERE id = ?
        "#,
    )
    .bind(payment_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(InstallmentPayment {
        id: payment_row.get("id"),
        installment_plan_id: payment_row.get("installment_plan_id"),
        transaction_id: payment_row.get("transaction_id"),
        installment_number: payment_row.get("installment_number"),
        amount: payment_row.get("amount"),
        due_date: payment_row.get("due_date"),
        paid_date: payment_row.get("paid_date"),
        created_at: payment_row.get("created_at"),
    })
}

#[tauri::command]
pub async fn cancel_installment_plan(
    pool: tauri::State<'_, SqlitePool>,
    plan_id: i64,
) -> Result<(), String> {
    sqlx::query(
        r#"
        UPDATE installment_plans
        SET status = 'CANCELLED',
            updated_at = datetime('now')
        WHERE id = ?
        "#,
    )
    .bind(plan_id)
    .execute(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn delete_installment_plan(
    pool: tauri::State<'_, SqlitePool>,
    plan_id: i64,
) -> Result<(), String> {
    let count_row = sqlx::query(
        "SELECT COUNT(*) as count FROM installment_payments WHERE installment_plan_id = ?",
    )
    .bind(plan_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let count: i64 = count_row.get("count");

    if count > 0 {
        return Err(
            "Cannot delete installment plan with existing payments. Cancel it instead.".to_string(),
        );
    }

    sqlx::query("DELETE FROM installment_plans WHERE id = ?")
        .bind(plan_id)
        .execute(pool.inner())
        .await
        .map_err(|e| e.to_string())?;

    Ok(())
}

#[tauri::command]
pub async fn get_upcoming_installments(
    pool: tauri::State<'_, SqlitePool>,
    days_ahead: i32,
) -> Result<Vec<InstallmentPlan>, String> {
    let today = chrono::Local::now().format("%Y-%m-%d").to_string();
    let future_date = (chrono::Local::now() + Duration::days(days_ahead as i64))
        .format("%Y-%m-%d")
        .to_string();

    let rows = sqlx::query(
        r#"
        SELECT 
            id, name, total_amount, num_installments, amount_per_installment,
            account_id, category_id, start_date, frequency, next_due_date,
            installments_paid, total_paid, status, memo, created_at, updated_at
        FROM installment_plans
        WHERE status = 'ACTIVE'
          AND next_due_date >= ?
          AND next_due_date <= ?
        ORDER BY next_due_date ASC
        "#,
    )
    .bind(&today)
    .bind(&future_date)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| e.to_string())?;

    let plans = rows
        .iter()
        .map(|row| InstallmentPlan {
            id: row.get("id"),
            name: row.get("name"),
            total_amount: row.get("total_amount"),
            num_installments: row.get("num_installments"),
            amount_per_installment: row.get("amount_per_installment"),
            account_id: row.get("account_id"),
            category_id: row.get("category_id"),
            start_date: row.get("start_date"),
            frequency: row.get("frequency"),
            next_due_date: row.get("next_due_date"),
            installments_paid: row.get("installments_paid"),
            total_paid: row.get("total_paid"),
            status: row.get("status"),
            memo: row.get("memo"),
            created_at: row.get("created_at"),
            updated_at: row.get("updated_at"),
        })
        .collect();

    Ok(plans)
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
