// File: src-tauri/src/lib.rs
mod commands;
mod db;
mod models;

use tauri::Manager;

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tauri::Builder::default()
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
            commands::accounts::delete_account,
            // Category commands
            commands::categories::get_categories,
            commands::categories::get_categories_with_children,
            commands::categories::create_category,
            commands::categories::update_category,
            commands::categories::delete_category,
            // Transaction commands (Phase 1)
            commands::transactions::get_transactions,
            commands::transactions::get_transactions_with_details,
            commands::transactions::create_transaction,
            commands::transactions::update_transaction,
            commands::transactions::delete_transaction,
            // Transaction commands (Phase 2 - Analytics)
            commands::transactions::get_transactions_filtered,
            commands::transactions::get_income_expense_summary,
            commands::transactions::get_category_spending,
            commands::transactions::get_daily_summary,
            commands::transactions::search_transactions,
            // Budget commands (Phase 3)
            commands::budgets::get_budgets,
            commands::budgets::create_budget,
            commands::budgets::update_budget,
            commands::budgets::delete_budget,
            commands::budgets::get_budget_status,
            commands::budgets::get_all_budget_statuses,
            commands::budgets::get_budget_alerts,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
