// File: src-tauri/src/commands/security.rs
use bcrypt::{hash, verify, DEFAULT_COST};
use sqlx::{Row, SqlitePool};
use tauri::State;

const MAX_FAILED_ATTEMPTS: i32 = 5;
const LOCKOUT_SECONDS: i64 = 30;
const MIN_PIN_LENGTH: usize = 4;
const MAX_PIN_LENGTH: usize = 8;

// ======================== PIN MANAGEMENT ========================

/// Set a new PIN (or change existing PIN).
/// Requires current_pin if a PIN is already set.
#[tauri::command]
pub async fn set_pin(
    pool: State<'_, SqlitePool>,
    new_pin: String,
    current_pin: Option<String>,
) -> Result<(), String> {
    // Validate new PIN format
    validate_pin_format(&new_pin)?;

    // If PIN is already enabled, verify current PIN first
    let pin_enabled = get_setting(pool.inner(), "pin_enabled").await?;
    if pin_enabled == "true" {
        let current =
            current_pin.ok_or_else(|| "Current PIN is required to change your PIN".to_string())?;
        verify_pin_internal(pool.inner(), &current).await?;
    }

    // Hash the new PIN with bcrypt
    let hashed =
        hash(new_pin.as_bytes(), DEFAULT_COST).map_err(|e| format!("Failed to hash PIN: {}", e))?;

    // Store hash and enable PIN
    set_setting(pool.inner(), "pin_hash", &hashed).await?;
    set_setting(pool.inner(), "pin_enabled", "true").await?;
    set_setting(pool.inner(), "failed_attempts", "0").await?;
    set_setting(pool.inner(), "lockout_until", "").await?;

    Ok(())
}

/// Verify a PIN attempt. Returns Ok(true) on success.
/// Tracks failed attempts and enforces lockout.
#[tauri::command]
pub async fn verify_pin(pool: State<'_, SqlitePool>, pin: String) -> Result<bool, String> {
    // Check if locked out
    check_lockout(pool.inner()).await?;

    match verify_pin_internal(pool.inner(), &pin).await {
        Ok(_) => {
            // Reset failed attempts on success
            set_setting(pool.inner(), "failed_attempts", "0").await?;
            set_setting(pool.inner(), "lockout_until", "").await?;
            Ok(true)
        }
        Err(_) => {
            // Increment failed attempts
            let attempts_str = get_setting(pool.inner(), "failed_attempts").await?;
            let attempts: i32 = attempts_str.parse().unwrap_or(0) + 1;
            set_setting(pool.inner(), "failed_attempts", &attempts.to_string()).await?;

            // Enforce lockout after max attempts
            if attempts >= MAX_FAILED_ATTEMPTS {
                let lockout_time = chrono::Utc::now() + chrono::Duration::seconds(LOCKOUT_SECONDS);
                set_setting(pool.inner(), "lockout_until", &lockout_time.to_rfc3339()).await?;

                return Err(format!(
                    "Too many failed attempts. Locked for {} seconds.",
                    LOCKOUT_SECONDS
                ));
            }

            let remaining = MAX_FAILED_ATTEMPTS - attempts;
            Err(format!(
                "Incorrect PIN. {} attempt{} remaining.",
                remaining,
                if remaining == 1 { "" } else { "s" }
            ))
        }
    }
}

/// Remove the PIN lock entirely. Requires current PIN for verification.
#[tauri::command]
pub async fn remove_pin(pool: State<'_, SqlitePool>, current_pin: String) -> Result<(), String> {
    // Verify current PIN first
    verify_pin_internal(pool.inner(), &current_pin).await?;

    // Clear PIN data
    set_setting(pool.inner(), "pin_hash", "").await?;
    set_setting(pool.inner(), "pin_enabled", "false").await?;
    set_setting(pool.inner(), "failed_attempts", "0").await?;
    set_setting(pool.inner(), "lockout_until", "").await?;

    Ok(())
}

// ======================== STATUS QUERIES ========================

/// Check if PIN lock is enabled
#[tauri::command]
pub async fn is_pin_enabled(pool: State<'_, SqlitePool>) -> Result<bool, String> {
    let enabled = get_setting(pool.inner(), "pin_enabled").await?;
    Ok(enabled == "true")
}

/// Get the auto-lock timeout in minutes (0 = never)
#[tauri::command]
pub async fn get_lock_timeout(pool: State<'_, SqlitePool>) -> Result<i32, String> {
    let timeout_str = get_setting(pool.inner(), "lock_timeout_minutes").await?;
    Ok(timeout_str.parse().unwrap_or(5))
}

/// Set the auto-lock timeout in minutes (0 = never)
#[tauri::command]
pub async fn set_lock_timeout(pool: State<'_, SqlitePool>, minutes: i32) -> Result<(), String> {
    if minutes < 0 {
        return Err("Timeout cannot be negative".to_string());
    }
    set_setting(pool.inner(), "lock_timeout_minutes", &minutes.to_string()).await?;
    Ok(())
}

/// Get security status (for frontend display)
#[tauri::command]
pub async fn get_security_status(pool: State<'_, SqlitePool>) -> Result<SecurityStatus, String> {
    let pin_enabled = get_setting(pool.inner(), "pin_enabled").await? == "true";
    let timeout: i32 = get_setting(pool.inner(), "lock_timeout_minutes")
        .await?
        .parse()
        .unwrap_or(5);
    let failed_attempts: i32 = get_setting(pool.inner(), "failed_attempts")
        .await?
        .parse()
        .unwrap_or(0);
    let lockout_until = get_setting(pool.inner(), "lockout_until").await?;

    let is_locked_out = if lockout_until.is_empty() {
        false
    } else {
        match chrono::DateTime::parse_from_rfc3339(&lockout_until) {
            Ok(lockout_time) => chrono::Utc::now() < lockout_time,
            Err(_) => false,
        }
    };

    Ok(SecurityStatus {
        pin_enabled,
        lock_timeout_minutes: timeout,
        failed_attempts,
        is_locked_out,
    })
}

// ======================== INTERNAL HELPERS ========================

fn validate_pin_format(pin: &str) -> Result<(), String> {
    if pin.len() < MIN_PIN_LENGTH || pin.len() > MAX_PIN_LENGTH {
        return Err(format!(
            "PIN must be {}-{} digits",
            MIN_PIN_LENGTH, MAX_PIN_LENGTH
        ));
    }
    if !pin.chars().all(|c| c.is_ascii_digit()) {
        return Err("PIN must contain only digits (0-9)".to_string());
    }
    Ok(())
}

async fn verify_pin_internal(pool: &SqlitePool, pin: &str) -> Result<(), String> {
    let stored_hash = get_setting(pool, "pin_hash").await?;
    if stored_hash.is_empty() {
        return Err("No PIN is set".to_string());
    }

    let valid = verify(pin.as_bytes(), &stored_hash)
        .map_err(|e| format!("PIN verification error: {}", e))?;

    if valid {
        Ok(())
    } else {
        Err("Incorrect PIN".to_string())
    }
}

async fn check_lockout(pool: &SqlitePool) -> Result<(), String> {
    let lockout_until = get_setting(pool, "lockout_until").await?;
    if lockout_until.is_empty() {
        return Ok(());
    }

    match chrono::DateTime::parse_from_rfc3339(&lockout_until) {
        Ok(lockout_time) => {
            let now = chrono::Utc::now();
            let lockout_time_utc = lockout_time.with_timezone(&chrono::Utc);
            if now < lockout_time_utc {
                let remaining = (lockout_time_utc - now).num_seconds();
                Err(format!(
                    "Account locked. Try again in {} second{}.",
                    remaining,
                    if remaining == 1 { "" } else { "s" }
                ))
            } else {
                // Lockout expired, reset
                set_setting(pool, "failed_attempts", "0").await?;
                set_setting(pool, "lockout_until", "").await?;
                Ok(())
            }
        }
        Err(_) => {
            // Invalid date, clear it
            set_setting(pool, "lockout_until", "").await?;
            Ok(())
        }
    }
}

async fn get_setting(pool: &SqlitePool, key: &str) -> Result<String, String> {
    let row = sqlx::query("SELECT value FROM app_settings WHERE key = ?")
        .bind(key)
        .fetch_optional(pool)
        .await
        .map_err(|e| format!("Failed to read setting '{}': {}", key, e))?;

    match row {
        Some(r) => Ok(r.get("value")),
        None => Ok(String::new()),
    }
}

async fn set_setting(pool: &SqlitePool, key: &str, value: &str) -> Result<(), String> {
    sqlx::query(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?, ?, datetime('now'))
        ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = datetime('now')
        "#,
    )
    .bind(key)
    .bind(value)
    .execute(pool)
    .await
    .map_err(|e| format!("Failed to write setting '{}': {}", key, e))?;

    Ok(())
}

// ======================== RESPONSE TYPES ========================

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct SecurityStatus {
    pub pin_enabled: bool,
    pub lock_timeout_minutes: i32,
    pub failed_attempts: i32,
    pub is_locked_out: bool,
}
