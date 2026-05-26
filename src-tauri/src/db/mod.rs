// File: src-tauri/src/db/mod.rs
// SQLCipher-enabled database module using rusqlite
pub mod encryption;
use anyhow::Result;
use rusqlite::Connection;
use std::path::Path;
use std::sync::{Arc, Mutex};

/// Thread-safe database connection wrapper.
/// All command handlers lock this mutex to run queries.
pub type DbPool = Arc<Mutex<Connection>>;

/// Open a SQLCipher-encrypted database connection and run migrations.
/// `key` is the hex-encoded 256-bit key derived from the master password.
pub fn init_database_encrypted(db_path: &Path, key: &str) -> Result<DbPool> {
    let conn = Connection::open(db_path)?;

    // Apply the SQLCipher encryption key
    conn.execute_batch(&format!("PRAGMA key = \"x'{}'\";", key))?;

    // Enable WAL mode and foreign keys
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;",
    )?;

    // Run migrations
    run_migrations(&conn)?;

    Ok(Arc::new(Mutex::new(conn)))
}

/// Open an UNENCRYPTED database connection and run migrations.
/// Used for first launch before the user sets a master password,
/// and for the migration wizard source database.
pub fn init_database_unencrypted(db_path: &Path) -> Result<DbPool> {
    let conn = Connection::open(db_path)?;

    // Enable WAL mode and foreign keys
    conn.execute_batch(
        "PRAGMA journal_mode = WAL;
         PRAGMA foreign_keys = ON;",
    )?;

    // Run migrations
    run_migrations(&conn)?;

    Ok(Arc::new(Mutex::new(conn)))
}

/// Encrypt an existing unencrypted database into a new SQLCipher-encrypted file.
/// Uses ATTACH + sqlcipher_export() to copy all data.
/// Returns Ok(()) on success. The caller should then swap the files.
pub fn encrypt_database(
    unencrypted_path: &Path,
    encrypted_path: &Path,
    key: &str,
) -> Result<()> {
    // Remove target if it exists
    if encrypted_path.exists() {
        std::fs::remove_file(encrypted_path)?;
    }

    // Open the unencrypted source
    let conn = Connection::open(unencrypted_path)?;

    // Attach the new encrypted database
    let encrypted_path_str = encrypted_path.to_string_lossy();
    conn.execute_batch(&format!(
        "ATTACH DATABASE '{}' AS encrypted KEY \"x'{}'\";",
        encrypted_path_str, key
    ))?;

    // Export all data from the unencrypted database to the encrypted one
    conn.execute_batch("SELECT sqlcipher_export('encrypted');")?;

    // Detach
    conn.execute_batch("DETACH DATABASE encrypted;")?;

    Ok(())
}

/// Run all embedded migration SQL files in order.
/// Uses a simple `_migrations` table to track which have been applied.
fn run_migrations(conn: &Connection) -> Result<()> {
    // Create migrations tracking table if it doesn't exist
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS _migrations (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            applied_at TEXT NOT NULL DEFAULT (datetime('now'))
        );",
    )?;

    // Embedded migration files (in order)
    let migrations: Vec<(&str, &str)> = vec![
        (
            "20240101000001_init",
            include_str!("../../migrations/20240101000001_init.sql"),
        ),
        (
            "20240101000002_seed_data",
            include_str!("../../migrations/20240101000002_seed_data.sql"),
        ),
        (
            "20240101000003_recurring_transactions",
            include_str!("../../migrations/20240101000003_recurring_transactions.sql"),
        ),
        (
            "20240101000004_seed_test_data",
            include_str!("../../migrations/20240101000004_seed_test_data.sql"),
        ),
        (
            "20240203155900_installments",
            include_str!("../../migrations/20240203155900_installments.sql"),
        ),
        (
            "20240204000001_transaction_templates",
            include_str!("../../migrations/20240204000001_transaction_templates.sql"),
        ),
        (
            "20240205000001_credit_card_settings",
            include_str!("../../migrations/20240205000001_credit_card_settings.sql"),
        ),
        (
            "20240206000001_currency_management",
            include_str!("../../migrations/20240206000001_currency_management.sql"),
        ),
        (
            "20240207000001_security",
            include_str!("../../migrations/20240207000001_security.sql"),
        ),
        (
            "20240208000001_net_worth",
            include_str!("../../migrations/20240208000001_net_worth.sql"),
        ),
        (
            "20240209000001_transaction_photos",
            include_str!("../../migrations/20240209000001_transaction_photos.sql"),
        ),
        (
            "20240210000001_auto_backup_settings",
            include_str!("../../migrations/20240210000001_auto_backup_settings.sql"),
        ),
        (
            "20240211000001_savings_goals",
            include_str!("../../migrations/20240211000001_savings_goals.sql"),
        ),
        (
            "20240212000001_tags",
            include_str!("../../migrations/20240212000001_tags.sql"),
        ),
        (
            "20240213000001_csv_import",
            include_str!("../../migrations/20240213000001_csv_import.sql"),
        ),
        (
            "20240214000001_advanced_export_and_cleaning",
            include_str!("../../migrations/20240214000001_advanced_export_and_cleaning.sql"),
        ),
        (
            "20240215000001_recurring_improvements",
            include_str!("../../migrations/20240215000001_recurring_improvements.sql"),
        ),
        (
            "20240216000001_recurring_approval_mode",
            include_str!("../../migrations/20240216000001_recurring_approval_mode.sql"),
        ),
        (
            "20240217000001_goal_allocations",
            include_str!("../../migrations/20240217000001_goal_allocations.sql"),
        ),
    ];

    for (name, sql) in &migrations {
        // Check if already applied
        let applied: bool = conn
            .query_row(
                "SELECT COUNT(*) FROM _migrations WHERE name = ?1",
                rusqlite::params![name],
                |row| row.get::<_, i64>(0),
            )
            .map(|count| count > 0)
            .unwrap_or(false);

        if !applied {
            // Execute the migration SQL
            // Split by semicolons and execute each statement, skipping comments and empty
            conn.execute_batch(sql)?;

            // Record it
            conn.execute(
                "INSERT INTO _migrations (name) VALUES (?1)",
                rusqlite::params![name],
            )?;

            println!("Applied migration: {}", name);
        }
    }

    Ok(())
}
