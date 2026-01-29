-- File: src-tauri/migrations/20240101000001_init.sql

-- Account Groups (Cash, Bank, Card, Savings)
CREATE TABLE account_groups (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE,
    type TEXT NOT NULL CHECK(type IN ('ASSET', 'LIABILITY'))
);

-- Accounts (Wallet, Bank XYZ, Credit Card ABC)
CREATE TABLE accounts (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    group_id INTEGER NOT NULL,
    name TEXT NOT NULL,
    initial_balance REAL NOT NULL DEFAULT 0,
    currency TEXT NOT NULL DEFAULT 'LKR',
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (group_id) REFERENCES account_groups(id)
);

-- Categories (Food > Lunch, Transport > Fuel)
CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    parent_id INTEGER,
    name TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE')),
    FOREIGN KEY (parent_id) REFERENCES categories(id)
);

-- Transactions (User-facing entries)
CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    date TEXT NOT NULL,
    type TEXT NOT NULL CHECK(type IN ('INCOME', 'EXPENSE', 'TRANSFER')),
    amount REAL NOT NULL CHECK(amount > 0),
    account_id INTEGER NOT NULL,
    to_account_id INTEGER, -- NULL for income/expense, filled for transfers
    category_id INTEGER,
    memo TEXT,
    photo_path TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    FOREIGN KEY (to_account_id) REFERENCES accounts(id),
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Journal Entries (Double-entry ledger - invisible to user)
CREATE TABLE journal_entries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    transaction_id INTEGER NOT NULL,
    account_id INTEGER NOT NULL,
    debit REAL NOT NULL DEFAULT 0 CHECK(debit >= 0),
    credit REAL NOT NULL DEFAULT 0 CHECK(credit >= 0),
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    FOREIGN KEY (transaction_id) REFERENCES transactions(id) ON DELETE CASCADE,
    FOREIGN KEY (account_id) REFERENCES accounts(id),
    CHECK ((debit > 0 AND credit = 0) OR (credit > 0 AND debit = 0))
);

-- Budgets
CREATE TABLE budgets (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    category_id INTEGER NOT NULL,
    amount REAL NOT NULL CHECK(amount > 0),
    period TEXT NOT NULL CHECK(period IN ('MONTHLY', 'YEARLY')),
    start_date TEXT NOT NULL,
    FOREIGN KEY (category_id) REFERENCES categories(id)
);

-- Indexes for performance
CREATE INDEX idx_transactions_date ON transactions(date);
CREATE INDEX idx_journal_account ON journal_entries(account_id);
CREATE INDEX idx_journal_transaction ON journal_entries(transaction_id);