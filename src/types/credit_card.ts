// File: src/types/credit_card.ts

export interface CreditCardSettings {
  id: number;
  account_id: number;
  credit_limit: number;
  statement_day: number;
  payment_due_day: number;
  minimum_payment_percentage: number;
  auto_settlement_enabled: boolean;
  settlement_account_id: number | null;
  created_at: string;
  updated_at: string;
}

export interface CreateCreditCardSettingsInput {
  account_id: number;
  credit_limit: number;
  statement_day: number;
  payment_due_day: number;
  minimum_payment_percentage?: number;
  auto_settlement_enabled?: boolean;
  settlement_account_id?: number;
}

export interface UpdateCreditCardSettingsInput {
  id: number;
  credit_limit?: number;
  statement_day?: number;
  payment_due_day?: number;
  minimum_payment_percentage?: number;
  auto_settlement_enabled?: boolean;
  settlement_account_id?: number;
}

export interface CreditCardWithDetails {
  settings: CreditCardSettings;
  account_name: string;
  settlement_account_name: string | null;
  total_balance: number;
  outstanding_balance: number;
  available_credit: number;
  current_cycle_charges: number;
  current_cycle_payments: number;
  utilization_percentage: number;
}

export interface CreditCardStatement {
  id: number;
  credit_card_id: number;
  statement_date: string;
  due_date: string;
  cycle_start_date: string;
  cycle_end_date: string;
  opening_balance: number;
  total_charges: number;
  total_payments: number;
  closing_balance: number;
  minimum_payment: number;
  status: "OPEN" | "CLOSED" | "PAID" | "PARTIAL" | "OVERDUE";
  paid_amount: number;
  paid_date: string | null;
  created_at: string;
}

export interface StatementTransaction {
  id: number;
  date: string;
  transaction_type: string;
  amount: number;
  category_name: string | null;
  memo: string | null;
}

export interface StatementWithTransactions {
  statement: CreditCardStatement;
  transactions: StatementTransaction[];
}

export interface SettlementInput {
  credit_card_settings_id: number;
  payment_account_id: number;
  amount?: number;
  date?: string;
}

export interface BillingCycleInfo {
  cycle_start_date: string;
  cycle_end_date: string;
  due_date: string;
  days_remaining: number;
}

export interface CreditCardSummary {
  account_id: number;
  account_name: string;
  total_balance: number;
  credit_limit: number;
  available_credit: number;
  next_due_date: string | null;
  next_due_amount: number | null;
  utilization_percentage: number;
}
