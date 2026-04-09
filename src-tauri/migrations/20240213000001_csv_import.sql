-- CSV Import support: batch tracking + import history

-- Add import_batch_id to transactions for undo support
ALTER TABLE transactions ADD COLUMN import_batch_id TEXT;

-- Import history table
CREATE TABLE IF NOT EXISTS import_history (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    batch_id TEXT NOT NULL UNIQUE,
    filename TEXT NOT NULL,
    total_rows INTEGER NOT NULL DEFAULT 0,
    imported_count INTEGER NOT NULL DEFAULT 0,
    skipped_count INTEGER NOT NULL DEFAULT 0,
    error_count INTEGER NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'COMPLETED' CHECK(status IN ('COMPLETED', 'UNDONE')),
    imported_at TEXT NOT NULL DEFAULT (datetime('now')),
    can_undo_until TEXT NOT NULL
);
