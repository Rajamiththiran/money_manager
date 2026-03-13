// File: src-tauri/src/commands/photos.rs
use sqlx::{Row, SqlitePool};
use std::fs;
use std::path::{Path, PathBuf};
use tauri::State;

const MAX_WIDTH: u32 = 1200;
const JPEG_QUALITY: u8 = 80;

// ======================== RESPONSE TYPES ========================

use serde::Serialize;

#[derive(Debug, Serialize)]
pub struct PhotoInfo {
    pub id: i64,
    pub transaction_id: i64,
    pub filename: String,
    pub full_path: String,
}

#[derive(Debug, Serialize)]
pub struct CleanupResult {
    pub files_deleted: i64,
    pub bytes_freed: i64,
}

// ======================== ATTACH PHOTO ========================

/// Copy+compress the selected image into the app's photos directory
/// and link it to the transaction in the transaction_photos table.
/// Supports multiple photos per transaction.
#[tauri::command]
pub async fn attach_photo(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    transaction_id: i64,
    source_path: String,
) -> Result<PhotoInfo, String> {
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

    // 5. Generate unique filename using timestamp
    let timestamp = chrono::Utc::now().format("%Y%m%d_%H%M%S_%3f");
    let filename = format!("receipt_{}_{}.jpg", transaction_id, timestamp);
    let dest_path = photos_dir.join(&filename);

    // 6. Compress and save the image
    compress_and_save(&source_path, &dest_path)?;

    // 7. Insert into transaction_photos table
    let result = sqlx::query(
        "INSERT INTO transaction_photos (transaction_id, filename) VALUES (?, ?)",
    )
    .bind(transaction_id)
    .bind(&filename)
    .execute(pool.inner())
    .await
    .map_err(|e| format!("Failed to save photo record: {}", e))?;

    let photo_id = result.last_insert_rowid();

    // 8. Return the photo info
    let full_path = dest_path
        .to_str()
        .unwrap_or("")
        .to_string();

    Ok(PhotoInfo {
        id: photo_id,
        transaction_id,
        filename,
        full_path,
    })
}

// ======================== REMOVE PHOTO ========================

/// Remove a specific photo by its ID from the transaction_photos table
/// and delete the file from disk.
#[tauri::command]
pub async fn remove_photo(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    photo_id: i64,
) -> Result<(), String> {
    // Get the photo record
    let row = sqlx::query("SELECT filename FROM transaction_photos WHERE id = ?")
        .bind(photo_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| format!("Photo {} not found", photo_id))?;

    let filename: String = row.get("filename");

    // Delete the file from disk
    let photos_dir = get_photos_dir(&app_handle)?;
    let full_path = photos_dir.join(&filename);
    if full_path.exists() {
        fs::remove_file(&full_path)
            .map_err(|e| format!("Failed to delete photo file: {}", e))?;
    }

    // Delete the record from DB
    sqlx::query("DELETE FROM transaction_photos WHERE id = ?")
        .bind(photo_id)
        .execute(pool.inner())
        .await
        .map_err(|e| format!("Failed to delete photo record: {}", e))?;

    Ok(())
}

// ======================== GET TRANSACTION PHOTOS ========================

/// Get all photos for a given transaction.
/// Returns a list of PhotoInfo with resolved full paths.
#[tauri::command]
pub async fn get_transaction_photos(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    transaction_id: i64,
) -> Result<Vec<PhotoInfo>, String> {
    let rows = sqlx::query(
        "SELECT id, transaction_id, filename FROM transaction_photos WHERE transaction_id = ? ORDER BY created_at ASC",
    )
    .bind(transaction_id)
    .fetch_all(pool.inner())
    .await
    .map_err(|e| format!("Database error: {}", e))?;

    let photos_dir = get_photos_dir(&app_handle)?;
    let mut photos = Vec::new();

    for row in &rows {
        let id: i64 = row.get("id");
        let txn_id: i64 = row.get("transaction_id");
        let filename: String = row.get("filename");
        let full_path = photos_dir.join(&filename);

        if full_path.exists() {
            photos.push(PhotoInfo {
                id,
                transaction_id: txn_id,
                filename,
                full_path: full_path.to_str().unwrap_or("").to_string(),
            });
        } else {
            // File missing on disk — clean up the DB record
            let _ = sqlx::query("DELETE FROM transaction_photos WHERE id = ?")
                .bind(id)
                .execute(pool.inner())
                .await;
        }
    }

    Ok(photos)
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

    // Get all photo filenames referenced in the DB (new table)
    let rows = sqlx::query("SELECT filename FROM transaction_photos")
        .fetch_all(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?;

    let referenced: std::collections::HashSet<String> = rows
        .iter()
        .map(|r| r.get::<String, _>("filename"))
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

// ======================== SAVE/DOWNLOAD PHOTO ========================

/// Copy a photo to a user-chosen destination path (Save As).
#[tauri::command]
pub async fn save_photo_to(
    app_handle: tauri::AppHandle,
    pool: State<'_, SqlitePool>,
    photo_id: i64,
    dest_path: String,
) -> Result<(), String> {
    // Get the photo record
    let row = sqlx::query("SELECT filename FROM transaction_photos WHERE id = ?")
        .bind(photo_id)
        .fetch_optional(pool.inner())
        .await
        .map_err(|e| format!("Database error: {}", e))?
        .ok_or_else(|| format!("Photo {} not found", photo_id))?;

    let filename: String = row.get("filename");
    let photos_dir = get_photos_dir(&app_handle)?;
    let source = photos_dir.join(&filename);

    if !source.exists() {
        return Err("Photo file not found on disk".to_string());
    }

    fs::copy(&source, &dest_path)
        .map_err(|e| format!("Failed to save photo: {}", e))?;

    Ok(())
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