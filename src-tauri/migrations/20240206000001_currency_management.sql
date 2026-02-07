-- File: src-tauri/migrations/20240205000001_currency_management.sql

-- Exchange Rates table for multi-currency support
-- Stores manual exchange rates between currency pairs with date-based history
CREATE TABLE IF NOT EXISTS exchange_rates (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    from_currency TEXT NOT NULL,
    to_currency TEXT NOT NULL,
    rate REAL NOT NULL CHECK(rate > 0),
    effective_date TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE(from_currency, to_currency, effective_date)
);

-- App settings table for storing primary currency and other preferences
-- Only created if it doesn't already exist (may have been created in a prior phase)
CREATE TABLE IF NOT EXISTS app_settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Default primary currency setting
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('primary_currency', 'LKR');

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair ON exchange_rates(from_currency, to_currency);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_date ON exchange_rates(effective_date);
CREATE INDEX IF NOT EXISTS idx_exchange_rates_pair_date ON exchange_rates(from_currency, to_currency, effective_date DESC);