// File: src-tauri/src/commands/credit_cards.rs
use crate::models::credit_card::{
    CreateCreditCardSettingsInput, CreditCardSettings, CreditCardStatement, CreditCardSummary,
    CreditCardWithDetails, SettlementInput, StatementTransaction, StatementWithTransactions,
    UpdateCreditCardSettingsInput,
};
use chrono::{Datelike, Local, NaiveDate};
use sqlx::{Row, SqlitePool};
use tauri::State;

// ======================== CRUD ========================

#[tauri::command]
pub async fn create_credit_card_settings(
    pool: State<'_, SqlitePool>,
    input: CreateCreditCardSettingsInput,
) -> Result<CreditCardSettings, String> {
    // Validate account exists and belongs to Credit Card group (LIABILITY)
    let account_row = sqlx::query(
        r#"
        SELECT a.id, ag.type 
        FROM accounts a 
        JOIN account_groups ag ON a.group_id = ag.id 
        WHERE a.id = ?
        "#,
    )
    .bind(input.account_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Account not found".to_string())?;

    let account_type: String = account_row.get("type");
    if account_type != "LIABILITY" {
        return Err(
            "Credit card settings can only be created for LIABILITY accounts (Credit Card group)"
                .to_string(),
        );
    }

    // Check if settings already exist for this account
    let existing = sqlx::query("SELECT id FROM credit_card_settings WHERE account_id = ?")
        .bind(input.account_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    if existing.is_some() {
        return Err(
            "Credit card settings already exist for this account. Use update instead.".to_string(),
        );
    }

    // Validate statement_day and payment_due_day
    if input.statement_day < 1 || input.statement_day > 28 {
        return Err("Statement day must be between 1 and 28".to_string());
    }
    if input.payment_due_day < 1 || input.payment_due_day > 28 {
        return Err("Payment due day must be between 1 and 28".to_string());
    }

    if input.credit_limit < 0.0 {
        return Err("Credit limit cannot be negative".to_string());
    }

    // Validate settlement account if provided
    if let Some(settlement_id) = input.settlement_account_id {
        let settlement_row = sqlx::query(
            r#"
            SELECT ag.type 
            FROM accounts a 
            JOIN account_groups ag ON a.group_id = ag.id 
            WHERE a.id = ?
            "#,
        )
        .bind(settlement_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| "Settlement account not found".to_string())?;

        let settlement_type: String = settlement_row.get("type");
        if settlement_type != "ASSET" {
            return Err(
                "Settlement account must be an ASSET account (Bank/Cash/Savings)".to_string(),
            );
        }

        if settlement_id == input.account_id {
            return Err("Settlement account cannot be the credit card itself".to_string());
        }
    }

    let min_payment_pct = input.minimum_payment_percentage.unwrap_or(5.0);
    let auto_settlement = input.auto_settlement_enabled.unwrap_or(false);

    let result = sqlx::query(
        r#"
        INSERT INTO credit_card_settings (
            account_id, credit_limit, statement_day, payment_due_day,
            minimum_payment_percentage, auto_settlement_enabled, settlement_account_id
        ) VALUES (?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(input.account_id)
    .bind(input.credit_limit)
    .bind(input.statement_day)
    .bind(input.payment_due_day)
    .bind(min_payment_pct)
    .bind(auto_settlement as i32)
    .bind(input.settlement_account_id)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to create credit card settings: {}", e))?;

    let settings_id = result.last_insert_rowid();
    get_credit_card_settings_by_id(pool, settings_id).await
}

#[tauri::command]
pub async fn update_credit_card_settings(
    pool: State<'_, SqlitePool>,
    input: UpdateCreditCardSettingsInput,
) -> Result<CreditCardSettings, String> {
    let exists = sqlx::query("SELECT id FROM credit_card_settings WHERE id = ?")
        .bind(input.id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .is_some();

    if !exists {
        return Err("Credit card settings not found".to_string());
    }

    let mut set_clauses: Vec<String> = Vec::new();

    if let Some(limit) = input.credit_limit {
        if limit < 0.0 {
            return Err("Credit limit cannot be negative".to_string());
        }
        set_clauses.push(format!("credit_limit = {}", limit));
    }

    if let Some(day) = input.statement_day {
        if day < 1 || day > 28 {
            return Err("Statement day must be between 1 and 28".to_string());
        }
        set_clauses.push(format!("statement_day = {}", day));
    }

    if let Some(day) = input.payment_due_day {
        if day < 1 || day > 28 {
            return Err("Payment due day must be between 1 and 28".to_string());
        }
        set_clauses.push(format!("payment_due_day = {}", day));
    }

    if let Some(pct) = input.minimum_payment_percentage {
        if pct < 0.0 || pct > 100.0 {
            return Err("Minimum payment percentage must be between 0 and 100".to_string());
        }
        set_clauses.push(format!("minimum_payment_percentage = {}", pct));
    }

    if let Some(enabled) = input.auto_settlement_enabled {
        set_clauses.push(format!("auto_settlement_enabled = {}", enabled as i32));
    }

    if let Some(settlement_id) = input.settlement_account_id {
        // Validate settlement account
        let settlement_row = sqlx::query(
            r#"
            SELECT ag.type 
            FROM accounts a 
            JOIN account_groups ag ON a.group_id = ag.id 
            WHERE a.id = ?
            "#,
        )
        .bind(settlement_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| "Settlement account not found".to_string())?;

        let settlement_type: String = settlement_row.get("type");
        if settlement_type != "ASSET" {
            return Err("Settlement account must be an ASSET account".to_string());
        }
        set_clauses.push(format!("settlement_account_id = {}", settlement_id));
    }

    if set_clauses.is_empty() {
        return Err("No fields to update".to_string());
    }

    set_clauses.push("updated_at = datetime('now')".to_string());

    let query = format!(
        "UPDATE credit_card_settings SET {} WHERE id = {}",
        set_clauses.join(", "),
        input.id
    );

    sqlx::query(&query)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update credit card settings: {}", e))?;

    get_credit_card_settings_by_id(pool, input.id).await
}

#[tauri::command]
pub async fn delete_credit_card_settings(
    pool: State<'_, SqlitePool>,
    settings_id: i64,
) -> Result<(), String> {
    // Check for existing statements
    let count_row = sqlx::query(
        "SELECT COUNT(*) as count FROM credit_card_statements WHERE credit_card_id = ?",
    )
    .bind(settings_id)
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let count: i64 = count_row.get("count");
    if count > 0 {
        return Err(
            "Cannot delete credit card settings with existing statements. Delete statements first."
                .to_string(),
        );
    }

    let result = sqlx::query("DELETE FROM credit_card_settings WHERE id = ?")
        .bind(settings_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete credit card settings: {}", e))?;

    if result.rows_affected() == 0 {
        return Err("Credit card settings not found".to_string());
    }

    Ok(())
}

// ======================== QUERIES ========================

async fn get_credit_card_settings_by_id(
    pool: State<'_, SqlitePool>,
    settings_id: i64,
) -> Result<CreditCardSettings, String> {
    let row = sqlx::query(
        r#"
        SELECT id, account_id, credit_limit, statement_day, payment_due_day,
               minimum_payment_percentage, auto_settlement_enabled,
               settlement_account_id, created_at, updated_at
        FROM credit_card_settings
        WHERE id = ?
        "#,
    )
    .bind(settings_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Credit card settings not found".to_string())?;

    Ok(row_to_settings(&row))
}

#[tauri::command]
pub async fn get_credit_card_settings_by_account(
    pool: State<'_, SqlitePool>,
    account_id: i64,
) -> Result<Option<CreditCardSettings>, String> {
    let row = sqlx::query(
        r#"
        SELECT id, account_id, credit_limit, statement_day, payment_due_day,
               minimum_payment_percentage, auto_settlement_enabled,
               settlement_account_id, created_at, updated_at
        FROM credit_card_settings
        WHERE account_id = ?
        "#,
    )
    .bind(account_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    Ok(row.map(|r| row_to_settings(&r)))
}

#[tauri::command]
pub async fn get_all_credit_cards(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<CreditCardWithDetails>, String> {
    let rows = sqlx::query(
        r#"
        SELECT ccs.id, ccs.account_id, ccs.credit_limit, ccs.statement_day,
               ccs.payment_due_day, ccs.minimum_payment_percentage,
               ccs.auto_settlement_enabled, ccs.settlement_account_id,
               ccs.created_at, ccs.updated_at,
               a.name as account_name,
               sa.name as settlement_account_name
        FROM credit_card_settings ccs
        JOIN accounts a ON ccs.account_id = a.id
        LEFT JOIN accounts sa ON ccs.settlement_account_id = sa.id
        ORDER BY a.name
        "#,
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch credit cards: {}", e))?;

    let mut results = Vec::new();

    for row in rows.iter() {
        let settings = row_to_settings(row);
        let account_name: String = row.get("account_name");
        let settlement_account_name: Option<String> = row.get("settlement_account_name");

        let balances = calculate_card_balances(pool.inner(), &settings).await?;

        results.push(CreditCardWithDetails {
            account_name,
            settlement_account_name,
            total_balance: balances.total_balance,
            outstanding_balance: balances.outstanding_balance,
            available_credit: balances.available_credit,
            current_cycle_charges: balances.current_cycle_charges,
            current_cycle_payments: balances.current_cycle_payments,
            utilization_percentage: balances.utilization_percentage,
            settings,
        });
    }

    Ok(results)
}

#[tauri::command]
pub async fn get_credit_card_details(
    pool: State<'_, SqlitePool>,
    settings_id: i64,
) -> Result<CreditCardWithDetails, String> {
    let row = sqlx::query(
        r#"
        SELECT ccs.id, ccs.account_id, ccs.credit_limit, ccs.statement_day,
               ccs.payment_due_day, ccs.minimum_payment_percentage,
               ccs.auto_settlement_enabled, ccs.settlement_account_id,
               ccs.created_at, ccs.updated_at,
               a.name as account_name,
               sa.name as settlement_account_name
        FROM credit_card_settings ccs
        JOIN accounts a ON ccs.account_id = a.id
        LEFT JOIN accounts sa ON ccs.settlement_account_id = sa.id
        WHERE ccs.id = ?
        "#,
    )
    .bind(settings_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Credit card not found".to_string())?;

    let settings = row_to_settings(&row);
    let account_name: String = row.get("account_name");
    let settlement_account_name: Option<String> = row.get("settlement_account_name");

    let balances = calculate_card_balances(pool.inner(), &settings).await?;

    Ok(CreditCardWithDetails {
        account_name,
        settlement_account_name,
        total_balance: balances.total_balance,
        outstanding_balance: balances.outstanding_balance,
        available_credit: balances.available_credit,
        current_cycle_charges: balances.current_cycle_charges,
        current_cycle_payments: balances.current_cycle_payments,
        utilization_percentage: balances.utilization_percentage,
        settings,
    })
}

// ======================== BILLING CYCLE ========================

/// Get the current billing cycle date range for a credit card
#[tauri::command]
pub async fn get_current_billing_cycle(
    pool: State<'_, SqlitePool>,
    settings_id: i64,
) -> Result<BillingCycleInfo, String> {
    let settings = get_credit_card_settings_by_id(pool.clone(), settings_id).await?;
    let today = Local::now().date_naive();
    let (cycle_start, cycle_end) = compute_current_cycle_dates(today, settings.statement_day);
    let due_date = compute_due_date(cycle_end, settings.payment_due_day);

    Ok(BillingCycleInfo {
        cycle_start_date: cycle_start.format("%Y-%m-%d").to_string(),
        cycle_end_date: cycle_end.format("%Y-%m-%d").to_string(),
        due_date: due_date.format("%Y-%m-%d").to_string(),
        days_remaining: (cycle_end - today).num_days().max(0),
    })
}

/// Extra response struct for billing cycle info
#[derive(Debug, serde::Serialize)]
pub struct BillingCycleInfo {
    pub cycle_start_date: String,
    pub cycle_end_date: String,
    pub due_date: String,
    pub days_remaining: i64,
}

/// Get transactions within the current billing cycle
#[tauri::command]
pub async fn get_current_cycle_transactions(
    pool: State<'_, SqlitePool>,
    settings_id: i64,
) -> Result<Vec<StatementTransaction>, String> {
    let settings = get_credit_card_settings_by_id(pool.clone(), settings_id).await?;
    let today = Local::now().date_naive();
    let (cycle_start, cycle_end) = compute_current_cycle_dates(today, settings.statement_day);

    let rows = sqlx::query(
        r#"
        SELECT t.id, t.date, t.type, t.amount, c.name as category_name, t.memo
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE (t.account_id = ? OR t.to_account_id = ?)
          AND t.date >= ? AND t.date <= ?
        ORDER BY t.date DESC, t.id DESC
        "#,
    )
    .bind(settings.account_id)
    .bind(settings.account_id)
    .bind(cycle_start.format("%Y-%m-%d").to_string())
    .bind(cycle_end.format("%Y-%m-%d").to_string())
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch cycle transactions: {}", e))?;

    Ok(rows
        .iter()
        .map(|row| StatementTransaction {
            id: row.get("id"),
            date: row.get("date"),
            transaction_type: row.get("type"),
            amount: row.get("amount"),
            category_name: row.get("category_name"),
            memo: row.get("memo"),
        })
        .collect())
}

// ======================== STATEMENTS ========================

/// Close the current billing cycle and generate a statement
#[tauri::command]
pub async fn generate_statement(
    pool: State<'_, SqlitePool>,
    settings_id: i64,
) -> Result<CreditCardStatement, String> {
    let settings = get_credit_card_settings_by_id(pool.clone(), settings_id).await?;
    let today = Local::now().date_naive();
    let (cycle_start, cycle_end) = compute_current_cycle_dates(today, settings.statement_day);

    // Check if statement already exists for this cycle
    let existing = sqlx::query(
        r#"
        SELECT id FROM credit_card_statements
        WHERE credit_card_id = ? AND cycle_start_date = ? AND cycle_end_date = ?
        "#,
    )
    .bind(settings_id)
    .bind(cycle_start.format("%Y-%m-%d").to_string())
    .bind(cycle_end.format("%Y-%m-%d").to_string())
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    if existing.is_some() {
        return Err("Statement already exists for this billing cycle".to_string());
    }

    // Calculate charges (expenses on this card) during cycle
    let charges_row = sqlx::query(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE account_id = ? AND type = 'EXPENSE'
          AND date >= ? AND date <= ?
        "#,
    )
    .bind(settings.account_id)
    .bind(cycle_start.format("%Y-%m-%d").to_string())
    .bind(cycle_end.format("%Y-%m-%d").to_string())
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to calculate charges: {}", e))?;
    let total_charges: f64 = charges_row.get("total");

    // Calculate payments (transfers TO this card) during cycle
    let payments_row = sqlx::query(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE to_account_id = ? AND type = 'TRANSFER'
          AND date >= ? AND date <= ?
        "#,
    )
    .bind(settings.account_id)
    .bind(cycle_start.format("%Y-%m-%d").to_string())
    .bind(cycle_end.format("%Y-%m-%d").to_string())
    .fetch_one(pool.inner())
    .await
    .map_err(|e| format!("Failed to calculate payments: {}", e))?;
    let total_payments: f64 = payments_row.get("total");

    // Get opening balance from previous statement's closing balance, or calculate from account
    let prev_statement = sqlx::query(
        r#"
        SELECT closing_balance FROM credit_card_statements
        WHERE credit_card_id = ?
        ORDER BY cycle_end_date DESC
        LIMIT 1
        "#,
    )
    .bind(settings_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let opening_balance: f64 = match prev_statement {
        Some(row) => row.get("closing_balance"),
        None => {
            // First statement - calculate from all transactions before this cycle
            calculate_balance_before_date(pool.inner(), settings.account_id, &cycle_start).await?
        }
    };

    // closing_balance = opening_balance + charges - payments
    // For LIABILITY accounts: positive balance = money owed
    let closing_balance = opening_balance + total_charges - total_payments;
    let minimum_payment =
        (closing_balance * settings.minimum_payment_percentage / 100.0 * 100.0).round() / 100.0;

    let due_date = compute_due_date(cycle_end, settings.payment_due_day);

    let result = sqlx::query(
        r#"
        INSERT INTO credit_card_statements (
            credit_card_id, statement_date, due_date, cycle_start_date, cycle_end_date,
            opening_balance, total_charges, total_payments, closing_balance, minimum_payment
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        "#,
    )
    .bind(settings_id)
    .bind(cycle_end.format("%Y-%m-%d").to_string())
    .bind(due_date.format("%Y-%m-%d").to_string())
    .bind(cycle_start.format("%Y-%m-%d").to_string())
    .bind(cycle_end.format("%Y-%m-%d").to_string())
    .bind(opening_balance)
    .bind(total_charges)
    .bind(total_payments)
    .bind(closing_balance)
    .bind(minimum_payment.max(0.0))
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to create statement: {}", e))?;

    let statement_id = result.last_insert_rowid();
    get_statement_by_id(pool.inner(), statement_id).await
}

#[tauri::command]
pub async fn get_statements(
    pool: State<'_, SqlitePool>,
    settings_id: i64,
) -> Result<Vec<CreditCardStatement>, String> {
    let rows = sqlx::query(
        r#"
        SELECT id, credit_card_id, statement_date, due_date, cycle_start_date,
               cycle_end_date, opening_balance, total_charges, total_payments,
               closing_balance, minimum_payment, status, paid_amount, paid_date, created_at
        FROM credit_card_statements
        WHERE credit_card_id = ?
        ORDER BY cycle_end_date DESC
        "#,
    )
    .bind(settings_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch statements: {}", e))?;

    Ok(rows.iter().map(|row| row_to_statement(row)).collect())
}

#[tauri::command]
pub async fn get_statement_with_transactions(
    pool: State<'_, SqlitePool>,
    statement_id: i64,
) -> Result<StatementWithTransactions, String> {
    let statement = get_statement_by_id(pool.inner(), statement_id).await?;

    // Get the account_id for this credit card
    let cc_row = sqlx::query("SELECT account_id FROM credit_card_settings WHERE id = ?")
        .bind(statement.credit_card_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    let account_id: i64 = cc_row.get("account_id");

    let rows = sqlx::query(
        r#"
        SELECT t.id, t.date, t.type, t.amount, c.name as category_name, t.memo
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE (t.account_id = ? OR t.to_account_id = ?)
          AND t.date >= ? AND t.date <= ?
        ORDER BY t.date ASC, t.id ASC
        "#,
    )
    .bind(account_id)
    .bind(account_id)
    .bind(&statement.cycle_start_date)
    .bind(&statement.cycle_end_date)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch statement transactions: {}", e))?;

    let transactions = rows
        .iter()
        .map(|row| StatementTransaction {
            id: row.get("id"),
            date: row.get("date"),
            transaction_type: row.get("type"),
            amount: row.get("amount"),
            category_name: row.get("category_name"),
            memo: row.get("memo"),
        })
        .collect();

    Ok(StatementWithTransactions {
        statement,
        transactions,
    })
}

// ======================== SETTLEMENT / PAYMENT ========================

/// Generate a payment (Transfer) transaction from bank to credit card
#[tauri::command]
pub async fn settle_credit_card(
    pool: State<'_, SqlitePool>,
    input: SettlementInput,
) -> Result<i64, String> {
    let settings =
        get_credit_card_settings_by_id(pool.clone(), input.credit_card_settings_id).await?;

    // Validate payment account
    let payment_account_row = sqlx::query(
        r#"
        SELECT a.id, ag.type 
        FROM accounts a 
        JOIN account_groups ag ON a.group_id = ag.id 
        WHERE a.id = ?
        "#,
    )
    .bind(input.payment_account_id)
    .fetch_optional(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Payment account not found".to_string())?;

    let payment_type: String = payment_account_row.get("type");
    if payment_type != "ASSET" {
        return Err("Payment must come from an ASSET account (Bank/Cash/Savings)".to_string());
    }

    if input.payment_account_id == settings.account_id {
        return Err("Cannot pay credit card from itself".to_string());
    }

    // Determine payment amount
    let balances = calculate_card_balances(pool.inner(), &settings).await?;

    let payment_amount = match input.amount {
        Some(amt) => {
            if amt <= 0.0 {
                return Err("Payment amount must be greater than 0".to_string());
            }
            amt
        }
        None => {
            // Full balance payment
            if balances.total_balance <= 0.0 {
                return Err("No outstanding balance to pay".to_string());
            }
            balances.total_balance
        }
    };

    let date = input
        .date
        .unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());

    // Create a TRANSFER transaction: from payment_account → to credit_card
    let mut tx = pool
        .begin()
        .await
        .map_err(|e| format!("Transaction error: {}", e))?;

    let memo = format!("Credit card payment - {}", settings.account_id);

    let result = sqlx::query(
        r#"
        INSERT INTO transactions (date, type, amount, account_id, to_account_id, memo)
        VALUES (?, 'TRANSFER', ?, ?, ?, ?)
        "#,
    )
    .bind(&date)
    .bind(payment_amount)
    .bind(input.payment_account_id) // from bank
    .bind(settings.account_id) // to credit card
    .bind(&memo)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to create payment transaction: {}", e))?;

    let transaction_id = result.last_insert_rowid();

    // Journal: Credit the payment account (decrease asset)
    sqlx::query(
        "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, 0, ?)",
    )
    .bind(transaction_id)
    .bind(input.payment_account_id)
    .bind(payment_amount)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to create journal entry: {}", e))?;

    // Journal: Debit the credit card account (decrease liability)
    sqlx::query(
        "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?, ?, ?, 0)",
    )
    .bind(transaction_id)
    .bind(settings.account_id)
    .bind(payment_amount)
    .execute(&mut *tx)
    .await
    .map_err(|e| format!("Failed to create journal entry: {}", e))?;

    tx.commit()
        .await
        .map_err(|e| format!("Failed to commit: {}", e))?;

    // Update any OPEN/CLOSED statements that match - mark as PAID/PARTIAL
    update_statement_payment_status(
        pool.inner(),
        input.credit_card_settings_id,
        payment_amount,
        &date,
    )
    .await?;

    Ok(transaction_id)
}

// ======================== DASHBOARD SUMMARY ========================

#[tauri::command]
pub async fn get_credit_card_summaries(
    pool: State<'_, SqlitePool>,
) -> Result<Vec<CreditCardSummary>, String> {
    let rows = sqlx::query(
        r#"
        SELECT ccs.id, ccs.account_id, ccs.credit_limit, ccs.statement_day,
               ccs.payment_due_day, ccs.minimum_payment_percentage,
               ccs.auto_settlement_enabled, ccs.settlement_account_id,
               ccs.created_at, ccs.updated_at,
               a.name as account_name
        FROM credit_card_settings ccs
        JOIN accounts a ON ccs.account_id = a.id
        ORDER BY a.name
        "#,
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch credit card summaries: {}", e))?;

    let mut summaries = Vec::new();

    for row in rows.iter() {
        let settings = row_to_settings(row);
        let account_name: String = row.get("account_name");
        let balances = calculate_card_balances(pool.inner(), &settings).await?;

        // Find next due date from open statements
        let next_due_row = sqlx::query(
            r#"
            SELECT due_date, closing_balance - paid_amount as remaining
            FROM credit_card_statements
            WHERE credit_card_id = ? AND status IN ('OPEN', 'CLOSED', 'PARTIAL')
            ORDER BY due_date ASC
            LIMIT 1
            "#,
        )
        .bind(settings.id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;

        let (next_due_date, next_due_amount) = match next_due_row {
            Some(r) => (
                Some(r.get::<String, _>("due_date")),
                Some(r.get::<f64, _>("remaining")),
            ),
            None => (None, None),
        };

        summaries.push(CreditCardSummary {
            account_id: settings.account_id,
            account_name,
            total_balance: balances.total_balance,
            credit_limit: settings.credit_limit,
            available_credit: balances.available_credit,
            next_due_date,
            next_due_amount,
            utilization_percentage: balances.utilization_percentage,
        });
    }

    Ok(summaries)
}

// ======================== PROCESS AUTO-SETTLEMENTS ========================

/// Called on app startup or periodically to auto-settle cards with auto_settlement_enabled
#[tauri::command]
pub async fn process_auto_settlements(pool: State<'_, SqlitePool>) -> Result<Vec<i64>, String> {
    let today = Local::now().date_naive();

    let rows = sqlx::query(
        r#"
        SELECT id, account_id, payment_due_day, settlement_account_id
        FROM credit_card_settings
        WHERE auto_settlement_enabled = 1 AND settlement_account_id IS NOT NULL
        "#,
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Failed to fetch auto-settlement cards: {}", e))?;

    let mut settled_ids = Vec::new();

    for row in rows.iter() {
        let settings_id: i64 = row.get("id");
        let payment_due_day: i32 = row.get("payment_due_day");
        let settlement_account_id: i64 = row.get("settlement_account_id");

        // Only settle on the payment due day
        if today.day() as i32 != payment_due_day {
            continue;
        }

        // Check if already settled today
        let already_settled = sqlx::query(
            r#"
            SELECT id FROM transactions
            WHERE type = 'TRANSFER'
              AND to_account_id = (SELECT account_id FROM credit_card_settings WHERE id = ?)
              AND account_id = ?
              AND date = ?
              AND memo LIKE 'Auto-settlement%'
            "#,
        )
        .bind(settings_id)
        .bind(settlement_account_id)
        .bind(today.format("%Y-%m-%d").to_string())
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;

        if already_settled.is_some() {
            continue;
        }

        // Get the latest unpaid statement
        let statement_row = sqlx::query(
            r#"
            SELECT closing_balance - paid_amount as remaining
            FROM credit_card_statements
            WHERE credit_card_id = ? AND status IN ('OPEN', 'CLOSED')
            ORDER BY due_date ASC
            LIMIT 1
            "#,
        )
        .bind(settings_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;

        if let Some(stmt_row) = statement_row {
            let remaining: f64 = stmt_row.get("remaining");
            if remaining > 0.0 {
                let input = SettlementInput {
                    credit_card_settings_id: settings_id,
                    payment_account_id: settlement_account_id,
                    amount: Some(remaining),
                    date: Some(today.format("%Y-%m-%d").to_string()),
                };

                match settle_credit_card(pool.clone(), input).await {
                    Ok(tx_id) => settled_ids.push(tx_id),
                    Err(e) => {
                        log::warn!("Auto-settlement failed for card {}: {}", settings_id, e);
                    }
                }
            }
        }
    }

    Ok(settled_ids)
}

// ======================== HELPER FUNCTIONS ========================

fn row_to_settings(row: &sqlx::sqlite::SqliteRow) -> CreditCardSettings {
    let auto_settlement_int: i32 = row.get("auto_settlement_enabled");
    CreditCardSettings {
        id: row.get("id"),
        account_id: row.get("account_id"),
        credit_limit: row.get("credit_limit"),
        statement_day: row.get("statement_day"),
        payment_due_day: row.get("payment_due_day"),
        minimum_payment_percentage: row.get("minimum_payment_percentage"),
        auto_settlement_enabled: auto_settlement_int != 0,
        settlement_account_id: row.get("settlement_account_id"),
        created_at: row.get("created_at"),
        updated_at: row.get("updated_at"),
    }
}

fn row_to_statement(row: &sqlx::sqlite::SqliteRow) -> CreditCardStatement {
    CreditCardStatement {
        id: row.get("id"),
        credit_card_id: row.get("credit_card_id"),
        statement_date: row.get("statement_date"),
        due_date: row.get("due_date"),
        cycle_start_date: row.get("cycle_start_date"),
        cycle_end_date: row.get("cycle_end_date"),
        opening_balance: row.get("opening_balance"),
        total_charges: row.get("total_charges"),
        total_payments: row.get("total_payments"),
        closing_balance: row.get("closing_balance"),
        minimum_payment: row.get("minimum_payment"),
        status: row.get("status"),
        paid_amount: row.get("paid_amount"),
        paid_date: row.get("paid_date"),
        created_at: row.get("created_at"),
    }
}

async fn get_statement_by_id(
    pool: &SqlitePool,
    statement_id: i64,
) -> Result<CreditCardStatement, String> {
    let row = sqlx::query(
        r#"
        SELECT id, credit_card_id, statement_date, due_date, cycle_start_date,
               cycle_end_date, opening_balance, total_charges, total_payments,
               closing_balance, minimum_payment, status, paid_amount, paid_date, created_at
        FROM credit_card_statements
        WHERE id = ?
        "#,
    )
    .bind(statement_id)
    .fetch_optional(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?
    .ok_or_else(|| "Statement not found".to_string())?;

    Ok(row_to_statement(&row))
}

struct CardBalances {
    total_balance: f64,
    outstanding_balance: f64,
    available_credit: f64,
    current_cycle_charges: f64,
    current_cycle_payments: f64,
    utilization_percentage: f64,
}

/// Calculate all balance figures for a credit card.
///
/// For LIABILITY accounts, the journal balance is negative when money is owed.
/// total_balance = -(initial_balance + journal_balance) → positive number = amount owed
async fn calculate_card_balances(
    pool: &SqlitePool,
    settings: &CreditCardSettings,
) -> Result<CardBalances, String> {
    // Get account initial balance
    let account_row = sqlx::query("SELECT initial_balance FROM accounts WHERE id = ?")
        .bind(settings.account_id)
        .fetch_one(pool)
        .await
        .map_err(|e| format!("Database error: {}", e))?;
    let initial_balance: f64 = account_row.get("initial_balance");

    // Get journal balance (debits - credits)
    let balance_row = sqlx::query(
        r#"
        SELECT CAST(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS REAL) as balance
        FROM journal_entries WHERE account_id = ?
        "#,
    )
    .bind(settings.account_id)
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to calculate balance: {}", e))?;
    let journal_balance: f64 = balance_row.get("balance");

    // For LIABILITY: balance goes more negative as debt increases
    // total_balance (positive) = amount owed = -(initial_balance + journal_balance)
    let raw_balance = initial_balance + journal_balance;
    let total_balance = -raw_balance; // Flip sign so positive = owed

    // Current cycle calculations
    let today = Local::now().date_naive();
    let (cycle_start, _cycle_end) = compute_current_cycle_dates(today, settings.statement_day);

    let charges_row = sqlx::query(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE account_id = ? AND type = 'EXPENSE'
          AND date >= ?
        "#,
    )
    .bind(settings.account_id)
    .bind(cycle_start.format("%Y-%m-%d").to_string())
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to calculate cycle charges: {}", e))?;
    let current_cycle_charges: f64 = charges_row.get("total");

    let payments_row = sqlx::query(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE to_account_id = ? AND type = 'TRANSFER'
          AND date >= ?
        "#,
    )
    .bind(settings.account_id)
    .bind(cycle_start.format("%Y-%m-%d").to_string())
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Failed to calculate cycle payments: {}", e))?;
    let current_cycle_payments: f64 = payments_row.get("total");

    let outstanding_balance = current_cycle_charges - current_cycle_payments;
    let available_credit = if settings.credit_limit > 0.0 {
        (settings.credit_limit - total_balance).max(0.0)
    } else {
        0.0
    };
    let utilization_percentage = if settings.credit_limit > 0.0 {
        ((total_balance / settings.credit_limit) * 100.0 * 100.0).round() / 100.0
    } else {
        0.0
    };

    Ok(CardBalances {
        total_balance: total_balance.max(0.0),
        outstanding_balance: outstanding_balance.max(0.0),
        available_credit,
        current_cycle_charges,
        current_cycle_payments,
        utilization_percentage,
    })
}

/// Calculate the total balance for a card before a given date (for opening balance of first statement)
async fn calculate_balance_before_date(
    pool: &SqlitePool,
    account_id: i64,
    before_date: &NaiveDate,
) -> Result<f64, String> {
    // Expenses on card before date
    let charges_row = sqlx::query(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE account_id = ? AND type = 'EXPENSE' AND date < ?
        "#,
    )
    .bind(account_id)
    .bind(before_date.format("%Y-%m-%d").to_string())
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    let charges: f64 = charges_row.get("total");

    // Payments to card before date
    let payments_row = sqlx::query(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE to_account_id = ? AND type = 'TRANSFER' AND date < ?
        "#,
    )
    .bind(account_id)
    .bind(before_date.format("%Y-%m-%d").to_string())
    .fetch_one(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;
    let payments: f64 = payments_row.get("total");

    Ok((charges - payments).max(0.0))
}

/// Compute the current billing cycle start and end dates
fn compute_current_cycle_dates(today: NaiveDate, statement_day: i32) -> (NaiveDate, NaiveDate) {
    let current_day = today.day() as i32;

    if current_day <= statement_day {
        // We're before statement day → cycle started last month
        let cycle_end = make_date(today.year(), today.month(), statement_day);
        let prev_month = if today.month() == 1 {
            NaiveDate::from_ymd_opt(today.year() - 1, 12, statement_day as u32)
        } else {
            NaiveDate::from_ymd_opt(today.year(), today.month() - 1, statement_day as u32)
        };
        let cycle_start = prev_month
            .map(|d| d + chrono::Duration::days(1))
            .unwrap_or(today);
        (cycle_start, cycle_end)
    } else {
        // We're after statement day → cycle started this month
        let cycle_start =
            make_date(today.year(), today.month(), statement_day) + chrono::Duration::days(1);
        let next_month = if today.month() == 12 {
            NaiveDate::from_ymd_opt(today.year() + 1, 1, statement_day as u32)
        } else {
            NaiveDate::from_ymd_opt(today.year(), today.month() + 1, statement_day as u32)
        };
        let cycle_end = next_month.unwrap_or(today);
        (cycle_start, cycle_end)
    }
}

/// Compute payment due date based on statement end date and payment_due_day
fn compute_due_date(statement_date: NaiveDate, payment_due_day: i32) -> NaiveDate {
    // Due date is always in the month AFTER the statement date
    let next_month = if statement_date.month() == 12 {
        NaiveDate::from_ymd_opt(statement_date.year() + 1, 1, payment_due_day as u32)
    } else {
        NaiveDate::from_ymd_opt(
            statement_date.year(),
            statement_date.month() + 1,
            payment_due_day as u32,
        )
    };

    next_month.unwrap_or(statement_date + chrono::Duration::days(30))
}

fn make_date(year: i32, month: u32, day: i32) -> NaiveDate {
    NaiveDate::from_ymd_opt(year, month, day as u32).unwrap_or_else(|| {
        NaiveDate::from_ymd_opt(year, month, 28).expect("Day 28 should always be valid")
    })
}

/// After a payment, update statement statuses
async fn update_statement_payment_status(
    pool: &SqlitePool,
    settings_id: i64,
    payment_amount: f64,
    paid_date: &str,
) -> Result<(), String> {
    // Get open/closed statements ordered by due date (pay oldest first)
    let statements = sqlx::query(
        r#"
        SELECT id, closing_balance, paid_amount
        FROM credit_card_statements
        WHERE credit_card_id = ? AND status IN ('OPEN', 'CLOSED', 'PARTIAL')
        ORDER BY due_date ASC
        "#,
    )
    .bind(settings_id)
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let mut remaining_payment = payment_amount;

    for stmt in statements.iter() {
        if remaining_payment <= 0.0 {
            break;
        }

        let stmt_id: i64 = stmt.get("id");
        let closing_balance: f64 = stmt.get("closing_balance");
        let already_paid: f64 = stmt.get("paid_amount");
        let stmt_remaining = closing_balance - already_paid;

        if stmt_remaining <= 0.0 {
            continue;
        }

        let apply_amount = remaining_payment.min(stmt_remaining);
        let new_paid = already_paid + apply_amount;
        remaining_payment -= apply_amount;

        let new_status = if (new_paid - closing_balance).abs() < 0.01 {
            "PAID"
        } else {
            "PARTIAL"
        };

        sqlx::query(
            r#"
            UPDATE credit_card_statements
            SET paid_amount = ?, status = ?, paid_date = ?
            WHERE id = ?
            "#,
        )
        .bind(new_paid)
        .bind(new_status)
        .bind(paid_date)
        .bind(stmt_id)
        .execute(pool)
        .await
        .map_err(|e| format!("Failed to update statement status: {}", e))?;
    }

    Ok(())
}
