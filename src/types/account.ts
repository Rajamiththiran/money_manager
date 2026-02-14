// File: src/types/account.ts
export interface AccountGroup {
  id: number;
  name: string;
  account_type: string;
}

export interface Account {
  id: number;
  group_id: number;
  name: string;
  initial_balance: number;
  currency: string;
  created_at: string;
}

export interface AccountWithBalance {
  id: number;
  group_id: number;
  name: string;
  initial_balance: number;
  currency: string;
  created_at: string;
  current_balance: number;
}

export interface CreateAccountInput {
  group_id: number;
  name: string;
  initial_balance: number;
  currency?: string;
}

export interface UpdateAccountInput {
  id: number;
  name?: string;
  group_id?: number;
  currency?: string;
}
