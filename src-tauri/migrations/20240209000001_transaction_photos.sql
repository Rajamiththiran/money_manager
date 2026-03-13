-- Migration: Add transaction_photos table for multi-photo support
-- Existing photo_path column on transactions is kept for backward compatibility
-- but new code will use this table instead.

CREATE TABLE IF NOT EXISTS transaction_photos (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    filename TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE
);

CREATE INDEX idx_transaction_photos_txn ON transaction_photos(transaction_id);

-- Migrate existing photo_path data into the new table
INSERT INTO transaction_photos (transaction_id, filename, created_at)
SELECT id, photo_path, created_at
FROM transactions
WHERE photo_path IS NOT NULL AND photo_path != '';
