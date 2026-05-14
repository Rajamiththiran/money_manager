// File: src-tauri/src/db/encryption.rs
// Master password management: key derivation, salt storage, config file
use argon2::{
    password_hash::{PasswordHasher, SaltString},
    Argon2,
};
use base64::{engine::general_purpose::STANDARD as BASE64, Engine};
use rand::rngs::OsRng;
use serde::{Deserialize, Serialize};
use std::path::{Path, PathBuf};

/// Encryption configuration stored as JSON in app data directory.
/// This file lives OUTSIDE the encrypted database so it can be read
/// before we have the password.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct EncryptionConfig {
    pub encrypted: bool,
    pub salt: String, // base64-encoded 32-byte salt
    pub created_at: String,
    /// Hash of the derived key, used to verify password correctness
    /// without opening the database. This is a separate Argon2 hash.
    pub password_verify_hash: String,
}

/// Get the path to the encryption config file.
pub fn config_path(app_data_dir: &Path) -> PathBuf {
    app_data_dir.join("encryption_config.json")
}

/// Read the encryption config file. Returns None if it doesn't exist.
pub fn read_config(app_data_dir: &Path) -> Option<EncryptionConfig> {
    let path = config_path(app_data_dir);
    if !path.exists() {
        return None;
    }
    let contents = std::fs::read_to_string(&path).ok()?;
    serde_json::from_str(&contents).ok()
}

/// Write the encryption config file.
pub fn write_config(app_data_dir: &Path, config: &EncryptionConfig) -> Result<(), String> {
    let path = config_path(app_data_dir);
    let json = serde_json::to_string_pretty(config)
        .map_err(|e| format!("Failed to serialize encryption config: {}", e))?;
    std::fs::write(&path, json)
        .map_err(|e| format!("Failed to write encryption config: {}", e))?;
    Ok(())
}

/// Generate a new random 32-byte salt and return it as base64.
pub fn generate_salt() -> String {
    let mut salt_bytes = [0u8; 32];
    use rand::RngCore;
    OsRng.fill_bytes(&mut salt_bytes);
    BASE64.encode(salt_bytes)
}

/// Derive a 256-bit (32-byte) hex key from a password + salt.
/// Uses Argon2id for key derivation.
/// Returns a 64-character hex string suitable for PRAGMA key.
pub fn derive_key(password: &str, salt_b64: &str) -> Result<String, String> {
    let salt_bytes = BASE64
        .decode(salt_b64)
        .map_err(|e| format!("Invalid salt: {}", e))?;

    // Use raw Argon2 to derive key bytes
    let argon2 = Argon2::default();

    let mut key = [0u8; 32];
    argon2
        .hash_password_into(password.as_bytes(), &salt_bytes, &mut key)
        .map_err(|e| format!("Key derivation failed: {}", e))?;

    // Convert to hex string
    Ok(hex_encode(&key))
}

/// Create a verification hash for the password.
/// This is stored in the config file so we can quickly check if the
/// password is correct without trying to open the database.
pub fn create_verify_hash(password: &str) -> Result<String, String> {
    let salt = SaltString::generate(&mut OsRng);
    let argon2 = Argon2::default();
    let hash = argon2
        .hash_password(password.as_bytes(), &salt)
        .map_err(|e| format!("Failed to hash password: {}", e))?;
    Ok(hash.to_string())
}

/// Verify a password against the stored verification hash.
pub fn verify_password(password: &str, hash: &str) -> bool {
    use argon2::password_hash::PasswordHash;
    use argon2::password_hash::PasswordVerifier;

    let parsed = match PasswordHash::new(hash) {
        Ok(h) => h,
        Err(_) => return false,
    };

    Argon2::default()
        .verify_password(password.as_bytes(), &parsed)
        .is_ok()
}

/// Convert bytes to hex string
fn hex_encode(bytes: &[u8]) -> String {
    bytes.iter().map(|b| format!("{:02x}", b)).collect()
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn test_key_derivation_deterministic() {
        let salt = generate_salt();
        let key1 = derive_key("test_password", &salt).unwrap();
        let key2 = derive_key("test_password", &salt).unwrap();
        assert_eq!(key1, key2);
        assert_eq!(key1.len(), 64); // 32 bytes = 64 hex chars
    }

    #[test]
    fn test_different_passwords_different_keys() {
        let salt = generate_salt();
        let key1 = derive_key("password1", &salt).unwrap();
        let key2 = derive_key("password2", &salt).unwrap();
        assert_ne!(key1, key2);
    }

    #[test]
    fn test_verify_hash() {
        let hash = create_verify_hash("my_password").unwrap();
        assert!(verify_password("my_password", &hash));
        assert!(!verify_password("wrong_password", &hash));
    }
}
