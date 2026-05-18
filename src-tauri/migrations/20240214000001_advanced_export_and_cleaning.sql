CREATE TABLE categorization_rules (
    id TEXT PRIMARY KEY,
    match_pattern TEXT NOT NULL,
    match_type TEXT NOT NULL, -- 'exact', 'contains', 'starts_with', 'regex'
    category_id TEXT NOT NULL,
    priority INTEGER DEFAULT 0,
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE CASCADE
);

CREATE TABLE export_templates (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    columns TEXT NOT NULL, -- JSON array of column names
    filters TEXT, -- JSON object representing filters
    format TEXT NOT NULL DEFAULT 'csv', -- 'csv' or 'json'
    created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
    updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
