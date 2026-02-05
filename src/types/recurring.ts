// File: src/types/recurring.ts
export type RecurringFrequency =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY"
  | "CUSTOM";

export interface RecurringTransaction {
  id: number;
  name: string;
  description: string | null;
  transaction_type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  frequency: RecurringFrequency;
  interval_days: number;
  start_date: string;
  end_date: string | null;
  next_execution_date: string;
  is_active: boolean;
  last_executed_date: string | null;
  execution_count: number;
  created_at: string;
}

export interface CreateRecurringTransactionInput {
  name: string;
  description: string | null;
  transaction_type: "INCOME" | "EXPENSE" | "TRANSFER";
  amount: number;
  account_id: number;
  to_account_id: number | null;
  category_id: number | null;
  frequency: RecurringFrequency;
  interval_days: number | null;
  start_date: string;
  end_date: string | null;
}
