// File: src/types/import.ts

export interface CsvPreview {
  headers: string[];
  rows: string[][];
  total_rows: number;
  detected_delimiter: string;
}

export interface ColumnMapping {
  date_col: number;
  amount_col: number;
  type_col: number | null;
  account_col: number | null;
  category_col: number | null;
  memo_col: number | null;
  date_format: string;
  negative_as_expense: boolean;
}

export interface RowValidation {
  row_index: number;
  status: "valid" | "warning" | "error";
  date: string;
  amount: number;
  transaction_type: string;
  account_name: string;
  category_name: string;
  memo: string;
  error: string | null;
  matched_account_id: number | null;
  matched_category_id: number | null;
}

export interface ImportValidationResult {
  valid_count: number;
  warning_count: number;
  error_count: number;
  rows: RowValidation[];
  unmatched_accounts: string[];
  unmatched_categories: string[];
}

export interface ImportOptions {
  skip_duplicates: boolean;
  create_missing_categories: boolean;
  default_account_id: number;
  account_mapping: Record<string, number>;
  category_mapping: Record<string, number>;
}

export interface ImportResult {
  batch_id: string;
  imported: number;
  skipped: number;
  errors: number;
}

export interface ImportHistoryEntry {
  id: number;
  batch_id: string;
  filename: string;
  total_rows: number;
  imported_count: number;
  skipped_count: number;
  error_count: number;
  status: string;
  imported_at: string;
  can_undo: boolean;
}

export interface MatchSuggestion {
  name: string;
  matched_id: number | null;
  matched_name: string | null;
  score: number;
}
