// File: src-tauri/src/lib.rs
mod commands;
mod db;
mod models;

use tauri::Manager;

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
            let database_url = format!("sqlite:{}", db_path.display());

            println!("Database location: {}", db_path.display());

            let runtime = tokio::runtime::Runtime::new().unwrap();
            let pool = runtime.block_on(async {
                db::init_database_with_url(&database_url)
                    .await
                    .expect("Failed to initialize database")
            });

            app.manage(pool);

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
            commands::settings::restore_from_backup,
            commands::settings::clear_all_data,
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
            commands::photos::get_photo_path,
            commands::photos::cleanup_orphaned_photos,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
