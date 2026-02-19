// File: src/types/analytics.ts
export interface NetWorthSummary {
  assets: number;
  liabilities: number;
  net_worth: number;
  change_amount: number;
  change_percentage: number;
}

export interface NetWorthSnapshot {
  id: number;
  snapshot_date: string;
  total_assets: number;
  total_liabilities: number;
  net_worth: number;
}
