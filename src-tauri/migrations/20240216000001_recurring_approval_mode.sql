-- Add auto_approve column to recurring_transactions
-- 0 = manual (show in dashboard widget for approval), 1 = automatic execution
ALTER TABLE recurring_transactions ADD COLUMN auto_approve INTEGER NOT NULL DEFAULT 0;
