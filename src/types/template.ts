// File: src/types/template.ts

export interface TransactionTemplate {
  id: number;
  name: string;
  transaction_type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  account_id: number | null;
  to_account_id: number | null;
  category_id: number | null;
  memo: string | null;
  use_count: number;
  last_used_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface TransactionTemplateWithDetails extends TransactionTemplate {
  account_name: string | null;
  to_account_name: string | null;
  category_name: string | null;
}

export interface CreateTemplateInput {
  name: string;
  transaction_type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  account_id: number | null;
  to_account_id: number | null;
  category_id: number | null;
  memo: string | null;
}

export interface UpdateTemplateInput {
  id: number;
  name?: string;
  amount?: number;
  account_id?: number;
  to_account_id?: number;
  category_id?: number;
  memo?: string;
}
