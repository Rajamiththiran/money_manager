// File: src-tauri/src/commands/photos.rs
use sqlx::{Row, SqlitePool};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

const MAX_WIDTH: u32 = 1200;
const JPEG_QUALITY: u8 = 80;

// ======================== ATTACH PHOTO ========================

/// Open a file dialog, copy+compress the selected image into
/// the app's photos directory, and link it to the transaction.
#[tauri::command]
pub async fn attach_photo(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    transaction_id: i64,
    source_path: String,
) -> Result<String, String> {
    // 1. Validate transaction exists
    let exists = sqlx::query("SELECT id FROM transactions WHERE id = ?")
        .bind(transaction_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    if exists.is_none() {
        return Err(format!("Transaction {} not found", transaction_id));
    }

    // 2. Validate source file exists
    let source = Path::new(&source_path);
    if !source.exists() {
        return Err("Selected file does not exist".to_string());
    }

    // 3. Validate it's an image by extension
    let ext = source
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_lowercase();

    if !["jpg", "jpeg", "png", "webp", "bmp", "gif"].contains(&ext.as_str()) {
        return Err("Unsupported image format. Use JPG, PNG, WebP, BMP, or GIF.".to_string());
    }

    // 4. Create photos directory in app data
    let photos_dir = get_photos_dir(&app_handle)?;
    fs::create_dir_all(&photos_dir)
        .map_err(|e| format!("Failed to create photos directory: {}", e))?;

    // 5. Generate unique filename
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f");
    let filename = format!("receipt_{}_{}.jpg", transaction_id, timestamp);
    let dest_path = photos_dir.join(&filename);

    // 6. Compress and save the image
    compress_and_save(&source_path, &dest_path)?;

    // 7. Store the relative path in DB (just filename, not full path)
    let relative_path = filename.clone();

    // Remove old photo if one exists
    let old_photo = sqlx::query("SELECT photo_path FROM transactions WHERE id = ?")
        .bind(transaction_id)
        .fetch_one(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    let old_path: Option<String> = old_photo.get("photo_path");
    if let Some(ref old) = old_path {
        if !old.is_empty() {
            let old_full = photos_dir.join(old);
            let _ = fs::remove_file(old_full); // Best-effort delete
        }
    }

    // 8. Update transaction with new photo path
    sqlx::query("UPDATE transactions SET photo_path = ? WHERE id = ?")
        .bind(&relative_path)
        .bind(transaction_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to update photo path: {}", e))?;

    // 9. Return the full absolute path for frontend display
    let full_path = dest_path
        .to_str()
        .unwrap_or("")
        .to_string();

    Ok(full_path)
}

// ======================== REMOVE PHOTO ========================

/// Remove the photo attachment from a transaction and delete the file.
#[tauri::command]
pub async fn remove_photo(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    transaction_id: i64,
) -> Result<(), String> {
    // Get current photo path
    let row = sqlx::query("SELECT photo_path FROM transactions WHERE id = ?")
        .bind(transaction_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| format!("Transaction {} not found", transaction_id))?;

    let photo_path: Option<String> = row.get("photo_path");

    // Delete the file if it exists
    if let Some(ref filename) = photo_path {
        if !filename.is_empty() {
            let photos_dir = get_photos_dir(&app_handle)?;
            let full_path = photos_dir.join(filename);
            if full_path.exists() {
                fs::remove_file(&full_path)
                    .map_err(|e| format!("Failed to delete photo file: {}", e))?;
            }
        }
    }

    // Clear photo_path in DB
    sqlx::query("UPDATE transactions SET photo_path = NULL WHERE id = ?")
        .bind(transaction_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to clear photo path: {}", e))?;

    Ok(())
}

// ======================== GET PHOTO PATH ========================

/// Get the full absolute file path for a transaction's photo.
/// Returns None if no photo is attached.
#[tauri::command]
pub async fn get_photo_path(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    transaction_id: i64,
) -> Result<Option<String>, String> {
    let row = sqlx::query("SELECT photo_path FROM transactions WHERE id = ?")
        .bind(transaction_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    match row {
        Some(r) => {
            let photo_path: Option<String> = r.get("photo_path");
            match photo_path {
                Some(ref filename) if !filename.is_empty() => {
                    let photos_dir = get_photos_dir(&app_handle)?;
                    let full_path = photos_dir.join(filename);
                    if full_path.exists() {
                        Ok(Some(
                            full_path.to_str().unwrap_or("").to_string(),
                        ))
                    } else {
                        // File missing on disk, clear the DB reference
                        sqlx::query(
                            "UPDATE transactions SET photo_path = NULL WHERE id = ?",
                        )
                        .bind(transaction_id)
                        .execute(pool.inner())
                        .await
                        .map_err(|e| format!("Database error: {}", e))?;
                        Ok(None)
                    }
                }
                _ => Ok(None),
            }
        }
        None => Err(format!("Transaction {} not found", transaction_id)),
    }
}

// ======================== CLEANUP ORPHANS ========================

/// Find photo files on disk that are not linked to any transaction.
/// Returns the count of deleted files.
#[tauri::command]
pub async fn cleanup_orphaned_photos(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
) -> Result<CleanupResult, String> {
    let photos_dir = get_photos_dir(&app_handle)?;

    if !photos_dir.exists() {
        return Ok(CleanupResult {
            files_deleted: 0,
            bytes_freed: 0,
        });
    }

    // Get all photo filenames referenced in the DB
    let rows = sqlx::query(
        "SELECT photo_path FROM transactions WHERE photo_path IS NOT NULL AND photo_path != ''",
    )
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let referenced: std::collections::HashSet<String> = rows
        .iter()
        .map(|r| r.get::<String, _>("photo_path"))
        .collect();

    // Scan the photos directory
    let mut files_deleted: i64 = 0;
    let mut bytes_freed: i64 = 0;

    let entries = fs::read_dir(&photos_dir)
        .map_err(|e| format!("Failed to read photos directory: {}", e))?;

    for entry in entries {
        let entry = entry.map_err(|e| format!("Failed to read directory entry: {}", e))?;
        let filename = entry
            .file_name()
            .to_str()
            .unwrap_or("")
            .to_string();

        // Skip non-image files
        let lower = filename.to_lowercase();
        if !lower.ends_with(".jpg")
            && !lower.ends_with(".jpeg")
            && !lower.ends_with(".png")
            && !lower.ends_with(".webp")
        {
            continue;
        }

        // If not referenced in DB, delete it
        if !referenced.contains(&filename) {
            let full_path = photos_dir.join(&filename);
            if let Ok(metadata) = fs::metadata(&full_path) {
                bytes_freed += metadata.len() as i64;
            }
            match fs::remove_file(&full_path) {
                Ok(_) => {
                    files_deleted += 1;
                    println!("Deleted orphaned photo: {}", filename);
                }
                Err(e) => {
                    println!("Warning: Could not delete {}: {}", filename, e);
                }
            }
        }
    }

    Ok(CleanupResult {
        files_deleted,
        bytes_freed,
    })
}

// ======================== HELPERS ========================

fn get_photos_dir(app_handle: &tauri::AppHandle) -> Result<PathBuf, String> {
    use tauri::Manager;
    let app_data_dir = app_handle
        .path()
        .app_data_dir()
        .map_err(|e| format!("Failed to get app data directory: {}", e))?;

    Ok(app_data_dir.join("photos"))
}

fn compress_and_save(source_path: &str, dest_path: &Path) -> Result<(), String> {
    // Read the source image
    let img = image::open(source_path)
        .map_err(|e| format!("Failed to open image: {}", e))?;

    // Resize if wider than MAX_WIDTH (maintain aspect ratio)
    let resized = if img.width() > MAX_WIDTH {
        img.resize(
            MAX_WIDTH,
            u32::MAX, // auto-calculate height
            image::imageops::FilterType::Lanczos3,
        )
    } else {
        img
    };

    // Convert to RGB8 (drop alpha channel for JPEG)
    let rgb_image = resized.to_rgb8();

    // Save as JPEG with quality setting
    let mut output = fs::File::create(dest_path)
        .map_err(|e| format!("Failed to create output file: {}", e))?;

    let mut encoder = image::codecs::jpeg::JpegEncoder::new_with_quality(
        &mut output,
        JPEG_QUALITY,
    );

    encoder
        .encode_image(&rgb_image)
        .map_err(|e| format!("Failed to encode JPEG: {}", e))?;

    Ok(())
}

// ======================== RESPONSE TYPES ========================

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct CleanupResult {
    pub files_deleted: i64,
    pub bytes_freed: i64,
}