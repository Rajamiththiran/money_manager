// File: src/types/budget.ts
export interface Budget {
  id: number;
  category_id: number;
  amount: number;
  period: string; // "MONTHLY" | "YEARLY"
  start_date: string;
}

export interface CreateBudgetInput {
  category_id: number;
  amount: number;
  period: string;
  start_date: string;
}

export interface UpdateBudgetInput {
  id: number;
  amount?: number;
  start_date?: string;
}

export interface BudgetStatus {
  id: number;
  category_id: number;
  amount: number;
  period: string;
  start_date: string;
  category_name: string;
  spent_amount: number;
  remaining_amount: number;
  percentage_used: number;
  days_remaining: number;
  daily_average_spent: number;
  daily_budget_remaining: number;
  is_over_budget: boolean;
}

export interface BudgetAlert {
  budget_id: number;
  category_name: string;
  budget_amount: number;
  spent_amount: number;
  percentage_used: number;
  alert_level: string; // "WARNING" | "DANGER" | "CRITICAL"
}
