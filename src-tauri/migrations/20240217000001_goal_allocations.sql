-- Goal Allocations (Virtual Envelope System)
-- Links goal contributions to transactions and distinguishes contribution types.

-- Add transaction_id to link contributions to transactions
ALTER TABLE goal_contributions ADD COLUMN transaction_id INTEGER REFERENCES transactions(id) ON DELETE SET NULL;

-- Add contribution_type to distinguish manual vs transaction-based contributions
-- MANUAL: user adds contribution via Goal UI
-- TRANSACTION: auto-created when income is allocated to a goal
-- WITHDRAWAL: funds pulled from a goal (expense exceeding unallocated balance)
ALTER TABLE goal_contributions ADD COLUMN contribution_type TEXT NOT NULL DEFAULT 'MANUAL'
  CHECK(contribution_type IN ('MANUAL', 'TRANSACTION', 'WITHDRAWAL'));

-- Index for fast lookups by transaction
CREATE INDEX idx_goal_contributions_transaction ON goal_contributions(transaction_id);

-- Index for fast lookups by goal
CREATE INDEX idx_goal_contributions_goal ON goal_contributions(goal_id);
