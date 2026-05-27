-- File: src-tauri/migrations/20240218000001_performance_indexes.sql
-- Performance Audit: Add missing indexes on heavily queried columns.
-- Existing indexes (untouched): idx_transactions_date, idx_journal_account, idx_journal_transaction

-- Transactions: frequent JOINs and WHERE filters on account_id
CREATE INDEX IF NOT EXISTS idx_transactions_account ON transactions(account_id);

-- Transactions: category spending queries, filter bar
CREATE INDEX IF NOT EXISTS idx_transactions_category ON transactions(category_id);

-- Transactions: filter by INCOME/EXPENSE/TRANSFER
CREATE INDEX IF NOT EXISTS idx_transactions_type ON transactions(type);

-- Transactions: compound index for filtered date-range queries (type + date)
CREATE INDEX IF NOT EXISTS idx_transactions_type_date ON transactions(type, date);

-- Budgets: budget status lookups join on category
CREATE INDEX IF NOT EXISTS idx_budgets_category ON budgets(category_id);

-- Transaction tags: spending-by-tag queries (reverse lookup)
CREATE INDEX IF NOT EXISTS idx_transaction_tags_tag ON transaction_tags(tag_id);

-- Savings goals: virtual envelope lookups by linked account
CREATE INDEX IF NOT EXISTS idx_savings_goals_account ON savings_goals(linked_account_id);

-- Savings goals: filter active goals
CREATE INDEX IF NOT EXISTS idx_savings_goals_status ON savings_goals(status);

-- Goal contributions: contribution history queries
CREATE INDEX IF NOT EXISTS idx_goal_contributions_goal_date ON goal_contributions(goal_id, contribution_date);
