// File: src-tauri/src/commands/scheduled_backup.rs
use serde::{Deserialize, Serialize};
use sqlx::{Row, SqlitePool};
use std::fs;
use std::io::{Read, Write};
use std::path::{Path, PathBuf};
use tauri::{Manager, State};
use zip::write::SimpleFileOptions;

// ======================== TYPES ========================

#[derive(Debug, Serialize, Deserialize, Clone)]
pub struct BackupSettings {
    pub auto_backup_enabled: bool,
    pub auto_backup_frequency: String, // DAILY, WEEKLY, MONTHLY
    pub auto_backup_path: String,
    pub auto_backup_retention: i64,
    pub auto_backup_include_photos: bool,
    pub auto_backup_last_run: String,
}

#[derive(Debug, Serialize)]
pub struct BackupStatus {
    pub last_backup_date: Option<String>,
    pub next_due_date: Option<String>,
    pub backup_count: i64,
    pub is_overdue: bool,
}

#[derive(Debug, Serialize)]
pub struct BackupResult {
    pub success: bool,
    pub file_path: String,
    pub file_size_bytes: u64,
    pub photos_included: bool,
}

#[derive(Debug, Serialize)]
pub struct ZipRestoreResult {
    pub success: bool,
    pub accounts_restored: i64,
    pub categories_restored: i64,
    pub transactions_restored: i64,
    pub budgets_restored: i64,
    pub photos_restored: i64,
    pub tags_restored: i64,
    pub savings_goals_restored: i64,
    pub transaction_tags_restored: i64,
    pub goal_contributions_restored: i64,
}

// ======================== COMMANDS ========================

/// Read all auto-backup settings from app_settings
#[tauri::command]
pub async fn get_backup_settings(pool: State<'_, SqlitePool>) -> Result<BackupSettings, String> {
    get_backup_settings_internal(pool.inner()).await
}

/// Save all auto-backup settings to app_settings
#[tauri::command]
pub async fn update_backup_settings(
    pool: State<'_, SqlitePool>,
    settings: BackupSettings,
) -> Result<(), String> {
    let pairs = vec![
        ("auto_backup_enabled", settings.auto_backup_enabled.to_string()),
        ("auto_backup_frequency", settings.auto_backup_frequency),
        ("auto_backup_path", settings.auto_backup_path),
        ("auto_backup_retention", settings.auto_backup_retention.to_string()),
        ("auto_backup_include_photos", settings.auto_backup_include_photos.to_string()),
        ("auto_backup_last_run", settings.auto_backup_last_run),
    ];

    for (key, value) in pairs {
        sqlx::query(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        )
        .bind(key)
        .bind(value)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update setting '{}': {}", key, e))?;
    }

    Ok(())
}

/// Get the current backup status (for display in Settings UI)
#[tauri::command]
pub async fn get_backup_status(
    pool: State<'_, SqlitePool>,
) -> Result<BackupStatus, String> {
    let settings = get_backup_settings_internal(pool.inner()).await?;

    let last_backup_date = if settings.auto_backup_last_run.is_empty() {
        None
    } else {
        Some(settings.auto_backup_last_run.clone())
    };

    let next_due_date = if settings.auto_backup_last_run.is_empty() || !settings.auto_backup_enabled {
        None
    } else {
        calculate_next_due(&settings.auto_backup_last_run, &settings.auto_backup_frequency)
    };

    let backup_count = if settings.auto_backup_path.is_empty() {
        0
    } else {
        count_backup_files(&settings.auto_backup_path)
    };

    let is_overdue = check_is_overdue(
        &settings.auto_backup_last_run,
        &settings.auto_backup_frequency,
        settings.auto_backup_enabled,
    );

    Ok(BackupStatus {
        last_backup_date,
        next_due_date,
        backup_count,
        is_overdue,
    })
}

/// Manually trigger an auto-backup from the Settings UI
#[tauri::command]
pub async fn run_auto_backup_now(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
) -> Result<BackupResult, String> {
    let settings = get_backup_settings_internal(pool.inner()).await?;

    if settings.auto_backup_path.is_empty() {
        return Err("No backup path configured. Please select a backup folder first.".to_string());
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let result = perform_backup(
        pool.inner(),
        &settings.auto_backup_path,
        settings.auto_backup_include_photos,
        &app_data_dir,
    )
    .await?;

    // Update last run timestamp
    set_setting(pool.inner(), "auto_backup_last_run", &chrono::Utc::now().to_rfc3339()).await?;

    // Apply retention
    apply_retention(&settings.auto_backup_path, settings.auto_backup_retention)?;

    Ok(result)
}

/// Called from lib.rs setup — runs silently on app startup.
/// Returns Some(message) if backup was performed, None otherwise.
#[tauri::command]
pub async fn check_and_run_auto_backup(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
) -> Result<Option<String>, String> {
    check_and_run_auto_backup_internal(pool.inner(), &app_handle).await
}

/// Restore from a .zip backup file.
/// Extracts backup.json → restores DB via existing restore logic.
/// If photos/ directory exists in zip → copies photos back to app photos dir
/// and re-inserts transaction_photos records with remapped transaction IDs.
#[tauri::command]
pub async fn restore_from_zip_backup(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    zip_path: String,
) -> Result<ZipRestoreResult, String> {
    println!("=== restore_from_zip_backup called ===");
    println!("Zip path: {}", zip_path);

    // 1. Open the zip file
    let file = fs::File::open(&zip_path)
        .map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

    // 2. Extract backup.json
    let backup_json = {
        let mut backup_file = archive
            .by_name("backup.json")
            .map_err(|_| "Zip does not contain backup.json — not a valid Money Manager backup".to_string())?;
        let mut contents = String::new();
        backup_file
            .read_to_string(&mut contents)
            .map_err(|e| format!("Failed to read backup.json from zip: {}", e))?;
        contents
    };

    // 3. Parse the backup JSON
    let backup: serde_json::Value = serde_json::from_str(&backup_json)
        .map_err(|e| format!("Invalid backup.json format: {}", e))?;

    let version = backup.get("version").and_then(|v| v.as_str()).unwrap_or("unknown");
    if version != "1.0" {
        return Err(format!("Unsupported backup version: {}. Expected 1.0", version));
    }

    // 4. Restore the database using the existing restore logic
    // We call restore_from_backup via the pool directly
    let restore_result = crate::commands::settings::restore_from_backup_internal(
        pool.inner(), &backup_json
    ).await?;

    // 5. Restore photos from the zip (if present)
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    let photos_dir = app_data_dir.join("photos");

    let mut photos_restored: i64 = 0;

    // Re-open archive since ZipArchive borrows the file
    let file2 = fs::File::open(&zip_path)
        .map_err(|e| format!("Failed to re-open zip file: {}", e))?;
    let mut archive2 = zip::ZipArchive::new(file2)
        .map_err(|e| format!("Failed to re-read zip archive: {}", e))?;

    for i in 0..archive2.len() {
        let mut entry = archive2.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let entry_name = entry.name().to_string();

        // Check if this is a photo file inside the photos/ directory
        if entry_name.starts_with("photos/") && entry_name.len() > 7 && !entry.is_dir() {
            let filename = entry_name.strip_prefix("photos/").unwrap_or(&entry_name);
            
            // Skip subdirectory paths — only restore direct files
            if filename.contains('/') {
                continue;
            }

            // Create photos directory if needed
            fs::create_dir_all(&photos_dir)
                .map_err(|e| format!("Failed to create photos directory: {}", e))?;

            // Extract the photo file
            let dest_path = photos_dir.join(filename);
            let mut output = fs::File::create(&dest_path)
                .map_err(|e| format!("Failed to create photo file {}: {}", filename, e))?;
            std::io::copy(&mut entry, &mut output)
                .map_err(|e| format!("Failed to extract photo {}: {}", filename, e))?;

            photos_restored += 1;
            println!("Restored photo: {}", filename);
        }
    }

    // 6. Restore transaction_photos records if present in backup JSON
    let data = backup.get("data");
    if let Some(photos_data) = data.and_then(|d| d.get("transaction_photos")).and_then(|v| v.as_array()) {
        // We need to remap old transaction IDs to new ones.
        // Since restore_from_backup_internal returns the result but not the ID maps,
        // we'll re-insert photos by matching filenames to the photos on disk.
        // The simplest approach: insert records with the new transaction IDs.
        // But we don't have the mapping here. So we'll match by the original transaction's
        // unique characteristics (date + amount + account) or simply insert with
        // a filename-based approach.
        
        // Actually, since the full restore replaces all data with sequential new IDs,
        // and our backup stores transaction_photos with old_transaction_id,
        // we need to build a mapping. The restore logic creates transactions in order,
        // so old_id N maps to new sequential ID.
        // Let's query all transactions and build the map from backup data.
        
        let txn_data = data.and_then(|d| d.get("transactions")).and_then(|v| v.as_array());
        
        if let Some(transactions) = txn_data {
            // Build old_id → position map (0-indexed order of insertion)
            let old_ids: Vec<i64> = transactions.iter().map(|t| {
                let txn = t.get("transaction").unwrap_or(t);
                txn.get("id").and_then(|v| v.as_i64()).unwrap_or(0)
            }).collect();

            // Fetch all new transaction IDs in insertion order
            let new_txn_rows = sqlx::query(
                "SELECT id FROM transactions ORDER BY id ASC"
            )
            .fetch_all(pool.inner())
            .await
            .map_err(|e| format!("Failed to fetch new transaction IDs: {}", e))?;

            let new_ids: Vec<i64> = new_txn_rows.iter().map(|r| r.get::<i64, _>("id")).collect();

            // Build old → new map
            let mut txn_id_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
            for (idx, old_id) in old_ids.iter().enumerate() {
                if idx < new_ids.len() {
                    txn_id_map.insert(*old_id, new_ids[idx]);
                }
            }

            // Now insert transaction_photos with remapped IDs
            for photo in photos_data {
                let old_txn_id = photo.get("transaction_id").and_then(|v| v.as_i64()).unwrap_or(0);
                let filename = photo.get("filename").and_then(|v| v.as_str()).unwrap_or("");
                
                if filename.is_empty() || old_txn_id == 0 {
                    continue;
                }

                let new_txn_id = txn_id_map.get(&old_txn_id).copied().unwrap_or(old_txn_id);

                // Only insert if the photo file exists on disk
                let photo_path = photos_dir.join(filename);
                if photo_path.exists() {
                    let _ = sqlx::query(
                        "INSERT OR IGNORE INTO transaction_photos (transaction_id, filename) VALUES (?, ?)"
                    )
                    .bind(new_txn_id)
                    .bind(filename)
                    .execute(pool.inner())
                    .await;
                }
            }
        }
    }

    println!("Zip restore complete: {} accounts, {} categories, {} tags, {} goals, {} transactions, {} budgets, {} photos",
        restore_result.accounts_restored,
        restore_result.categories_restored,
        restore_result.tags_restored,
        restore_result.savings_goals_restored,
        restore_result.transactions_restored,
        restore_result.budgets_restored,
        photos_restored,
    );

    Ok(ZipRestoreResult {
        success: true,
        accounts_restored: restore_result.accounts_restored,
        categories_restored: restore_result.categories_restored,
        transactions_restored: restore_result.transactions_restored,
        budgets_restored: restore_result.budgets_restored,
        photos_restored,
        tags_restored: restore_result.tags_restored,
        savings_goals_restored: restore_result.savings_goals_restored,
        transaction_tags_restored: restore_result.transaction_tags_restored,
        goal_contributions_restored: restore_result.goal_contributions_restored,
    })
}

/// Internal version callable without State wrapper (for lib.rs startup)
pub async fn check_and_run_auto_backup_internal(
    pool: &SqlitePool,
    app_handle: &tauri::AppHandle,
) -> Result<Option<String>, String> {
    let settings = get_backup_settings_internal(pool).await?;

    // Skip if disabled
    if !settings.auto_backup_enabled {
        return Ok(None);
    }

    // Skip if no path configured
    if settings.auto_backup_path.is_empty() {
        return Ok(None);
    }

    // Check if backup is due
    if !is_backup_due(&settings.auto_backup_last_run, &settings.auto_backup_frequency) {
        return Ok(None);
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    // Perform the backup
    let result = perform_backup(
        pool,
        &settings.auto_backup_path,
        settings.auto_backup_include_photos,
        &app_data_dir,
    )
    .await?;

    // Update last run
    set_setting(pool, "auto_backup_last_run", &chrono::Utc::now().to_rfc3339()).await?;

    // Apply retention
    apply_retention(&settings.auto_backup_path, settings.auto_backup_retention)?;

    Ok(Some(format!(
        "Backup completed: {} ({} bytes)",
        result.file_path, result.file_size_bytes
    )))
}

// ======================== INTERNAL HELPERS ========================

async fn get_backup_settings_internal(pool: &SqlitePool) -> Result<BackupSettings, String> {
    let rows = sqlx::query(
        "SELECT key, value FROM app_settings WHERE key LIKE 'auto_backup_%'"
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to read backup settings: {}", e))?;

    let mut settings = BackupSettings {
        auto_backup_enabled: false,
        auto_backup_frequency: "WEEKLY".to_string(),
        auto_backup_path: String::new(),
        auto_backup_retention: 5,
        auto_backup_include_photos: false,
        auto_backup_last_run: String::new(),
    };

    for row in &rows {
        let key: String = row.get("key");
        let value: String = row.get("value");
        match key.as_str() {
            "auto_backup_enabled" => settings.auto_backup_enabled = value == "true",
            "auto_backup_frequency" => settings.auto_backup_frequency = value,
            "auto_backup_path" => settings.auto_backup_path = value,
            "auto_backup_retention" => {
                settings.auto_backup_retention = value.parse().unwrap_or(5)
            }
            "auto_backup_include_photos" => {
                settings.auto_backup_include_photos = value == "true"
            }
            "auto_backup_last_run" => settings.auto_backup_last_run = value,
            _ => {}
        }
    }

    Ok(settings)
}

async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<(), String> {
    sqlx::query(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?, ?, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to update setting '{}': {}", key, e))?;
    Ok(())
}

/// Core backup logic: creates a zip file containing the database JSON export
/// and optionally the photos directory.
async fn perform_backup(
    pool: &SqlitePool,
    backup_path: &str,
    include_photos: bool,
    app_data_dir: &Path,
) -> Result<BackupResult, String> {
    // Ensure backup directory exists
    fs::create_dir_all(backup_path)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    // Generate filename
    let now = chrono::Local::now();
    let filename = format!("money_manager_backup_{}.zip", now.format("%Y-%m-%d_%H%M"));
    let zip_path = PathBuf::from(backup_path).join(&filename);

    // Generate backup JSON (reuse the same logic as export_full_backup)
    let backup_json = generate_backup_json(pool).await?;

    // Create the zip file
    let file = fs::File::create(&zip_path)
        .map_err(|e| format!("Failed to create zip file: {}", e))?;

    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    // Add backup.json
    zip.start_file("backup.json", options)
        .map_err(|e| format!("Failed to add backup.json to zip: {}", e))?;
    zip.write_all(backup_json.as_bytes())
        .map_err(|e| format!("Failed to write backup data: {}", e))?;

    // Optionally add photos
    let mut photos_included = false;
    if include_photos {
        let photos_dir = app_data_dir.join("photos");
        if photos_dir.exists() && photos_dir.is_dir() {
            add_directory_to_zip(&mut zip, &photos_dir, "photos", &options)?;
            photos_included = true;
        }
    }

    zip.finish()
        .map_err(|e| format!("Failed to finalize zip: {}", e))?;

    // Get file size
    let file_size = fs::metadata(&zip_path)
        .map(|m| m.len())
        .unwrap_or(0);

    let file_path_str = zip_path.to_str().unwrap_or("").to_string();

    println!("Auto-backup created: {} ({} bytes, photos: {})", file_path_str, file_size, photos_included);

    Ok(BackupResult {
        success: true,
        file_path: file_path_str,
        file_size_bytes: file_size,
        photos_included,
    })
}

/// Generate JSON backup data (same structure as export_full_backup)
async fn generate_backup_json(pool: &SqlitePool) -> Result<String, String> {
    // Accounts
    let account_rows = sqlx::query(
        "SELECT id, group_id, name, initial_balance, currency, created_at FROM accounts ORDER BY name",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch accounts: {}", e))?;

    let accounts: Vec<serde_json::Value> = account_rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "group_id": row.get::<i64, _>("group_id"),
                "name": row.get::<String, _>("name"),
                "initial_balance": row.get::<f64, _>("initial_balance"),
                "currency": row.get::<String, _>("currency"),
                "created_at": row.get::<String, _>("created_at")
            })
        })
        .collect();

    // Categories
    let category_rows = sqlx::query("SELECT id, name, type, parent_id FROM categories ORDER BY name")
        .fetch_all(pool)
        .await
        .map_err(|e| format!("Failed to fetch categories: {}", e))?;

    let categories: Vec<serde_json::Value> = category_rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "name": row.get::<String, _>("name"),
                "type": row.get::<String, _>("type"),
                "parent_id": row.get::<Option<i64>, _>("parent_id")
            })
        })
        .collect();

    // Transactions
    let txn_rows = sqlx::query(
        "SELECT t.id, t.date, t.type, t.amount, t.account_id, t.to_account_id,
                t.category_id, t.memo, t.photo_path, t.created_at,
                a.name as account_name,
                ta.name as to_account_name,
                c.name as category_name
         FROM transactions t
         INNER JOIN accounts a ON t.account_id = a.id
         LEFT JOIN accounts ta ON t.to_account_id = ta.id
         LEFT JOIN categories c ON t.category_id = c.id
         ORDER BY t.date DESC, t.created_at DESC",
    )
    .fetch_all(pool)
    .await
    .map_err(|e| format!("Failed to fetch transactions: {}", e))?;

    let transactions: Vec<serde_json::Value> = txn_rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "transaction": {
                    "id": row.get::<i64, _>("id"),
                    "date": row.get::<String, _>("date"),
                    "transaction_type": row.get::<String, _>("type"),
                    "amount": row.get::<f64, _>("amount"),
                    "account_id": row.get::<i64, _>("account_id"),
                    "to_account_id": row.get::<Option<i64>, _>("to_account_id"),
                    "category_id": row.get::<Option<i64>, _>("category_id"),
                    "memo": row.get::<Option<String>, _>("memo"),
                    "photo_path": row.get::<Option<String>, _>("photo_path"),
                    "created_at": row.get::<String, _>("created_at")
                },
                "account_name": row.get::<String, _>("account_name"),
                "to_account_name": row.get::<Option<String>, _>("to_account_name"),
                "category_name": row.get::<Option<String>, _>("category_name")
            })
        })
        .collect();

    // Budgets
    let budget_rows =
        sqlx::query("SELECT id, category_id, amount, period, start_date FROM budgets ORDER BY id")
            .fetch_all(pool)
            .await
            .map_err(|e| format!("Failed to fetch budgets: {}", e))?;

    let budgets: Vec<serde_json::Value> = budget_rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "category_id": row.get::<i64, _>("category_id"),
                "amount": row.get::<f64, _>("amount"),
                "period": row.get::<String, _>("period"),
                "start_date": row.get::<String, _>("start_date")
            })
        })
        .collect();

    // Transaction Photos (for zip backup restore)
    let photo_rows = sqlx::query(
        "SELECT id, transaction_id, filename, created_at FROM transaction_photos ORDER BY id"
    )
    .fetch_all(pool)
    .await
    .unwrap_or_default();

    let transaction_photos: Vec<serde_json::Value> = photo_rows
        .iter()
        .map(|row| {
            serde_json::json!({
                "id": row.get::<i64, _>("id"),
                "transaction_id": row.get::<i64, _>("transaction_id"),
                "filename": row.get::<String, _>("filename"),
                "created_at": row.get::<String, _>("created_at")
            })
        })
        .collect();

    // Tags
    let tag_rows = sqlx::query("SELECT id, name, color, created_at FROM tags ORDER BY id")
        .fetch_all(pool)
        .await
        .unwrap_or_default();
    let tags: Vec<serde_json::Value> = tag_rows.iter().map(|row| serde_json::json!({
        "id": row.get::<i64, _>("id"),
        "name": row.get::<String, _>("name"),
        "color": row.get::<String, _>("color"),
        "created_at": row.get::<String, _>("created_at")
    })).collect();

    let txn_tag_rows = sqlx::query("SELECT transaction_id, tag_id FROM transaction_tags")
        .fetch_all(pool)
        .await
        .unwrap_or_default();
    let transaction_tags: Vec<serde_json::Value> = txn_tag_rows.iter().map(|row| serde_json::json!({
        "transaction_id": row.get::<i64, _>("transaction_id"),
        "tag_id": row.get::<i64, _>("tag_id")
    })).collect();

    // Savings Goals
    let goal_rows = sqlx::query("SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at FROM savings_goals ORDER BY id")
        .fetch_all(pool)
        .await
        .unwrap_or_default();
    let savings_goals: Vec<serde_json::Value> = goal_rows.iter().map(|row| serde_json::json!({
        "id": row.get::<i64, _>("id"),
        "name": row.get::<String, _>("name"),
        "target_amount": row.get::<f64, _>("target_amount"),
        "target_date": row.get::<Option<String>, _>("target_date"),
        "linked_account_id": row.get::<Option<i64>, _>("linked_account_id"),
        "color": row.get::<String, _>("color"),
        "icon": row.get::<String, _>("icon"),
        "status": row.get::<String, _>("status"),
        "created_at": row.get::<String, _>("created_at"),
        "updated_at": row.get::<String, _>("updated_at")
    })).collect();

    let goal_contrib_rows = sqlx::query("SELECT id, goal_id, amount, contribution_date, note, created_at FROM goal_contributions ORDER BY id")
        .fetch_all(pool)
        .await
        .unwrap_or_default();
    let goal_contributions: Vec<serde_json::Value> = goal_contrib_rows.iter().map(|row| serde_json::json!({
        "id": row.get::<i64, _>("id"),
        "goal_id": row.get::<i64, _>("goal_id"),
        "amount": row.get::<f64, _>("amount"),
        "contribution_date": row.get::<String, _>("contribution_date"),
        "note": row.get::<Option<String>, _>("note"),
        "created_at": row.get::<String, _>("created_at")
    })).collect();

    let backup = serde_json::json!({
        "version": "1.0",
        "exported_at": chrono::Utc::now().to_rfc3339(),
        "data": {
            "accounts": accounts,
            "categories": categories,
            "transactions": transactions,
            "budgets": budgets,
            "transaction_photos": transaction_photos,
            "tags": tags,
            "transaction_tags": transaction_tags,
            "savings_goals": savings_goals,
            "goal_contributions": goal_contributions
        }
    });

    serde_json::to_string_pretty(&backup)
        .map_err(|e| format!("Failed to serialize backup: {}", e))
}

/// Recursively add a directory's contents to a zip file
fn add_directory_to_zip(
    zip: &mut zip::ZipWriter<fs::File>,
    source_dir: &Path,
    prefix: &str,
    options: &SimpleFileOptions,
) -> Result<(), String> {
    let entries = fs::read_dir(source_dir)
        .map_err(|e| format!("Failed to read directory {}: {}", source_dir.display(), e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry.file_name();
        let name_str = name.to_str().unwrap_or("");
        let zip_path = format!("{}/{}", prefix, name_str);

        if path.is_file() {
            zip.start_file(&zip_path, *options)
                .map_err(|e| format!("Failed to add file to zip: {}", e))?;
            let data = fs::read(&path)
                .map_err(|e| format!("Failed to read file {}: {}", path.display(), e))?;
            zip.write_all(&data)
                .map_err(|e| format!("Failed to write file to zip: {}", e))?;
        } else if path.is_dir() {
            add_directory_to_zip(zip, &path, &zip_path, options)?;
        }
    }

    Ok(())
}

/// Delete oldest backup files when count exceeds the retention limit
fn apply_retention(backup_path: &str, max_count: i64) -> Result<(), String> {
    if max_count <= 0 {
        return Ok(());
    }

    let dir = Path::new(backup_path);
    if !dir.exists() {
        return Ok(());
    }

    let mut backups: Vec<(PathBuf, std::time::SystemTime)> = Vec::new();

    let entries = fs::read_dir(dir)
        .map_err(|e| format!("Failed to read backup directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read entry: {}", e))?;
        let path = entry.path();
        let name = entry.file_name().to_str().unwrap_or("").to_string();

        // Only consider our backup files
        if name.starts_with("money_manager_backup_") && name.ends_with(".zip") {
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified) = metadata.modified() {
                    backups.push((path, modified));
                }
            }
        }
    }

    // Sort by modification time (newest first)
    backups.sort_by(|a, b| b.1.cmp(&a.1));

    // Delete excess backups
    if backups.len() as i64 > max_count {
        for (path, _) in &backups[max_count as usize..] {
            match fs::remove_file(path) {
                Ok(_) => println!("Retention: deleted old backup {}", path.display()),
                Err(e) => println!("Warning: failed to delete {}: {}", path.display(), e),
            }
        }
    }

    Ok(())
}

/// Count backup zip files in the configured directory
fn count_backup_files(backup_path: &str) -> i64 {
    let dir = Path::new(backup_path);
    if !dir.exists() {
        return 0;
    }

    fs::read_dir(dir)
        .map(|entries| {
            entries
                .filter_map(|e| e.ok())
                .filter(|e| {
                    let name = e.file_name().to_str().unwrap_or("").to_string();
                    name.starts_with("money_manager_backup_") && name.ends_with(".zip")
                })
                .count() as i64
        })
        .unwrap_or(0)
}

/// Check if a backup is due based on frequency and last run
fn is_backup_due(last_run: &str, frequency: &str) -> bool {
    if last_run.is_empty() {
        return true; // Never run before
    }

    let last = match chrono::DateTime::parse_from_rfc3339(last_run) {
        Ok(dt) => dt.with_timezone(&chrono::Utc),
        Err(_) => return true, // Can't parse, assume due
    };

    let now = chrono::Utc::now();
    let elapsed = now.signed_duration_since(last);

    match frequency {
        "DAILY" => elapsed.num_hours() >= 24,
        "WEEKLY" => elapsed.num_days() >= 7,
        "MONTHLY" => elapsed.num_days() >= 30,
        _ => elapsed.num_days() >= 7, // Default to weekly
    }
}

/// Calculate the next due date based on last run and frequency
fn calculate_next_due(last_run: &str, frequency: &str) -> Option<String> {
    let last = chrono::DateTime::parse_from_rfc3339(last_run).ok()?;

    let duration = match frequency {
        "DAILY" => chrono::Duration::days(1),
        "WEEKLY" => chrono::Duration::days(7),
        "MONTHLY" => chrono::Duration::days(30),
        _ => chrono::Duration::days(7),
    };

    let next = last + duration;
    Some(next.to_rfc3339())
}

/// Check if the backup is overdue (> 2× the configured frequency)
fn check_is_overdue(last_run: &str, frequency: &str, enabled: bool) -> bool {
    if !enabled || last_run.is_empty() {
        return false;
    }

    let last = match chrono::DateTime::parse_from_rfc3339(last_run) {
        Ok(dt) => dt.with_timezone(&chrono::Utc),
        Err(_) => return false,
    };

    let now = chrono::Utc::now();
    let elapsed = now.signed_duration_since(last);

    match frequency {
        "DAILY" => elapsed.num_hours() >= 48,
        "WEEKLY" => elapsed.num_days() >= 14,
        "MONTHLY" => elapsed.num_days() >= 60,
        _ => elapsed.num_days() >= 14,
    }
}
