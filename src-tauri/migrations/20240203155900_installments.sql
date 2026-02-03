-- File: src-tauri/migrations/20240101000004_installments.sql
-- Installment Plans Table
CREATE TABLE IF NOT EXISTS installment_plans (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL,
    total_amount REAL NOT NULL CHECK(total_amount > 0),
    num_installments INTEGER NOT NULL CHECK(num_installments > 0),
    amount_per_installment REAL NOT NULL CHECK(amount_per_installment > 0),
    account_id INTEGER NOT NULL,
    category_id INTEGER NOT NULL,
    start_date TEXT NOT NULL, -- ISO 8601 format
    frequency TEXT NOT NULL CHECK(frequency IN ('MONTHLY', 'WEEKLY', 'DAILY')),
    next_due_date TEXT NOT NULL,
    installments_paid INTEGER NOT NULL DEFAULT 0,
    total_paid REAL NOT NULL DEFAULT 0.0,
    status TEXT NOT NULL DEFAULT 'ACTIVE' CHECK(status IN ('ACTIVE', 'COMPLETED', 'CANCELLED')),
    memo TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id) ON DELETE RESTRICT,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE RESTRICT
);

-- Installment Payments (links to actual transactions)
CREATE TABLE IF NOT EXISTS installment_payments (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    installment_plan_id INTEGER NOT NULL,
    transaction_id INTEGER NOT NULL,
    installment_number INTEGER NOT NULL,
    amount REAL NOT NULL,
    due_date TEXT NOT NULL,
    paid_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (installment_plan_id) REFERENCES installment_plans(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    UNIQUE(installment_plan_id, installment_number)
);

-- Indexes for performance
CREATE INDEX idx_installment_plans_status ON installment_plans(status);
CREATE INDEX idx_installment_plans_next_due ON installment_plans(next_due_date);
CREATE INDEX idx_installment_payments_plan ON installment_payments(installment_plan_id);