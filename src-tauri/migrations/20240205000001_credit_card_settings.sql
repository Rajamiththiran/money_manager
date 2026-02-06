-- File: src-tauri/migrations/20240205000001_credit_card_settings.sql

-- Credit Card Settings (linked to accounts in the 'Credit Card' group)
CREATE TABLE IF NOT EXISTS credit_card_settings (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    account_id INTEGER NOT NULL UNIQUE,
    credit_limit REAL NOT NULL DEFAULT 0 CHECK(credit_limit >= 0),
    statement_day INTEGER NOT NULL CHECK(statement_day BETWEEN 1 AND 28),
    payment_due_day INTEGER NOT NULL CHECK(payment_due_day BETWEEN 1 AND 28),
    minimum_payment_percentage REAL NOT NULL DEFAULT 5.0 CHECK(minimum_payment_percentage BETWEEN 0 AND 100),
    auto_settlement_enabled INTEGER NOT NULL DEFAULT 0, -- 0=false, 1=true
    settlement_account_id INTEGER, -- Bank account for auto-settlement
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE CASCADE,
    FOREIGN KEY (settlement_account_id) REFERENCES accounts(id) ON DELETE SET NULL
);

-- Billing Statements (closed billing cycles)
CREATE TABLE IF NOT EXISTS credit_card_statements (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    credit_card_id INTEGER NOT NULL, -- references credit_card_settings.id
    statement_date TEXT NOT NULL, -- Date statement was generated (e.g., 2025-01-25)
    due_date TEXT NOT NULL, -- Payment due date (e.g., 2025-02-05)
    cycle_start_date TEXT NOT NULL, -- Start of billing period
    cycle_end_date TEXT NOT NULL, -- End of billing period (= statement_date)
    opening_balance REAL NOT NULL DEFAULT 0, -- Balance at start of cycle
    total_charges REAL NOT NULL DEFAULT 0, -- Total expenses in cycle
    total_payments REAL NOT NULL DEFAULT 0, -- Total payments received in cycle
    closing_balance REAL NOT NULL DEFAULT 0, -- Balance at end of cycle
    minimum_payment REAL NOT NULL DEFAULT 0,
    status TEXT NOT NULL DEFAULT 'OPEN' CHECK(status IN ('OPEN', 'CLOSED', 'PAID', 'PARTIAL', 'OVERDUE')),
    paid_amount REAL NOT NULL DEFAULT 0,
    paid_date TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (credit_card_id) REFERENCES credit_card_settings(id) ON DELETE CASCADE
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_cc_settings_account ON credit_card_settings(account_id);
CREATE INDEX IF NOT EXISTS idx_cc_statements_card ON credit_card_statements(credit_card_id);
CREATE INDEX IF NOT EXISTS idx_cc_statements_dates ON credit_card_statements(cycle_start_date, cycle_end_date);
CREATE INDEX IF NOT EXISTS idx_cc_statements_status ON credit_card_statements(status);