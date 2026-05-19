// File: src/types/recurring.ts
export type RecurringFrequency =
  | "DAILY"
  | "WEEKLY"
  | "MONTHLY"
  | "YEARLY"
  | "CUSTOM";

export type AmountMode = "FIXED" | "VARIABLE";

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
  // V1.2.0
  amount_mode: AmountMode;
  resume_date: string | null;
  active_months: string | null; // "1,2,3,10,11,12"
  auto_approve: boolean;
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
  // V1.2.0
  amount_mode?: AmountMode;
  active_months?: string | null;
  auto_approve?: boolean;
}

export interface RecurringExecutionLog {
  id: number;
  recurring_id: number;
  execution_date: string;
  status: "SUCCESS" | "SKIPPED" | "FAILED" | "VARIABLE_PENDING";
  amount: number | null;
  transaction_id: number | null;
  notes: string | null;
  created_at: string;
}
