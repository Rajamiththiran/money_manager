// File: src/types/currency.ts

export interface ExchangeRate {
  id: number;
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
  created_at: string;
  updated_at: string;
}

export interface SetExchangeRateInput {
  from_currency: string;
  to_currency: string;
  rate: number;
  effective_date: string;
}

export interface CurrencyConversion {
  from_currency: string;
  to_currency: string;
  original_amount: number;
  converted_amount: number;
  rate_used: number;
  rate_date: string;
}

export interface SupportedCurrency {
  code: string;
  name: string;
  symbol: string;
}

export interface ExchangeRateSummary {
  from_currency: string;
  to_currency: string;
  latest_rate: number;
  latest_date: string;
  rate_count: number;
}

export interface ConvertedBalance {
  account_id: number;
  account_name: string;
  original_currency: string;
  original_balance: number;
  primary_currency: string;
  converted_balance: number;
  rate_used: number; // 0.0 means no rate found
}
