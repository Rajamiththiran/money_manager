// File: src-tauri/src/commands/scheduled_backup.rs
use crate::AppState;
use rusqlite::params;
use serde::{Deserialize, Serialize};
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

#[tauri::command]
pub fn get_backup_settings(state: State<'_, AppState>) -> Result<BackupSettings, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
    get_backup_settings_internal(&conn)
}

#[tauri::command]
pub fn update_backup_settings(
    state: State<'_, AppState>,
    settings: BackupSettings,
) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let pairs = vec![
        ("auto_backup_enabled", settings.auto_backup_enabled.to_string()),
        ("auto_backup_frequency", settings.auto_backup_frequency),
        ("auto_backup_path", settings.auto_backup_path),
        ("auto_backup_retention", settings.auto_backup_retention.to_string()),
        ("auto_backup_include_photos", settings.auto_backup_include_photos.to_string()),
        ("auto_backup_last_run", settings.auto_backup_last_run),
    ];

    for (key, value) in pairs {
        conn.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
             ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
            params![key, value],
        ).map_err(|e| format!("Failed to update setting '{}': {}", key, e))?;
    }

    Ok(())
}

#[tauri::command]
pub fn get_backup_status(
    state: State<'_, AppState>,
) -> Result<BackupStatus, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
    let settings = get_backup_settings_internal(&conn)?;

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

#[tauri::command]
pub fn run_auto_backup_now(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<BackupResult, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
    let settings = get_backup_settings_internal(&conn)?;

    if settings.auto_backup_path.is_empty() {
        return Err("No backup path configured. Please select a backup folder first.".to_string());
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let result = perform_backup(
        &conn,
        &settings.auto_backup_path,
        settings.auto_backup_include_photos,
        &app_data_dir,
    )?;

    set_setting(&conn, "auto_backup_last_run", &chrono::Utc::now().to_rfc3339())?;

    apply_retention(&settings.auto_backup_path, settings.auto_backup_retention)?;

    Ok(result)
}

#[tauri::command]
pub fn check_and_run_auto_backup(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
) -> Result<Option<String>, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;
    check_and_run_auto_backup_internal(&conn, &app_handle)
}

#[tauri::command]
pub fn restore_from_zip_backup(
    app_handle: tauri::AppHandle,
    state: State<'_, AppState>,
    zip_path: String,
) -> Result<ZipRestoreResult, String> {
    let pool = crate::get_db(&state)?;
    let mut conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    println!("=== restore_from_zip_backup called ===");
    println!("Zip path: {}", zip_path);

    let file = fs::File::open(&zip_path)
        .map_err(|e| format!("Failed to open zip file: {}", e))?;
    let mut archive = zip::ZipArchive::new(file)
        .map_err(|e| format!("Failed to read zip archive: {}", e))?;

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

    let backup: serde_json::Value = serde_json::from_str(&backup_json)
        .map_err(|e| format!("Invalid backup.json format: {}", e))?;

    let version = backup.get("version").and_then(|v| v.as_str()).unwrap_or("unknown");
    if version != "1.0" {
        return Err(format!("Unsupported backup version: {}. Expected 1.0", version));
    }

    let restore_result = crate::commands::settings::restore_from_backup_internal(
        &mut conn, &backup_json
    )?;

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;
    let photos_dir = app_data_dir.join("photos");

    let mut photos_restored: i64 = 0;

    let file2 = fs::File::open(&zip_path)
        .map_err(|e| format!("Failed to re-open zip file: {}", e))?;
    let mut archive2 = zip::ZipArchive::new(file2)
        .map_err(|e| format!("Failed to re-read zip archive: {}", e))?;

    for i in 0..archive2.len() {
        let mut entry = archive2.by_index(i)
            .map_err(|e| format!("Failed to read zip entry: {}", e))?;

        let entry_name = entry.name().to_string();

        if entry_name.starts_with("photos/") && entry_name.len() > 7 && !entry.is_dir() {
            let filename = entry_name.strip_prefix("photos/").unwrap_or(&entry_name);
            
            if filename.contains('/') {
                continue;
            }

            fs::create_dir_all(&photos_dir)
                .map_err(|e| format!("Failed to create photos directory: {}", e))?;

            let dest_path = photos_dir.join(filename);
            let mut output = fs::File::create(&dest_path)
                .map_err(|e| format!("Failed to create photo file {}: {}", filename, e))?;
            std::io::copy(&mut entry, &mut output)
                .map_err(|e| format!("Failed to extract photo {}: {}", filename, e))?;

            photos_restored += 1;
            println!("Restored photo: {}", filename);
        }
    }

    let data = backup.get("data");
    if let Some(photos_data) = data.and_then(|d| d.get("transaction_photos")).and_then(|v| v.as_array()) {
        let txn_data = data.and_then(|d| d.get("transactions")).and_then(|v| v.as_array());
        
        if let Some(transactions) = txn_data {
            let old_ids: Vec<i64> = transactions.iter().map(|t| {
                let txn = t.get("transaction").unwrap_or(t);
                txn.get("id").and_then(|v| v.as_i64()).unwrap_or(0)
            }).collect();

            let mut stmt = conn.prepare("SELECT id FROM transactions ORDER BY id ASC").unwrap();
            let new_ids: Vec<i64> = stmt.query_map([], |row| row.get(0)).unwrap().filter_map(Result::ok).collect();

            let mut txn_id_map: std::collections::HashMap<i64, i64> = std::collections::HashMap::new();
            for (idx, old_id) in old_ids.iter().enumerate() {
                if idx < new_ids.len() {
                    txn_id_map.insert(*old_id, new_ids[idx]);
                }
            }

            for photo in photos_data {
                let old_txn_id = photo.get("transaction_id").and_then(|v| v.as_i64()).unwrap_or(0);
                let filename = photo.get("filename").and_then(|v| v.as_str()).unwrap_or("");
                
                if filename.is_empty() || old_txn_id == 0 {
                    continue;
                }

                let new_txn_id = txn_id_map.get(&old_txn_id).copied().unwrap_or(old_txn_id);

                let photo_path = photos_dir.join(filename);
                if photo_path.exists() {
                    let _ = conn.execute(
                        "INSERT OR IGNORE INTO transaction_photos (transaction_id, filename) VALUES (?1, ?2)",
                        params![new_txn_id, filename]
                    );
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

pub fn check_and_run_auto_backup_internal(
    conn: &rusqlite::Connection,
    app_handle: &tauri::AppHandle,
) -> Result<Option<String>, String> {
    let settings = get_backup_settings_internal(conn)?;

    if !settings.auto_backup_enabled {
        return Ok(None);
    }

    if settings.auto_backup_path.is_empty() {
        return Ok(None);
    }

    if !is_backup_due(&settings.auto_backup_last_run, &settings.auto_backup_frequency) {
        return Ok(None);
    }

    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    let result = perform_backup(
        conn,
        &settings.auto_backup_path,
        settings.auto_backup_include_photos,
        &app_data_dir,
    )?;

    set_setting(conn, "auto_backup_last_run", &chrono::Utc::now().to_rfc3339())?;

    apply_retention(&settings.auto_backup_path, settings.auto_backup_retention)?;

    Ok(Some(format!(
        "Backup completed: {} ({} bytes)",
        result.file_path, result.file_size_bytes
    )))
}

// ======================== INTERNAL HELPERS ========================

fn get_backup_settings_internal(conn: &rusqlite::Connection) -> Result<BackupSettings, String> {
    let mut stmt = conn.prepare(
        "SELECT key, value FROM app_settings WHERE key LIKE 'auto_backup_%'"
    ).map_err(|e| format!("Database error: {}", e))?;

    let rows: Vec<(String, String)> = stmt.query_map([], |row| {
        Ok((row.get(0)?, row.get(1)?))
    }).unwrap().filter_map(Result::ok).collect();

    let mut settings = BackupSettings {
        auto_backup_enabled: false,
        auto_backup_frequency: "WEEKLY".to_string(),
        auto_backup_path: String::new(),
        auto_backup_retention: 5,
        auto_backup_include_photos: false,
        auto_backup_last_run: String::new(),
    };

    for (key, value) in rows {
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

fn set_setting(conn: &rusqlite::Connection, key: &str, value: &str) -> Result<(), String> {
    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES (?1, ?2, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value],
    ).map_err(|e| format!("Failed to update setting '{}': {}", key, e))?;
    Ok(())
}

fn perform_backup(
    conn: &rusqlite::Connection,
    backup_path: &str,
    include_photos: bool,
    app_data_dir: &Path,
) -> Result<BackupResult, String> {
    fs::create_dir_all(backup_path)
        .map_err(|e| format!("Failed to create backup directory: {}", e))?;

    let now = chrono::Local::now();
    let filename = format!("money_manager_backup_{}.zip", now.format("%Y-%m-%d_%H%M"));
    let zip_path = PathBuf::from(backup_path).join(&filename);

    let backup_json = generate_backup_json(conn)?;

    let file = fs::File::create(&zip_path)
        .map_err(|e| format!("Failed to create zip file: {}", e))?;

    let mut zip = zip::ZipWriter::new(file);
    let options = SimpleFileOptions::default()
        .compression_method(zip::CompressionMethod::Deflated)
        .unix_permissions(0o644);

    zip.start_file("backup.json", options)
        .map_err(|e| format!("Failed to add backup.json to zip: {}", e))?;
    zip.write_all(backup_json.as_bytes())
        .map_err(|e| format!("Failed to write backup data: {}", e))?;

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

fn generate_backup_json(conn: &rusqlite::Connection) -> Result<String, String> {
    let mut stmt = conn.prepare(
        "SELECT id, group_id, name, initial_balance, currency, created_at FROM accounts ORDER BY name",
    ).unwrap();
    let accounts: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "group_id": row.get::<_, i64>(1)?,
            "name": row.get::<_, String>(2)?,
            "initial_balance": row.get::<_, f64>(3)?,
            "currency": row.get::<_, String>(4)?,
            "created_at": row.get::<_, String>(5)?
        }))
    }).unwrap().filter_map(Result::ok).collect();

    let mut stmt = conn.prepare("SELECT id, name, type, parent_id FROM categories ORDER BY name").unwrap();
    let categories: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "name": row.get::<_, String>(1)?,
            "type": row.get::<_, String>(2)?,
            "parent_id": row.get::<_, Option<i64>>(3)?
        }))
    }).unwrap().filter_map(Result::ok).collect();

    let mut stmt = conn.prepare(
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
    ).unwrap();
    let transactions: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "transaction": {
                "id": row.get::<_, i64>(0)?,
                "date": row.get::<_, String>(1)?,
                "transaction_type": row.get::<_, String>(2)?,
                "amount": row.get::<_, f64>(3)?,
                "account_id": row.get::<_, i64>(4)?,
                "to_account_id": row.get::<_, Option<i64>>(5)?,
                "category_id": row.get::<_, Option<i64>>(6)?,
                "memo": row.get::<_, Option<String>>(7)?,
                "photo_path": row.get::<_, Option<String>>(8)?,
                "created_at": row.get::<_, String>(9)?
            },
            "account_name": row.get::<_, String>(10)?,
            "to_account_name": row.get::<_, Option<String>>(11)?,
            "category_name": row.get::<_, Option<String>>(12)?
        }))
    }).unwrap().filter_map(Result::ok).collect();

    let mut stmt = conn.prepare("SELECT id, category_id, amount, period, start_date FROM budgets ORDER BY id").unwrap();
    let budgets: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "category_id": row.get::<_, i64>(1)?,
            "amount": row.get::<_, f64>(2)?,
            "period": row.get::<_, String>(3)?,
            "start_date": row.get::<_, String>(4)?
        }))
    }).unwrap().filter_map(Result::ok).collect();

    let mut stmt = conn.prepare("SELECT id, transaction_id, filename, created_at FROM transaction_photos ORDER BY id").unwrap();
    let transaction_photos: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "transaction_id": row.get::<_, i64>(1)?,
            "filename": row.get::<_, String>(2)?,
            "created_at": row.get::<_, String>(3)?
        }))
    }).unwrap().filter_map(Result::ok).collect();

    let mut stmt = conn.prepare("SELECT id, name, color, created_at FROM tags ORDER BY id").unwrap();
    let tags: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "name": row.get::<_, String>(1)?,
            "color": row.get::<_, String>(2)?,
            "created_at": row.get::<_, String>(3)?
        }))
    }).unwrap().filter_map(Result::ok).collect();

    let mut stmt = conn.prepare("SELECT transaction_id, tag_id FROM transaction_tags").unwrap();
    let transaction_tags: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "transaction_id": row.get::<_, i64>(0)?,
            "tag_id": row.get::<_, i64>(1)?
        }))
    }).unwrap().filter_map(Result::ok).collect();

    let mut stmt = conn.prepare("SELECT id, name, target_amount, target_date, linked_account_id, color, icon, status, created_at, updated_at FROM savings_goals ORDER BY id").unwrap();
    let savings_goals: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "name": row.get::<_, String>(1)?,
            "target_amount": row.get::<_, f64>(2)?,
            "target_date": row.get::<_, Option<String>>(3)?,
            "linked_account_id": row.get::<_, Option<i64>>(4)?,
            "color": row.get::<_, String>(5)?,
            "icon": row.get::<_, String>(6)?,
            "status": row.get::<_, String>(7)?,
            "created_at": row.get::<_, String>(8)?,
            "updated_at": row.get::<_, String>(9)?
        }))
    }).unwrap().filter_map(Result::ok).collect();

    let mut stmt = conn.prepare("SELECT id, goal_id, amount, contribution_date, note, created_at FROM goal_contributions ORDER BY id").unwrap();
    let goal_contributions: Vec<serde_json::Value> = stmt.query_map([], |row| {
        Ok(serde_json::json!({
            "id": row.get::<_, i64>(0)?,
            "goal_id": row.get::<_, i64>(1)?,
            "amount": row.get::<_, f64>(2)?,
            "contribution_date": row.get::<_, String>(3)?,
            "note": row.get::<_, Option<String>>(4)?,
            "created_at": row.get::<_, String>(5)?
        }))
    }).unwrap().filter_map(Result::ok).collect();

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

    serde_json::to_string_pretty(&backup).map_err(|e| format!("Failed to serialize backup: {}", e))
}

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

        if name.starts_with("money_manager_backup_") && name.ends_with(".zip") {
            if let Ok(metadata) = fs::metadata(&path) {
                if let Ok(modified) = metadata.modified() {
                    backups.push((path, modified));
                }
            }
        }
    }

    backups.sort_by(|a, b| b.1.cmp(&a.1));

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

fn is_backup_due(last_run: &str, frequency: &str) -> bool {
    if last_run.is_empty() {
        return true;
    }

    let last = match chrono::DateTime::parse_from_rfc3339(last_run) {
        Ok(dt) => dt.with_timezone(&chrono::Utc),
        Err(_) => return true,
    };

    let now = chrono::Utc::now();
    let elapsed = now.signed_duration_since(last);

    match frequency {
        "DAILY" => elapsed.num_hours() >= 24,
        "WEEKLY" => elapsed.num_days() >= 7,
        "MONTHLY" => elapsed.num_days() >= 30,
        _ => elapsed.num_days() >= 7,
    }
}

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
