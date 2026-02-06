-- File: src-tauri/migrations/20240204000001_transaction_templates.sql
-- Transaction Templates - Save frequently used transactions for quick entry

CREATE TABLE IF NOT EXISTS transaction_templates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
    amount REAL NOT NULL CHECK(amount >= 0),
    account_id INTEGER,
    to_account_id INTEGER,
    category_id INTEGER,
    memo TEXT,
    use_count INTEGER NOT NULL DEFAULT 0,
    last_used_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (to_account_id) REFERENCES accounts(id) ON DELETE SET NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
);

-- Index for quick lookups
CREATE INDEX idx_templates_type ON transaction_templates(transaction_type);
CREATE INDEX idx_templates_use_count ON transaction_templates(use_count DESC);