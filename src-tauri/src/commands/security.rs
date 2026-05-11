// File: src-tauri/src/commands/security.rs
use crate::db;
use crate::AppState;
use rusqlite::params;
use serde::Serialize;
use tauri::State;

#[derive(Debug, Serialize)]
pub struct SecurityStatus {
    pub pin_enabled: bool,
    pub lock_timeout: i64,
    pub db_encrypted: bool,
}

// ======================== ENCRYPTION COMMANDS ========================

/// Check if the database is encrypted (can be called before unlock)
#[tauri::command]
pub fn is_db_encrypted(state: State<'_, AppState>) -> Result<bool, String> {
    let config = db::encryption::read_config(&state.app_data_dir);
    Ok(config.map(|c| c.encrypted).unwrap_or(false))
}

/// Unlock an encrypted database with the master password
#[tauri::command]
pub fn unlock_database(state: State<'_, AppState>, password: String) -> Result<bool, String> {
    let config = db::encryption::read_config(&state.app_data_dir)
        .ok_or_else(|| "No encryption config found".to_string())?;

    if !config.encrypted {
        return Err("Database is not encrypted".to_string());
    }

    // Verify password
    if !db::encryption::verify_password(&password, &config.password_verify_hash) {
        return Ok(false);
    }

    // Derive key and open database
    let key = db::encryption::derive_key(&password, &config.salt)?;
    let pool = db::init_database_encrypted(&state.db_path, &key)
        .map_err(|e| format!("Failed to unlock database: {}", e))?;

    // Store the pool in state
    let mut db_guard = state.db.lock().map_err(|_| "Lock poisoned".to_string())?;
    *db_guard = Some(pool);

    println!("Database unlocked successfully");
    Ok(true)
}

/// Set a master password on an unencrypted database.
/// This encrypts the database and saves the config.
#[tauri::command]
pub fn set_master_password(
    state: State<'_, AppState>,
    password: String,
) -> Result<(), String> {
    if password.len() < 6 {
        return Err("Master password must be at least 6 characters".to_string());
    }

    // Check that we currently have an unencrypted database
    let existing_config = db::encryption::read_config(&state.app_data_dir);
    if existing_config.map(|c| c.encrypted).unwrap_or(false) {
        return Err("Database is already encrypted".to_string());
    }

    // Generate salt and derive key
    let salt = db::encryption::generate_salt();
    let key = db::encryption::derive_key(&password, &salt)?;
    let verify_hash = db::encryption::create_verify_hash(&password)?;

    // Encrypt the database
    let encrypted_path = state.db_path.with_extension("db.encrypted");
    db::encrypt_database(&state.db_path, &encrypted_path, &key)
        .map_err(|e| format!("Failed to encrypt database: {}", e))?;

    // Swap files: rename encrypted to original
    let backup_path = state.db_path.with_extension("db.unencrypted_backup");
    std::fs::rename(&state.db_path, &backup_path)
        .map_err(|e| format!("Failed to backup original database: {}", e))?;
    std::fs::rename(&encrypted_path, &state.db_path)
        .map_err(|e| format!("Failed to replace database: {}", e))?;

    // Save encryption config
    let config = db::encryption::EncryptionConfig {
        encrypted: true,
        salt,
        created_at: chrono::Utc::now().to_rfc3339(),
        password_verify_hash: verify_hash,
    };
    db::encryption::write_config(&state.app_data_dir, &config)?;

    // Re-open the database with the key
    let pool = db::init_database_encrypted(&state.db_path, &key)
        .map_err(|e| format!("Failed to open encrypted database: {}", e))?;

    let mut db_guard = state.db.lock().map_err(|_| "Lock poisoned".to_string())?;
    *db_guard = Some(pool);

    // Clean up backup (optional — keep it for safety)
    println!("Database encrypted successfully. Backup at: {}", backup_path.display());

    Ok(())
}

/// Change the master password. Re-encrypts the database with a new key.
#[tauri::command]
pub fn change_master_password(
    state: State<'_, AppState>,
    current_password: String,
    new_password: String,
) -> Result<(), String> {
    if new_password.len() < 6 {
        return Err("New password must be at least 6 characters".to_string());
    }

    let config = db::encryption::read_config(&state.app_data_dir)
        .ok_or_else(|| "No encryption config found".to_string())?;

    if !config.encrypted {
        return Err("Database is not encrypted".to_string());
    }

    // Verify current password
    if !db::encryption::verify_password(&current_password, &config.password_verify_hash) {
        return Err("Current password is incorrect".to_string());
    }

    // Derive old and new keys
    let _old_key = db::encryption::derive_key(&current_password, &config.salt)?;
    let new_salt = db::encryption::generate_salt();
    let new_key = db::encryption::derive_key(&new_password, &new_salt)?;
    let new_verify_hash = db::encryption::create_verify_hash(&new_password)?;

    // Re-key the database using PRAGMA rekey
    {
        let db_guard = state.db.lock().map_err(|_| "Lock poisoned".to_string())?;
        let pool = db_guard
            .as_ref()
            .ok_or_else(|| "Database is locked".to_string())?;
        let conn = pool.lock().map_err(|_| "Connection lock poisoned".to_string())?;
        conn.execute_batch(&format!("PRAGMA rekey = \"x'{}'\";", new_key))
            .map_err(|e| format!("Failed to re-key database: {}", e))?;
    }

    // Update config
    let new_config = db::encryption::EncryptionConfig {
        encrypted: true,
        salt: new_salt,
        created_at: config.created_at,
        password_verify_hash: new_verify_hash,
    };
    db::encryption::write_config(&state.app_data_dir, &new_config)?;

    println!("Master password changed successfully");
    Ok(())
}

/// Remove encryption from the database (requires current password).
#[tauri::command]
pub fn remove_encryption(
    state: State<'_, AppState>,
    password: String,
) -> Result<(), String> {
    let config = db::encryption::read_config(&state.app_data_dir)
        .ok_or_else(|| "No encryption config found".to_string())?;

    if !config.encrypted {
        return Err("Database is not already encrypted".to_string());
    }

    // Verify password
    if !db::encryption::verify_password(&password, &config.password_verify_hash) {
        return Err("Password is incorrect".to_string());
    }

    // Decrypt: use PRAGMA rekey with empty key
    {
        let db_guard = state.db.lock().map_err(|_| "Lock poisoned".to_string())?;
        let pool = db_guard
            .as_ref()
            .ok_or_else(|| "Database is locked".to_string())?;
        let conn = pool.lock().map_err(|_| "Connection lock poisoned".to_string())?;
        conn.execute_batch("PRAGMA rekey = '';")
            .map_err(|e| format!("Failed to remove encryption: {}", e))?;
    }

    // Remove encryption config
    let config_path = db::encryption::config_path(&state.app_data_dir);
    if config_path.exists() {
        std::fs::remove_file(&config_path)
            .map_err(|e| format!("Failed to remove encryption config: {}", e))?;
    }

    println!("Database encryption removed");
    Ok(())
}

// ======================== PIN COMMANDS ========================

#[tauri::command]
pub fn set_pin(state: State<'_, AppState>, pin: String) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let hash = bcrypt::hash(&pin, bcrypt::DEFAULT_COST)
        .map_err(|e| format!("Failed to hash PIN: {}", e))?;

    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ('pin_hash', ?1, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![hash],
    )
    .map_err(|e| format!("Failed to save PIN: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn verify_pin(state: State<'_, AppState>, pin: String) -> Result<bool, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let hash: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'pin_hash'",
            [],
            |row| row.get(0),
        )
        .ok();

    match hash {
        Some(h) if !h.is_empty() => {
            match bcrypt::verify(&pin, &h) {
                Ok(true) => Ok(true),
                Ok(false) => Err("Incorrect PIN".to_string()),
                Err(e) => Err(format!("Hash error: {}", e)),
            }
        }
        _ => Err("No PIN set".to_string()),
    }
}

#[tauri::command]
pub fn remove_pin(state: State<'_, AppState>, pin: String) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    // Verify current PIN first
    let hash: String = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'pin_hash'",
            [],
            |row| row.get(0),
        )
        .map_err(|_| "No PIN set".to_string())?;

    if hash.is_empty() {
        return Err("No PIN set".to_string());
    }

    if !bcrypt::verify(&pin, &hash).unwrap_or(false) {
        return Err("Incorrect PIN".to_string());
    }

    conn.execute("DELETE FROM app_settings WHERE key = 'pin_hash'", [])
        .map_err(|e| format!("Failed to remove PIN: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn is_pin_enabled(state: State<'_, AppState>) -> Result<bool, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let hash: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'pin_hash'",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(hash.map(|h| !h.is_empty()).unwrap_or(false))
}

#[tauri::command]
pub fn get_lock_timeout(state: State<'_, AppState>) -> Result<i64, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let timeout: Option<String> = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'lock_timeout'",
            [],
            |row| row.get(0),
        )
        .ok();

    Ok(timeout
        .and_then(|v| v.parse().ok())
        .unwrap_or(5))
}

#[tauri::command]
pub fn set_lock_timeout(state: State<'_, AppState>, minutes: i64) -> Result<(), String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    conn.execute(
        "INSERT INTO app_settings (key, value, updated_at) VALUES ('lock_timeout', ?1, datetime('now'))
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![minutes.to_string()],
    )
    .map_err(|e| format!("Failed to save lock timeout: {}", e))?;

    Ok(())
}

#[tauri::command]
pub fn get_security_status(state: State<'_, AppState>) -> Result<SecurityStatus, String> {
    let pool = crate::get_db(&state)?;
    let conn = pool.lock().map_err(|_| "DB lock error".to_string())?;

    let pin_enabled = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'pin_hash'",
            [],
            |row| row.get::<_, String>(0),
        )
        .map(|h| !h.is_empty())
        .unwrap_or(false);

    let lock_timeout: i64 = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = 'lock_timeout'",
            [],
            |row| row.get::<_, String>(0),
        )
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(5);

    let db_encrypted = db::encryption::read_config(&state.app_data_dir)
        .map(|c| c.encrypted)
        .unwrap_or(false);

    Ok(SecurityStatus {
        pin_enabled,
        lock_timeout,
        db_encrypted,
    })
}
