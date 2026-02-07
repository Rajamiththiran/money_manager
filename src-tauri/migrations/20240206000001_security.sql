-- File: src-tauri/migrations/20240206000001_security.sql

-- Security settings are stored in app_settings (already created in currency migration)
-- This migration just seeds the default security values

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('pin_hash', '');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('pin_enabled', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('lock_timeout_minutes', '5');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('failed_attempts', '0');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('lockout_until', '');