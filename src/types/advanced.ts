export interface CategorizationRule {
  id: string;
  match_pattern: string;
  match_type: string; // 'exact', 'contains', 'starts_with', 'regex'
  category_id: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export interface ExportTemplate {
  id: string;
  name: string;
  columns: string; // JSON array of column names
  filters: string; // JSON object representing filters
  format: string; // 'csv' or 'json'
  created_at: string;
  updated_at: string;
}
