-- File: src-tauri/migrations/20240215000001_recurring_improvements.sql
-- Recurring Transaction Improvements: variable amounts, auto-resume, seasonal schedules, execution log

-- Add amount mode: FIXED auto-executes, VARIABLE requires manual confirmation
ALTER TABLE recurring_transactions ADD COLUMN amount_mode TEXT NOT NULL DEFAULT 'FIXED'
    CHECK(amount_mode IN ('FIXED', 'VARIABLE'));

-- Optional resume date: when paused, auto-reactivate on this date
ALTER TABLE recurring_transactions ADD COLUMN resume_date TEXT;

-- Seasonal active months: comma-separated month numbers (1-12), NULL = all months active
ALTER TABLE recurring_transactions ADD COLUMN active_months TEXT;

-- Execution history log
CREATE TABLE IF NOT EXISTS recurring_execution_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    recurring_id INTEGER NOT NULL,
    execution_date TEXT NOT NULL,
    status TEXT NOT NULL CHECK(status IN ('SUCCESS', 'SKIPPED', 'FAILED', 'VARIABLE_PENDING')),
    amount REAL,
    transaction_id INTEGER,
    notes TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (recurring_id) REFERENCES recurring_transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE SET NULL
);

CREATE INDEX IF NOT EXISTS idx_exec_log_recurring ON recurring_execution_log(recurring_id, execution_date DESC);
