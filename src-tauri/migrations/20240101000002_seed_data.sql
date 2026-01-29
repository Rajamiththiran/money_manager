-- File: src-tauri/migrations/20240101000002_seed_data.sql
INSERT INTO account_groups (name, type) VALUES
('Cash', 'ASSET'),
('Bank', 'ASSET'),
('Credit Card', 'LIABILITY'),
('Savings', 'ASSET'),
('Investments', 'ASSET');