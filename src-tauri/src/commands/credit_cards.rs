// File: src-tauri/src/commands/credit_cards.rs
use crate::models::credit_card::{
    CreateCreditCardSettingsInput, CreditCardSettings, CreditCardStatement, CreditCardSummary,
    CreditCardWithDetails, SettlementInput, StatementTransaction, StatementWithTransactions,
    UpdateCreditCardSettingsInput,
};
use crate::AppState;
use chrono::{Datelike, Local, NaiveDate};
use rusqlite::{params, OptionalExtension};
use tauri::State;

// ======================== CRUD ========================

#[tauri::command]
pub fn create_credit_card_settings(
    state: State<'_, AppState>,
    input: CreateCreditCardSettingsInput,
) -> Result<CreditCardSettings, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Validate account exists and belongs to Credit Card group (LIABILITY)
    let account_type: Option<String> = conn.query_row(
        r#"
        SELECT ag.type 
        FROM accounts a 
        JOIN account_groups ag ON a.group_id = ag.id 
        WHERE a.id = ?1
        "#,
        params![input.account_id],
        |row| row.get(0),
    ).optional().map_err(|e| format!("Database error: {}", e))?.flatten();

    match account_type {
        Some(t) if t == "LIABILITY" => {}
        Some(_) => return Err("Credit card settings can only be created for LIABILITY accounts (Credit Card group)".to_string()),
        None => return Err("Account not found".to_string()),
    }

    // Check if settings already exist for this account
    let existing: bool = conn.query_row(
        "SELECT COUNT(id) FROM credit_card_settings WHERE account_id = ?1",
        params![input.account_id],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if existing {
        return Err("Credit card settings already exist for this account. Use update instead.".to_string());
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
        let settlement_type: Option<String> = conn.query_row(
            r#"
            SELECT ag.type 
            FROM accounts a 
            JOIN account_groups ag ON a.group_id = ag.id 
            WHERE a.id = ?1
            "#,
            params![settlement_id],
            |row| row.get(0),
        ).optional().map_err(|e| format!("Database error: {}", e))?.flatten();

        match settlement_type {
            Some(t) if t == "ASSET" => {}
            Some(_) => return Err("Settlement account must be an ASSET account (Bank/Cash/Savings)".to_string()),
            None => return Err("Settlement account not found".to_string()),
        }

        if settlement_id == input.account_id {
            return Err("Settlement account cannot be the credit card itself".to_string());
        }
    }

    let min_payment_pct = input.minimum_payment_percentage.unwrap_or(5.0);
    let auto_settlement = input.auto_settlement_enabled.unwrap_or(false);

    conn.execute(
        r#"
        INSERT INTO credit_card_settings (
            account_id, credit_limit, statement_day, payment_due_day,
            minimum_payment_percentage, auto_settlement_enabled, settlement_account_id
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        params![
            input.account_id,
            input.credit_limit,
            input.statement_day,
            input.payment_due_day,
            min_payment_pct,
            auto_settlement as i32,
            input.settlement_account_id
        ],
    ).map_err(|e| format!("Failed to create credit card settings: {}", e))?;

    let settings_id = conn.last_insert_rowid();
    get_credit_card_settings_by_id_internal(&conn, settings_id)
}

#[tauri::command]
pub fn update_credit_card_settings(
    state: State<'_, AppState>,
    input: UpdateCreditCardSettingsInput,
) -> Result<CreditCardSettings, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let exists: bool = conn.query_row(
        "SELECT COUNT(id) FROM credit_card_settings WHERE id = ?1",
        params![input.id],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

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
        let settlement_type: Option<String> = conn.query_row(
            r#"
            SELECT ag.type 
            FROM accounts a 
            JOIN account_groups ag ON a.group_id = ag.id 
            WHERE a.id = ?1
            "#,
            params![settlement_id],
            |row| row.get(0),
        ).optional().map_err(|e| format!("Database error: {}", e))?.flatten();

        match settlement_type {
            Some(t) if t == "ASSET" => {}
            Some(_) => return Err("Settlement account must be an ASSET account".to_string()),
            None => return Err("Settlement account not found".to_string()),
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

    conn.execute(&query, [])
        .map_err(|e| format!("Failed to update credit card settings: {}", e))?;

    get_credit_card_settings_by_id_internal(&conn, input.id)
}

#[tauri::command]
pub fn delete_credit_card_settings(
    state: State<'_, AppState>,
    settings_id: i64,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Check for existing statements
    let count: i64 = conn.query_row(
        "SELECT COUNT(*) FROM credit_card_statements WHERE credit_card_id = ?1",
        params![settings_id],
        |row| row.get(0),
    ).map_err(|e| format!("Database error: {}", e))?;

    if count > 0 {
        return Err(
            "Cannot delete credit card settings with existing statements. Delete statements first."
                .to_string(),
        );
    }

    let rows_affected = conn.execute("DELETE FROM credit_card_settings WHERE id = ?1", params![settings_id])
        .map_err(|e| format!("Failed to delete credit card settings: {}", e))?;

    if rows_affected == 0 {
        return Err("Credit card settings not found".to_string());
    }

    Ok(())
}

// ======================== QUERIES ========================

fn get_credit_card_settings_by_id_internal(
    conn: &rusqlite::Connection,
    settings_id: i64,
) -> Result<CreditCardSettings, String> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, account_id, credit_limit, statement_day, payment_due_day,
               minimum_payment_percentage, auto_settlement_enabled,
               settlement_account_id, created_at, updated_at
        FROM credit_card_settings
        WHERE id = ?1
        "#,
    ).map_err(|e| format!("Database error: {}", e))?;

    stmt.query_row(params![settings_id], |row| Ok(row_to_settings(row)))
        .map_err(|_| "Credit card settings not found".to_string())
}

#[tauri::command]
pub fn get_credit_card_settings_by_account(
    state: State<'_, AppState>,
    account_id: i64,
) -> Result<Option<CreditCardSettings>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
        r#"
        SELECT id, account_id, credit_limit, statement_day, payment_due_day,
               minimum_payment_percentage, auto_settlement_enabled,
               settlement_account_id, created_at, updated_at
        FROM credit_card_settings
        WHERE account_id = ?1
        "#,
    ).map_err(|e| format!("Database error: {}", e))?;

    let result = stmt.query_row(params![account_id], |row| Ok(row_to_settings(row))).optional().map_err(|e| format!("Database error: {}", e))?;
    Ok(result)
}

#[tauri::command]
pub fn get_all_credit_cards(
    state: State<'_, AppState>,
) -> Result<Vec<CreditCardWithDetails>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
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
    ).map_err(|e| format!("Database error: {}", e))?;

    let cards_data: Vec<(CreditCardSettings, String, Option<String>)> = stmt.query_map([], |row| {
        Ok((
            row_to_settings(row),
            row.get(10)?,
            row.get(11)?,
        ))
    }).unwrap().filter_map(Result::ok).collect();

    let mut results = Vec::new();

    for (settings, account_name, settlement_account_name) in cards_data {
        let balances = calculate_card_balances(&conn, &settings)?;

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
pub fn get_credit_card_details(
    state: State<'_, AppState>,
    settings_id: i64,
) -> Result<CreditCardWithDetails, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
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
        WHERE ccs.id = ?1
        "#,
    ).map_err(|e| format!("Database error: {}", e))?;

    let (settings, account_name, settlement_account_name) = stmt.query_row(params![settings_id], |row| {
        Ok((
            row_to_settings(row),
            row.get::<_, String>(10)?,
            row.get::<_, Option<String>>(11)?,
        ))
    }).map_err(|_| "Credit card not found".to_string())?;

    let balances = calculate_card_balances(&conn, &settings)?;

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

#[tauri::command]
pub fn get_current_billing_cycle(
    state: State<'_, AppState>,
    settings_id: i64,
) -> Result<BillingCycleInfo, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let settings = get_credit_card_settings_by_id_internal(&conn, settings_id)?;
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

#[derive(Debug, serde::Serialize)]
pub struct BillingCycleInfo {
    pub cycle_start_date: String,
    pub cycle_end_date: String,
    pub due_date: String,
    pub days_remaining: i64,
}

#[tauri::command]
pub fn get_current_cycle_transactions(
    state: State<'_, AppState>,
    settings_id: i64,
) -> Result<Vec<StatementTransaction>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let settings = get_credit_card_settings_by_id_internal(&conn, settings_id)?;
    let today = Local::now().date_naive();
    let (cycle_start, cycle_end) = compute_current_cycle_dates(today, settings.statement_day);

    let mut stmt = conn.prepare(
        r#"
        SELECT t.id, t.date, t.type, t.amount, c.name as category_name, t.memo
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE (t.account_id = ?1 OR t.to_account_id = ?2)
          AND t.date >= ?3 AND t.date <= ?4
        ORDER BY t.date DESC, t.id DESC
        "#,
    ).map_err(|e| format!("Query error: {}", e))?;

    let transactions = stmt.query_map(
        params![
            settings.account_id,
            settings.account_id,
            cycle_start.format("%Y-%m-%d").to_string(),
            cycle_end.format("%Y-%m-%d").to_string()
        ],
        |row| {
            Ok(StatementTransaction {
                id: row.get(0)?,
                date: row.get(1)?,
                transaction_type: row.get(2)?,
                amount: row.get(3)?,
                category_name: row.get(4)?,
                memo: row.get(5)?,
            })
        }
    ).unwrap().filter_map(Result::ok).collect();

    Ok(transactions)
}

// ======================== STATEMENTS ========================

#[tauri::command]
pub fn generate_statement(
    state: State<'_, AppState>,
    settings_id: i64,
) -> Result<CreditCardStatement, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let settings = get_credit_card_settings_by_id_internal(&conn, settings_id)?;
    let today = Local::now().date_naive();
    let (cycle_start, cycle_end) = compute_current_cycle_dates(today, settings.statement_day);

    // Check if statement already exists
    let existing: bool = conn.query_row(
        r#"
        SELECT COUNT(id) FROM credit_card_statements
        WHERE credit_card_id = ?1 AND cycle_start_date = ?2 AND cycle_end_date = ?3
        "#,
        params![
            settings_id,
            cycle_start.format("%Y-%m-%d").to_string(),
            cycle_end.format("%Y-%m-%d").to_string()
        ],
        |row| row.get::<_, i64>(0),
    ).unwrap_or(0) > 0;

    if existing {
        return Err("Statement already exists for this billing cycle".to_string());
    }

    // Calculate charges
    let total_charges: f64 = conn.query_row(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE account_id = ?1 AND type = 'EXPENSE'
          AND date >= ?2 AND date <= ?3
        "#,
        params![
            settings.account_id,
            cycle_start.format("%Y-%m-%d").to_string(),
            cycle_end.format("%Y-%m-%d").to_string()
        ],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Calculate payments
    let total_payments: f64 = conn.query_row(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE to_account_id = ?1 AND type = 'TRANSFER'
          AND date >= ?2 AND date <= ?3
        "#,
        params![
            settings.account_id,
            cycle_start.format("%Y-%m-%d").to_string(),
            cycle_end.format("%Y-%m-%d").to_string()
        ],
        |row| row.get(0),
    ).unwrap_or(0.0);

    // Get opening balance
    let prev_statement_balance: Option<f64> = conn.query_row(
        r#"
        SELECT closing_balance FROM credit_card_statements
        WHERE credit_card_id = ?1
        ORDER BY cycle_end_date DESC
        LIMIT 1
        "#,
        params![settings_id],
        |row| row.get(0),
    ).optional().map_err(|e| format!("Database error: {}", e))?.flatten();

    let opening_balance = match prev_statement_balance {
        Some(b) => b,
        None => calculate_balance_before_date(&conn, settings.account_id, &cycle_start)?,
    };

    let closing_balance = opening_balance + total_charges - total_payments;
    let minimum_payment =
        (closing_balance * settings.minimum_payment_percentage / 100.0 * 100.0).round() / 100.0;

    let due_date = compute_due_date(cycle_end, settings.payment_due_day);

    conn.execute(
        r#"
        INSERT INTO credit_card_statements (
            credit_card_id, statement_date, due_date, cycle_start_date, cycle_end_date,
            opening_balance, total_charges, total_payments, closing_balance, minimum_payment
        ) VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)
        "#,
        params![
            settings_id,
            cycle_end.format("%Y-%m-%d").to_string(),
            due_date.format("%Y-%m-%d").to_string(),
            cycle_start.format("%Y-%m-%d").to_string(),
            cycle_end.format("%Y-%m-%d").to_string(),
            opening_balance,
            total_charges,
            total_payments,
            closing_balance,
            minimum_payment.max(0.0)
        ],
    ).map_err(|e| format!("Failed to create statement: {}", e))?;

    let statement_id = conn.last_insert_rowid();
    get_statement_by_id(&conn, statement_id)
}

#[tauri::command]
pub fn get_statements(
    state: State<'_, AppState>,
    settings_id: i64,
) -> Result<Vec<CreditCardStatement>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
        r#"
        SELECT id, credit_card_id, statement_date, due_date, cycle_start_date,
               cycle_end_date, opening_balance, total_charges, total_payments,
               closing_balance, minimum_payment, status, paid_amount, paid_date, created_at
        FROM credit_card_statements
        WHERE credit_card_id = ?1
        ORDER BY cycle_end_date DESC
        "#,
    ).map_err(|e| format!("Database error: {}", e))?;

    let statements = stmt.query_map(params![settings_id], |row| Ok(row_to_statement(row)))
        .unwrap()
        .filter_map(Result::ok)
        .collect();

    Ok(statements)
}

#[tauri::command]
pub fn get_statement_with_transactions(
    state: State<'_, AppState>,
    statement_id: i64,
) -> Result<StatementWithTransactions, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let statement = get_statement_by_id(&conn, statement_id)?;

    // Get the account_id for this credit card
    let account_id: i64 = conn.query_row(
        "SELECT account_id FROM credit_card_settings WHERE id = ?1",
        params![statement.credit_card_id],
        |row| row.get(0),
    ).map_err(|e| format!("Database error: {}", e))?;

    let mut stmt = conn.prepare(
        r#"
        SELECT t.id, t.date, t.type, t.amount, c.name as category_name, t.memo
        FROM transactions t
        LEFT JOIN categories c ON t.category_id = c.id
        WHERE (t.account_id = ?1 OR t.to_account_id = ?2)
          AND t.date >= ?3 AND t.date <= ?4
        ORDER BY t.date ASC, t.id ASC
        "#,
    ).map_err(|e| format!("Query error: {}", e))?;

    let transactions = stmt.query_map(
        params![
            account_id,
            account_id,
            statement.cycle_start_date,
            statement.cycle_end_date
        ],
        |row| {
            Ok(StatementTransaction {
                id: row.get(0)?,
                date: row.get(1)?,
                transaction_type: row.get(2)?,
                amount: row.get(3)?,
                category_name: row.get(4)?,
                memo: row.get(5)?,
            })
        }
    ).unwrap().filter_map(Result::ok).collect();

    Ok(StatementWithTransactions {
        statement,
        transactions,
    })
}

// ======================== SETTLEMENT / PAYMENT ========================

#[tauri::command]
pub fn settle_credit_card(
    state: State<'_, AppState>,
    input: SettlementInput,
) -> Result<i64, String> {
    let pool = crate::get_db(&state)?;
    let mut conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let settings = get_credit_card_settings_by_id_internal(&conn, input.credit_card_settings_id)?;

    // Validate payment account
    let payment_type: Option<String> = conn.query_row(
        r#"
        SELECT ag.type 
        FROM accounts a 
        JOIN account_groups ag ON a.group_id = ag.id 
        WHERE a.id = ?1
        "#,
        params![input.payment_account_id],
        |row| row.get(0),
    ).optional().map_err(|e| format!("Database error: {}", e))?.flatten();

    match payment_type {
        Some(t) if t == "ASSET" => {}
        Some(_) => return Err("Payment must come from an ASSET account (Bank/Cash/Savings)".to_string()),
        None => return Err("Payment account not found".to_string()),
    }

    if input.payment_account_id == settings.account_id {
        return Err("Cannot pay credit card from itself".to_string());
    }

    let balances = calculate_card_balances(&conn, &settings)?;

    let payment_amount = match input.amount {
        Some(amt) => {
            if amt <= 0.0 {
                return Err("Payment amount must be greater than 0".to_string());
            }
            amt
        }
        None => {
            if balances.total_balance <= 0.0 {
                return Err("No outstanding balance to pay".to_string());
            }
            balances.total_balance
        }
    };

    let date = input
        .date
        .unwrap_or_else(|| Local::now().format("%Y-%m-%d").to_string());

    let tx = conn.transaction().map_err(|e| format!("Transaction error: {}", e))?;

    let memo = format!("Credit card payment - {}", settings.account_id);

    tx.execute(
        r#"
        INSERT INTO transactions (date, type, amount, account_id, to_account_id, memo)
        VALUES (?1, 'TRANSFER', ?2, ?3, ?4, ?5)
        "#,
        params![
            date,
            payment_amount,
            input.payment_account_id,
            settings.account_id,
            memo
        ],
    ).map_err(|e| format!("Failed to create payment transaction: {}", e))?;

    let transaction_id = tx.last_insert_rowid();

    tx.execute(
        "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?1, ?2, 0, ?3)",
        params![transaction_id, input.payment_account_id, payment_amount],
    ).map_err(|e| format!("Failed to create journal entry: {}", e))?;

    tx.execute(
        "INSERT INTO journal_entries (transaction_id, account_id, debit, credit) VALUES (?1, ?2, ?3, 0)",
        params![transaction_id, settings.account_id, payment_amount],
    ).map_err(|e| format!("Failed to create journal entry: {}", e))?;

    tx.commit().map_err(|e| format!("Failed to commit: {}", e))?;

    // Update statements after committing transaction
    update_statement_payment_status(
        &pool.lock().unwrap(),
        input.credit_card_settings_id,
        payment_amount,
        &date,
    )?;

    Ok(transaction_id)
}

// ======================== DASHBOARD SUMMARY ========================

#[tauri::command]
pub fn get_credit_card_summaries(
    state: State<'_, AppState>,
) -> Result<Vec<CreditCardSummary>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let mut stmt = conn.prepare(
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
    ).map_err(|e| format!("Database error: {}", e))?;

    let cards_data: Vec<(CreditCardSettings, String)> = stmt.query_map([], |row| {
        Ok((
            row_to_settings(row),
            row.get(10)?,
        ))
    }).unwrap().filter_map(Result::ok).collect();

    let mut summaries = Vec::new();

    for (settings, account_name) in cards_data {
        let balances = calculate_card_balances(&conn, &settings)?;

        let next_due_row: Option<(String, f64)> = conn.query_row(
            r#"
            SELECT due_date, closing_balance - paid_amount as remaining
            FROM credit_card_statements
            WHERE credit_card_id = ?1 AND status IN ('OPEN', 'CLOSED', 'PARTIAL')
            ORDER BY due_date ASC
            LIMIT 1
            "#,
            params![settings.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        ).optional().unwrap_or(None);

        let (next_due_date, next_due_amount) = match next_due_row {
            Some((d, a)) => (Some(d), Some(a)),
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

#[tauri::command]
pub fn process_auto_settlements(state: State<'_, AppState>) -> Result<Vec<i64>, String> {
    let pool = crate::get_db(&state)?;
    // We only need a short lock for queries since we use state.clone() in settle_credit_card
    let cards_to_settle: Vec<(i64, i64, i64)> = {
        let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
        let today = Local::now().date_naive();
        let mut stmt = conn.prepare(
            r#"
            SELECT id, payment_due_day, settlement_account_id
            FROM credit_card_settings
            WHERE auto_settlement_enabled = 1 AND settlement_account_id IS NOT NULL
            "#,
        ).unwrap();
        
        let mut to_process = Vec::new();
        
        for row_res in stmt.query_map([], |row| {
            Ok((
                row.get::<_, i64>(0)?,
                row.get::<_, i32>(1)?,
                row.get::<_, i64>(2)?,
            ))
        }).unwrap() {
            if let Ok((settings_id, payment_due_day, settlement_account_id)) = row_res {
                if today.day() as i32 != payment_due_day {
                    continue;
                }

                let already_settled: bool = conn.query_row(
                    r#"
                    SELECT COUNT(id) FROM transactions
                    WHERE type = 'TRANSFER'
                      AND to_account_id = (SELECT account_id FROM credit_card_settings WHERE id = ?1)
                      AND account_id = ?2
                      AND date = ?3
                      AND memo LIKE 'Auto-settlement%'
                    "#,
                    params![settings_id, settlement_account_id, today.format("%Y-%m-%d").to_string()],
                    |row| row.get::<_, i64>(0),
                ).unwrap_or(0) > 0;

                if already_settled {
                    continue;
                }

                let remaining: Option<f64> = conn.query_row(
                    r#"
                    SELECT closing_balance - paid_amount as remaining
                    FROM credit_card_statements
                    WHERE credit_card_id = ?1 AND status IN ('OPEN', 'CLOSED')
                    ORDER BY due_date ASC
                    LIMIT 1
                    "#,
                    params![settings_id],
                    |row| row.get(0),
                ).optional().unwrap_or(None).flatten();

                if let Some(amt) = remaining {
                    if amt > 0.0 {
                        to_process.push((settings_id, settlement_account_id, (amt * 100.0) as i64));
                    }
                }
            }
        }
        to_process
    };

    let mut settled_ids = Vec::new();
    let today = Local::now().date_naive();

    for (settings_id, settlement_account_id, amt_cents) in cards_to_settle {
        let input = SettlementInput {
            credit_card_settings_id: settings_id,
            payment_account_id: settlement_account_id,
            amount: Some((amt_cents as f64) / 100.0),
            date: Some(today.format("%Y-%m-%d").to_string()),
        };

        match settle_credit_card(state.clone(), input) {
            Ok(tx_id) => settled_ids.push(tx_id),
            Err(e) => {
                log::warn!("Auto-settlement failed for card {}: {}", settings_id, e);
            }
        }
    }

    Ok(settled_ids)
}

// ======================== HELPER FUNCTIONS ========================

fn row_to_settings(row: &rusqlite::Row) -> CreditCardSettings {
    let auto_settlement_int: i32 = row.get(6).unwrap_or(0);
    CreditCardSettings {
        id: row.get(0).unwrap_or_default(),
        account_id: row.get(1).unwrap_or_default(),
        credit_limit: row.get(2).unwrap_or_default(),
        statement_day: row.get(3).unwrap_or_default(),
        payment_due_day: row.get(4).unwrap_or_default(),
        minimum_payment_percentage: row.get(5).unwrap_or_default(),
        auto_settlement_enabled: auto_settlement_int != 0,
        settlement_account_id: row.get(7).unwrap_or_default(),
        created_at: row.get(8).unwrap_or_default(),
        updated_at: row.get(9).unwrap_or_default(),
    }
}

fn row_to_statement(row: &rusqlite::Row) -> CreditCardStatement {
    CreditCardStatement {
        id: row.get(0).unwrap_or_default(),
        credit_card_id: row.get(1).unwrap_or_default(),
        statement_date: row.get(2).unwrap_or_default(),
        due_date: row.get(3).unwrap_or_default(),
        cycle_start_date: row.get(4).unwrap_or_default(),
        cycle_end_date: row.get(5).unwrap_or_default(),
        opening_balance: row.get(6).unwrap_or_default(),
        total_charges: row.get(7).unwrap_or_default(),
        total_payments: row.get(8).unwrap_or_default(),
        closing_balance: row.get(9).unwrap_or_default(),
        minimum_payment: row.get(10).unwrap_or_default(),
        status: row.get(11).unwrap_or_default(),
        paid_amount: row.get(12).unwrap_or_default(),
        paid_date: row.get(13).unwrap_or_default(),
        created_at: row.get(14).unwrap_or_default(),
    }
}

fn get_statement_by_id(
    conn: &rusqlite::Connection,
    statement_id: i64,
) -> Result<CreditCardStatement, String> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, credit_card_id, statement_date, due_date, cycle_start_date,
               cycle_end_date, opening_balance, total_charges, total_payments,
               closing_balance, minimum_payment, status, paid_amount, paid_date, created_at
        FROM credit_card_statements
        WHERE id = ?1
        "#,
    ).map_err(|e| format!("Database error: {}", e))?;

    stmt.query_row(params![statement_id], |row| Ok(row_to_statement(row)))
        .map_err(|_| "Statement not found".to_string())
}

struct CardBalances {
    total_balance: f64,
    outstanding_balance: f64,
    available_credit: f64,
    current_cycle_charges: f64,
    current_cycle_payments: f64,
    utilization_percentage: f64,
}

fn calculate_card_balances(
    conn: &rusqlite::Connection,
    settings: &CreditCardSettings,
) -> Result<CardBalances, String> {
    let initial_balance: f64 = conn.query_row(
        "SELECT initial_balance FROM accounts WHERE id = ?1",
        params![settings.account_id],
        |row| row.get(0),
    ).map_err(|e| format!("Database error: {}", e))?;

    let journal_balance: f64 = conn.query_row(
        r#"
        SELECT CAST(COALESCE(SUM(debit), 0) - COALESCE(SUM(credit), 0) AS REAL) as balance
        FROM journal_entries WHERE account_id = ?1
        "#,
        params![settings.account_id],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let raw_balance = initial_balance + journal_balance;
    let total_balance = -raw_balance;

    let today = Local::now().date_naive();
    let (cycle_start, _cycle_end) = compute_current_cycle_dates(today, settings.statement_day);

    let current_cycle_charges: f64 = conn.query_row(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE account_id = ?1 AND type = 'EXPENSE'
          AND date >= ?2
        "#,
        params![settings.account_id, cycle_start.format("%Y-%m-%d").to_string()],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let current_cycle_payments: f64 = conn.query_row(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE to_account_id = ?1 AND type = 'TRANSFER'
          AND date >= ?2
        "#,
        params![settings.account_id, cycle_start.format("%Y-%m-%d").to_string()],
        |row| row.get(0),
    ).unwrap_or(0.0);

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

fn calculate_balance_before_date(
    conn: &rusqlite::Connection,
    account_id: i64,
    before_date: &NaiveDate,
) -> Result<f64, String> {
    let charges: f64 = conn.query_row(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE account_id = ?1 AND type = 'EXPENSE' AND date < ?2
        "#,
        params![account_id, before_date.format("%Y-%m-%d").to_string()],
        |row| row.get(0),
    ).unwrap_or(0.0);

    let payments: f64 = conn.query_row(
        r#"
        SELECT COALESCE(SUM(amount), 0.0) as total
        FROM transactions
        WHERE to_account_id = ?1 AND type = 'TRANSFER' AND date < ?2
        "#,
        params![account_id, before_date.format("%Y-%m-%d").to_string()],
        |row| row.get(0),
    ).unwrap_or(0.0);

    Ok((charges - payments).max(0.0))
}

fn compute_current_cycle_dates(today: NaiveDate, statement_day: i32) -> (NaiveDate, NaiveDate) {
    let current_day = today.day() as i32;

    if current_day <= statement_day {
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

fn compute_due_date(statement_date: NaiveDate, payment_due_day: i32) -> NaiveDate {
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

fn update_statement_payment_status(
    conn: &rusqlite::Connection,
    settings_id: i64,
    payment_amount: f64,
    paid_date: &str,
) -> Result<(), String> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, closing_balance, paid_amount
        FROM credit_card_statements
        WHERE credit_card_id = ?1 AND status IN ('OPEN', 'CLOSED', 'PARTIAL')
        ORDER BY due_date ASC
        "#,
    ).map_err(|e| format!("Database error: {}", e))?;

    let statements: Vec<(i64, f64, f64)> = stmt.query_map(params![settings_id], |row| {
        Ok((row.get(0)?, row.get(1)?, row.get(2)?))
    }).unwrap().filter_map(Result::ok).collect();

    let mut remaining_payment = payment_amount;

    for (stmt_id, closing_balance, already_paid) in statements {
        if remaining_payment <= 0.0 {
            break;
        }

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

        conn.execute(
            r#"
            UPDATE credit_card_statements
            SET paid_amount = ?1, status = ?2, paid_date = ?3
            WHERE id = ?4
            "#,
            params![new_paid, new_status, paid_date, stmt_id],
        ).map_err(|e| format!("Failed to update statement status: {}", e))?;
    }

    Ok(())
}
