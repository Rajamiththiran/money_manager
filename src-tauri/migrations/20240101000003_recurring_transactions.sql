-- File: src-tauri/migrations/20240101000003_recurring_transactions.sql

-- Recurring Transaction Templates
CREATE TABLE recurring_transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    description TEXT,
    transaction_type TEXT NOT NULL CHECK(transaction_type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
    amount REAL NOT NULL CHECK(amount > 0),
    account_id INTEGER NOT NULL,
    to_account_id INTEGER,
    category_id INTEGER,
    frequency TEXT NOT NULL CHECK(frequency IN ('DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY', 'CUSTOM')),
    interval_days INTEGER DEFAULT 1 CHECK(interval_days > 0),
    start_date TEXT NOT NULL,
    end_date TEXT,
    next_execution_date TEXT NOT NULL,
    is_active INTEGER NOT NULL DEFAULT 1 CHECK(is_active IN (0, 1)),
    last_executed_date TEXT,
    execution_count INTEGER NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (to_account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Index for performance
CREATE INDEX idx_recurring_next_execution ON recurring_transactions(next_execution_date, is_active);
CREATE INDEX idx_recurring_active ON recurring_transactions(is_active);