// File: src-tauri/src/lib.rs
mod commands;
mod db;
mod models;

use db::DbPool;
use std::path::PathBuf;
use std::sync::{Arc, Mutex};
use tauri::{Emitter, Manager};

/// Application state managed by Tauri.
/// The database starts as `None` and is populated either immediately
/// (unencrypted) or after the user provides the master password (encrypted).
pub struct AppState {
    pub db: Arc<Mutex<Option<DbPool>>>,
    pub db_path: PathBuf,
    pub app_data_dir: PathBuf,
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_fs::init())
        .setup(|app| {
            let app_data_dir = app
                .path()
                .app_data_dir()
                .expect("Failed to get app data directory");

            if let Err(e) = std::fs::create_dir_all(&app_data_dir) {
                panic!("Failed to create app data directory: {}", e);
            }

            let db_path = app_data_dir.join("money_manager.db");
            println!("Database location: {}", db_path.display());

            // Check encryption config
            let encryption_config = db::encryption::read_config(&app_data_dir);

            let app_state = AppState {
                db: Arc::new(Mutex::new(None)),
                db_path: db_path.clone(),
                app_data_dir: app_data_dir.clone(),
            };

            // If not encrypted, initialize the database immediately
            if encryption_config.is_none() || !encryption_config.as_ref().unwrap().encrypted {
                match db::init_database_unencrypted(&db_path) {
                    Ok(pool) => {
                        *app_state.db.lock().unwrap() = Some(pool.clone());
                        println!("Database initialized (unencrypted)");

                        // Spawn background integrity check (incremental — only if >7 days since last check)
                        let app_handle = app.handle().clone();
                        let pool_clone = pool.clone();
                        std::thread::spawn(move || {
                            run_startup_integrity_check(app_handle, pool_clone);
                        });
                    }
                    Err(e) => {
                        panic!("Failed to initialize database: {}", e);
                    }
                }
            } else {
                println!("Database is encrypted — waiting for master password");
            }

            app.manage(app_state);

            if cfg!(debug_assertions) {
                app.handle().plugin(
                    tauri_plugin_log::Builder::default()
                        .level(log::LevelFilter::Info)
                        .build(),
                )?;
            }
            Ok(())
        })
        .invoke_handler(tauri::generate_handler![
            // Encryption / unlock commands
            commands::security::is_db_encrypted,
            commands::security::unlock_database,
            commands::security::set_master_password,
            commands::security::change_master_password,
            commands::security::remove_encryption,
            // Account commands
            commands::accounts::get_account_groups,
            commands::accounts::get_accounts,
            commands::accounts::get_accounts_with_balance,
            commands::accounts::create_account,
            commands::accounts::update_account,
            commands::accounts::delete_account,
            // Category commands
            commands::categories::get_categories,
            commands::categories::get_categories_with_children,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::delete_category,
            commands::categories::get_recent_categories,
            // Transaction commands
            commands::transactions::get_transactions,
            commands::transactions::get_transactions_with_details,
            commands::transactions::create_transaction,
            commands::transactions::update_transaction,
            commands::transactions::delete_transaction,
            commands::transactions::get_transactions_filtered,
            commands::transactions::get_income_expense_summary,
            commands::transactions::get_category_spending,
            commands::transactions::get_daily_summary,
            commands::transactions::search_transactions,
            commands::transactions::get_monthly_trends,
            // Recurring commands
            commands::recurring::create_recurring_transaction,
            commands::recurring::get_recurring_transactions,
            commands::recurring::get_recurring_transactions_with_details,
            commands::recurring::update_recurring_transaction,
            commands::recurring::delete_recurring_transaction,
            commands::recurring::toggle_recurring_transaction,
            commands::recurring::skip_next_occurrence,
            commands::recurring::execute_recurring_transaction,
            commands::recurring::get_upcoming_executions,
            commands::recurring::process_recurring_transactions,
            commands::recurring::get_execution_history,
            commands::recurring::confirm_variable_amount,
            commands::recurring::pause_with_resume,
            // Budget commands
            commands::budgets::create_budget,
            commands::budgets::get_budgets,
            commands::budgets::update_budget,
            commands::budgets::delete_budget,
            commands::budgets::get_budget_status,
            commands::budgets::get_all_budget_statuses,
            commands::budgets::get_budget_alerts,
            // Installment commands
            commands::installments::create_installment_plan,
            commands::installments::get_installment_plan,
            commands::installments::get_installment_plans,
            commands::installments::get_installment_plan_with_details,
            commands::installments::process_installment_payment,
            commands::installments::cancel_installment_plan,
            commands::installments::delete_installment_plan,
            commands::installments::get_upcoming_installments,
            // Template commands
            commands::templates::get_templates,
            commands::templates::create_template,
            commands::templates::update_template,
            commands::templates::delete_template,
            commands::templates::use_template,
            // Export commands
            commands::export::export_transactions_csv,
            commands::export::export_transactions_json,
            commands::export::export_transactions_excel,
            commands::export::export_full_backup,
            // Credit Card commands
            commands::credit_cards::create_credit_card_settings,
            commands::credit_cards::update_credit_card_settings,
            commands::credit_cards::delete_credit_card_settings,
            commands::credit_cards::get_credit_card_settings_by_account,
            commands::credit_cards::get_all_credit_cards,
            commands::credit_cards::get_credit_card_details,
            commands::credit_cards::get_current_billing_cycle,
            commands::credit_cards::get_current_cycle_transactions,
            commands::credit_cards::generate_statement,
            commands::credit_cards::get_statements,
            commands::credit_cards::get_statement_with_transactions,
            commands::credit_cards::settle_credit_card,
            commands::credit_cards::get_credit_card_summaries,
            commands::credit_cards::process_auto_settlements,
            // Analytics commands
            commands::analytics::get_net_worth_history,
            commands::analytics::get_account_balance_history,
            commands::analytics::get_top_categories,
            commands::analytics::get_subcategory_breakdown,
            commands::analytics::get_year_over_year_comparison,
            commands::analytics::get_analytics_dashboard,
            // Net Worth commands
            commands::networth::get_current_net_worth,
            commands::networth::get_net_worth_snapshots,
            // Currency commands
            commands::currencies::get_supported_currencies,
            commands::currencies::get_primary_currency,
            commands::currencies::set_primary_currency,
            commands::currencies::set_exchange_rate,
            commands::currencies::get_exchange_rate,
            commands::currencies::get_exchange_rates,
            commands::currencies::delete_exchange_rate,
            commands::currencies::convert_amount,
            commands::currencies::get_exchange_rate_summaries,
            commands::currencies::convert_balances_to_primary,
            // Settings commands
            commands::settings::get_setting,
            commands::settings::set_setting,
            commands::settings::restore_from_backup,
            commands::settings::clear_all_data,
            // Data integrity commands
            commands::settings::verify_ledger_integrity,
            commands::settings::cleanup_orphaned_data,
            // Scheduled Backup commands
            commands::scheduled_backup::get_backup_settings,
            commands::scheduled_backup::update_backup_settings,
            commands::scheduled_backup::get_backup_status,
            commands::scheduled_backup::run_auto_backup_now,
            commands::scheduled_backup::check_and_run_auto_backup,
            commands::scheduled_backup::restore_from_zip_backup,
            // Bills commands
            commands::bills::get_upcoming_bills,
            commands::bills::get_overdue_bill_count,
            commands::bills::skip_bill_occurrence,
            commands::bills::pay_bill_now,
            // Goals commands
            commands::goals::create_goal,
            commands::goals::get_goals,
            commands::goals::get_goal_progress,
            commands::goals::update_goal,
            commands::goals::delete_goal,
            commands::goals::add_goal_contribution,
            commands::goals::complete_goal,
            commands::goals::pause_goal,
            commands::goals::resume_goal,
            commands::goals::archive_goal,
            // Goals — Virtual Envelope commands
            commands::goals::get_unallocated_balance,
            commands::goals::get_account_goal_summary,
            commands::goals::allocate_to_goal,
            commands::goals::withdraw_from_goal,
            // Tag commands
            commands::tags::create_tag,
            commands::tags::get_tags,
            commands::tags::update_tag,
            commands::tags::delete_tag,
            commands::tags::get_spending_by_tag,
            // Security commands
            commands::security::set_pin,
            commands::security::verify_pin,
            commands::security::remove_pin,
            commands::security::is_pin_enabled,
            commands::security::get_lock_timeout,
            commands::security::set_lock_timeout,
            commands::security::get_security_status,
            // Photo commands
            commands::photos::attach_photo,
            commands::photos::remove_photo,
            commands::photos::get_transaction_photos,
            commands::photos::cleanup_orphaned_photos,
            commands::photos::save_photo_to,
            // Import commands
            commands::import::parse_csv_preview,
            commands::import::validate_import_mapping,
            commands::import::get_import_matches,
            commands::import::execute_import,
            commands::import::undo_import,
            commands::import::get_import_history,
            // Advanced commands
            commands::advanced::get_categorization_rules,
            commands::advanced::create_categorization_rule,
            commands::advanced::update_categorization_rule,
            commands::advanced::delete_categorization_rule,
            commands::advanced::get_export_templates,
            commands::advanced::create_export_template,
            commands::advanced::update_export_template,
            commands::advanced::delete_export_template,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}

/// Helper to get the DbPool from AppState, returning an error if the database
/// is locked (encrypted but not yet unlocked).
pub fn get_db(state: &AppState) -> Result<DbPool, String> {
    let guard = state.db.lock().map_err(|_| "Database lock poisoned".to_string())?;
    guard
        .as_ref()
        .cloned()
        .ok_or_else(|| "Database is locked. Please enter your master password.".to_string())
}

/// Run an incremental integrity check in the background.
/// Only executes if the last check was more than 7 days ago.
/// Emits `integrity-check-result` event to the frontend if issues are found.
fn run_startup_integrity_check(app_handle: tauri::AppHandle, pool: DbPool) {
    let conn = match pool.lock() {
        Ok(c) => c,
        Err(_) => {
            println!("Integrity check: failed to lock database");
            return;
        }
    };

    // Check when the last integrity check was run
    let last_check: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'last_integrity_check'",
            [],
            |row| row.get(0),
        )
        .ok();

    let should_run = match last_check {
        None => true, // Never run before
        Some(ref ts) => {
            // Parse the timestamp and check if it's > 7 days old
            match chrono::DateTime::parse_from_rfc3339(ts) {
                Ok(last) => {
                    let elapsed = chrono::Utc::now().signed_duration_since(last);
                    elapsed.num_days() >= 7
                }
                Err(_) => true, // Invalid timestamp, run anyway
            }
        }
    };

    if !should_run {
        println!("Integrity check: skipped (last check was recent)");
        return;
    }

    println!("Integrity check: running background verification...");

    match commands::settings::verify_ledger_integrity_internal(&conn) {
        Ok(result) => {
            let total_issues = result.imbalanced_count + result.missing_entries_count + result.orphaned_entries_count;

            // Save the check timestamp
            let now = chrono::Utc::now().to_rfc3339();
            let _ = conn.execute(
                "INSERT INTO app_settings (key, value, updated_at) VALUES ('last_integrity_check', ?1, datetime('now'))
                 ON CONFLICT(key) DO UPDATE SET value = ?1, updated_at = datetime('now')",
                rusqlite::params![now],
            );

            if total_issues > 0 {
                println!(
                    "Integrity check: found {} issues ({} imbalanced, {} missing, {} orphaned)",
                    total_issues, result.imbalanced_count, result.missing_entries_count, result.orphaned_entries_count
                );

                // Emit event to frontend
                #[derive(serde::Serialize, Clone)]
                struct IntegrityCheckEvent {
                    total_issues: i64,
                    imbalanced_count: i64,
                    missing_entries_count: i64,
                    orphaned_entries_count: i64,
                }

                let _ = app_handle.emit(
                    "integrity-check-result",
                    IntegrityCheckEvent {
                        total_issues,
                        imbalanced_count: result.imbalanced_count,
                        missing_entries_count: result.missing_entries_count,
                        orphaned_entries_count: result.orphaned_entries_count,
                    },
                );
            } else {
                println!("Integrity check: all {} transactions valid ✓", result.total_checked);
            }
        }
        Err(e) => {
            println!("Integrity check: failed — {}", e);
        }
    }
}
