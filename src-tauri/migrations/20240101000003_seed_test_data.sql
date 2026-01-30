-- File: src-tauri/migrations/20240101000003_seed_test_data.sql

-- Seed Categories
-- EXPENSE Categories (Parent)
INSERT INTO categories (parent_id, name, type) VALUES
(NULL, 'Food & Dining', 'EXPENSE'),
(NULL, 'Transportation', 'EXPENSE'),
(NULL, 'Shopping', 'EXPENSE'),
(NULL, 'Entertainment', 'EXPENSE'),
(NULL, 'Bills & Utilities', 'EXPENSE'),
(NULL, 'Healthcare', 'EXPENSE'),
(NULL, 'Education', 'EXPENSE');

-- INCOME Categories (Parent)
INSERT INTO categories (parent_id, name, type) VALUES
(NULL, 'Salary', 'INCOME'),
(NULL, 'Freelance', 'INCOME'),
(NULL, 'Investments', 'INCOME'),
(NULL, 'Other Income', 'INCOME');

-- Food & Dining Subcategories (parent_id = 1)
INSERT INTO categories (parent_id, name, type) VALUES
((SELECT id FROM categories WHERE name = 'Food & Dining' AND parent_id IS NULL), 'Groceries', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Food & Dining' AND parent_id IS NULL), 'Restaurants', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Food & Dining' AND parent_id IS NULL), 'Coffee & Tea', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Food & Dining' AND parent_id IS NULL), 'Fast Food', 'EXPENSE');

-- Transportation Subcategories (parent_id = 2)
INSERT INTO categories (parent_id, name, type) VALUES
((SELECT id FROM categories WHERE name = 'Transportation' AND parent_id IS NULL), 'Fuel', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Transportation' AND parent_id IS NULL), 'Public Transport', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Transportation' AND parent_id IS NULL), 'Taxi & Ride Share', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Transportation' AND parent_id IS NULL), 'Vehicle Maintenance', 'EXPENSE');

-- Shopping Subcategories (parent_id = 3)
INSERT INTO categories (parent_id, name, type) VALUES
((SELECT id FROM categories WHERE name = 'Shopping' AND parent_id IS NULL), 'Clothing', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Shopping' AND parent_id IS NULL), 'Electronics', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Shopping' AND parent_id IS NULL), 'Home & Garden', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Shopping' AND parent_id IS NULL), 'Personal Care', 'EXPENSE');

-- Entertainment Subcategories (parent_id = 4)
INSERT INTO categories (parent_id, name, type) VALUES
((SELECT id FROM categories WHERE name = 'Entertainment' AND parent_id IS NULL), 'Movies & Streaming', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Entertainment' AND parent_id IS NULL), 'Games', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Entertainment' AND parent_id IS NULL), 'Sports & Hobbies', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Entertainment' AND parent_id IS NULL), 'Books & Music', 'EXPENSE');

-- Bills & Utilities Subcategories (parent_id = 5)
INSERT INTO categories (parent_id, name, type) VALUES
((SELECT id FROM categories WHERE name = 'Bills & Utilities' AND parent_id IS NULL), 'Electricity', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Bills & Utilities' AND parent_id IS NULL), 'Water', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Bills & Utilities' AND parent_id IS NULL), 'Internet', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Bills & Utilities' AND parent_id IS NULL), 'Phone', 'EXPENSE'),
((SELECT id FROM categories WHERE name = 'Bills & Utilities' AND parent_id IS NULL), 'Rent', 'EXPENSE');

-- Seed Accounts
INSERT INTO accounts (group_id, name, initial_balance, currency) VALUES
-- Cash (group_id = 1)
(1, 'Wallet', 5000.00, 'LKR'),
(1, 'Emergency Cash', 20000.00, 'LKR'),

-- Bank (group_id = 2)
(2, 'Commercial Bank - Savings', 150000.00, 'LKR'),
(2, 'Sampath Bank - Current', 75000.00, 'LKR'),

-- Credit Card (group_id = 3)
(3, 'HSBC Visa Card', 0.00, 'LKR'),
(3, 'Amex Gold Card', 0.00, 'LKR'),

-- Savings (group_id = 4)
(4, 'NDBW Money+', 500000.00, 'LKR'),
(4, 'Fixed Deposit', 1000000.00, 'LKR');

-- Seed Transactions (Last 3 Months of Activity)
-- Using subqueries to get correct category and account IDs

-- January 2026
INSERT INTO transactions (date, type, amount, account_id, to_account_id, category_id, memo) VALUES
-- Week 1 (Jan 1-7)
('2026-01-02', 'EXPENSE', 3500.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Groceries'), 
 'Weekly groceries at Keells'),
 
('2026-01-03', 'EXPENSE', 450.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Coffee & Tea'), 
 'Coffee with friends'),
 
('2026-01-04', 'EXPENSE', 1200.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Fuel'), 
 'Fuel for bike'),
 
('2026-01-05', 'EXPENSE', 2500.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Restaurants'), 
 'Dinner at Ministry of Crab'),
 
('2026-01-06', 'EXPENSE', 850.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Public Transport'), 
 'Bus fare for week'),

-- Week 2 (Jan 8-14)
('2026-01-08', 'EXPENSE', 4200.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Groceries'), 
 'Monthly groceries'),
 
('2026-01-09', 'EXPENSE', 15000.00, 
 (SELECT id FROM accounts WHERE name = 'HSBC Visa Card'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Electronics'), 
 'New phone case and accessories'),
 
('2026-01-10', 'EXPENSE', 2800.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Restaurants'), 
 'Lunch at Upali'),
 
('2026-01-11', 'EXPENSE', 1500.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Fuel'), 
 'Fuel'),
 
('2026-01-12', 'EXPENSE', 3500.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Movies & Streaming'), 
 'Netflix + Spotify subscriptions'),

-- Week 3 (Jan 15-21)
('2026-01-15', 'INCOME', 250000.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Salary'), 
 'Monthly salary - January'),
 
('2026-01-16', 'EXPENSE', 65000.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Rent'), 
 'Rent for February'),
 
('2026-01-17', 'EXPENSE', 8500.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Electricity'), 
 'Electricity bill'),
 
('2026-01-18', 'EXPENSE', 2200.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Internet'), 
 'Internet bill - Dialog'),
 
('2026-01-19', 'EXPENSE', 1800.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Phone'), 
 'Mobitel phone bill'),
 
('2026-01-20', 'TRANSFER', 100000.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 (SELECT id FROM accounts WHERE name = 'NDBW Money+'), 
 NULL, 
 'Transfer to savings'),
 
('2026-01-21', 'EXPENSE', 5500.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Restaurants'), 
 'Restaurant - Chinese Dragon'),

-- Week 4 (Jan 22-28)
('2026-01-22', 'EXPENSE', 12000.00, 
 (SELECT id FROM accounts WHERE name = 'HSBC Visa Card'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Clothing'), 
 'New shirt and trousers'),
 
('2026-01-23', 'EXPENSE', 450.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Coffee & Tea'), 
 'Morning coffee'),
 
('2026-01-24', 'EXPENSE', 6700.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Groceries'), 
 'Groceries mid-month'),
 
('2026-01-25', 'INCOME', 45000.00, 
 (SELECT id FROM accounts WHERE name = 'Sampath Bank - Current'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Freelance'), 
 'Freelance project - Website design'),
 
('2026-01-26', 'EXPENSE', 1500.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Fuel'), 
 'Fuel'),
 
('2026-01-27', 'EXPENSE', 8900.00, 
 (SELECT id FROM accounts WHERE name = 'HSBC Visa Card'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Games'), 
 'Gaming - Steam sale'),
 
('2026-01-28', 'EXPENSE', 3200.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Fast Food'), 
 'Pizza night'),

-- Week 5 (Jan 29-30)
('2026-01-29', 'EXPENSE', 2500.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Taxi & Ride Share'), 
 'Three-wheeler rides'),
 
('2026-01-30', 'EXPENSE', 7500.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Electronics'), 
 'New headphones');

-- December 2025
INSERT INTO transactions (date, type, amount, account_id, to_account_id, category_id, memo) VALUES
('2025-12-01', 'EXPENSE', 3800.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Groceries'), 
 'Groceries'),
 
('2025-12-05', 'EXPENSE', 1200.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Fuel'), 
 'Fuel'),
 
('2025-12-10', 'EXPENSE', 25000.00, 
 (SELECT id FROM accounts WHERE name = 'HSBC Visa Card'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Electronics'), 
 'Christmas shopping'),
 
('2025-12-15', 'INCOME', 250000.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Salary'), 
 'December salary'),
 
('2025-12-16', 'EXPENSE', 65000.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Rent'), 
 'January rent advance'),
 
('2025-12-20', 'EXPENSE', 15000.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Restaurants'), 
 'Christmas dinner'),
 
('2025-12-22', 'INCOME', 30000.00, 
 (SELECT id FROM accounts WHERE name = 'Sampath Bank - Current'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Freelance'), 
 'Year-end bonus - freelance'),
 
('2025-12-25', 'EXPENSE', 8000.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Clothing'), 
 'Gifts for family'),
 
('2025-12-28', 'TRANSFER', 50000.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 (SELECT id FROM accounts WHERE name = 'NDBW Money+'), 
 NULL, 
 'Year-end savings transfer'),
 
('2025-12-30', 'EXPENSE', 12000.00, 
 (SELECT id FROM accounts WHERE name = 'HSBC Visa Card'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Movies & Streaming'), 
 'New Year party');

-- November 2025
INSERT INTO transactions (date, type, amount, account_id, to_account_id, category_id, memo) VALUES
('2025-11-01', 'EXPENSE', 4500.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Groceries'), 
 'Monthly groceries'),
 
('2025-11-05', 'EXPENSE', 1500.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Fuel'), 
 'Fuel'),
 
('2025-11-10', 'EXPENSE', 6800.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Electronics'), 
 'New watch'),
 
('2025-11-15', 'INCOME', 250000.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Salary'), 
 'November salary'),
 
('2025-11-16', 'EXPENSE', 65000.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Rent'), 
 'December rent'),
 
('2025-11-18', 'EXPENSE', 8200.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Electricity'), 
 'Electricity'),
 
('2025-11-20', 'EXPENSE', 3500.00, 
 (SELECT id FROM accounts WHERE name = 'Wallet'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Restaurants'), 
 'Weekend dining'),
 
('2025-11-22', 'INCOME', 25000.00, 
 (SELECT id FROM accounts WHERE name = 'Sampath Bank - Current'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Freelance'), 
 'Freelance - Logo design'),
 
('2025-11-25', 'TRANSFER', 80000.00, 
 (SELECT id FROM accounts WHERE name = 'Commercial Bank - Savings'), 
 (SELECT id FROM accounts WHERE name = 'NDBW Money+'), 
 NULL, 
 'Savings transfer'),
 
('2025-11-28', 'EXPENSE', 5500.00, 
 (SELECT id FROM accounts WHERE name = 'HSBC Visa Card'), 
 NULL, 
 (SELECT id FROM categories WHERE name = 'Games'), 
 'Movie night with friends');

-- Create journal entries for all transactions
-- INCOME transactions (Debit account)
INSERT INTO journal_entries (transaction_id, account_id, debit, credit)
SELECT 
    t.id,
    t.account_id,
    t.amount,
    0
FROM transactions t
WHERE t.type = 'INCOME';

-- EXPENSE transactions (Credit account)
INSERT INTO journal_entries (transaction_id, account_id, debit, credit)
SELECT 
    t.id,
    t.account_id,
    0,
    t.amount
FROM transactions t
WHERE t.type = 'EXPENSE';

-- TRANSFER transactions (Credit from source account)
INSERT INTO journal_entries (transaction_id, account_id, debit, credit)
SELECT 
    t.id,
    t.account_id,
    0,
    t.amount
FROM transactions t
WHERE t.type = 'TRANSFER';

-- TRANSFER transactions (Debit to destination account)
INSERT INTO journal_entries (transaction_id, account_id, debit, credit)
SELECT 
    t.id,
    t.to_account_id,
    t.amount,
    0
FROM transactions t
WHERE t.type = 'TRANSFER';