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
