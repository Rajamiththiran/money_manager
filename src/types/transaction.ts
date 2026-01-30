// File: src/types/transaction.ts
export interface Transaction {
  id: number;
  date: string;
  transaction_type: string;
  amount: number;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  memo: string | null;
  photo_path: string | null;
  created_at: string;
}

export interface CreateTransactionInput {
  date: string;
  transaction_type: string;
  amount: number;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  memo: string | null;
}

export interface UpdateTransactionInput {
  id: number;
  date?: string;
  amount?: number;
  category_id?: number;
  memo?: string;
}

export interface TransactionWithDetails {
  id: number;
  date: string;
  transaction_type: string;
  amount: number;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  memo: string | null;
  photo_path: string | null;
  created_at: string;
  account_name: string;
  to_account_name: string | null;
  category_name: string | null;
}

// ============ NEW: Phase 2 Types ============

export interface TransactionFilter {
  start_date?: string;
  end_date?: string;
  transaction_type?: string; // INCOME, EXPENSE, TRANSFER
  account_id?: number;
  category_id?: number;
  search_query?: string;
  include_subcategories?: boolean;
}

export interface IncomeExpenseSummary {
  total_income: number;
  total_expense: number;
  net_savings: number;
  transaction_count: number;
  start_date: string;
  end_date: string;
}

export interface CategorySpending {
  category_id: number;
  category_name: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
}

export interface DailySummary {
  date: string;
  total_income: number;
  total_expense: number;
  net: number;
  transaction_count: number;
}
