-- File: src-tauri/migrations/20240210000001_auto_backup_settings.sql
-- Auto-backup settings stored in the existing app_settings key-value table

INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auto_backup_enabled', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auto_backup_frequency', 'WEEKLY');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auto_backup_path', '');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auto_backup_retention', '5');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auto_backup_include_photos', 'false');
INSERT OR IGNORE INTO app_settings (key, value) VALUES ('auto_backup_last_run', '');
