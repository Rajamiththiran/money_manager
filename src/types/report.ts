// File: src/types/report.ts
export interface ReportFilters {
  startDate: string;
  endDate: string;
  period: "daily" | "weekly" | "monthly" | "yearly" | "custom";
  transactionType?: string;
  categoryId?: number;
  accountId?: number;
}

export interface MonthlyTrend {
  month: string;
  month_name: string;
  income: number;
  expense: number;
  net: number;
  transaction_count: number;
}

export interface PeriodSummary {
  label: string;
  startDate: string;
  endDate: string;
  totalIncome: number;
  totalExpense: number;
  netSavings: number;
  transactionCount: number;
}

export interface PeriodComparison {
  currentPeriod: PeriodSummary;
  previousPeriod: PeriodSummary;
  incomeChange: number;
  expenseChange: number;
  savingsChange: number;
}

export interface CategoryReport {
  categoryId: number;
  categoryName: string;
  totalAmount: number;
  transactionCount: number;
  percentage: number;
  previousAmount?: number;
  change?: number;
}

export interface AccountReport {
  accountId: number;
  accountName: string;
  openingBalance: number;
  closingBalance: number;
  totalInflow: number;
  totalOutflow: number;
  netChange: number;
  transactionCount: number;
}
