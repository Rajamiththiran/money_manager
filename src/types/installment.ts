// File: src/types/installment.ts
export interface InstallmentPlan {
  id: number;
  name: string;
  total_amount: number;
  num_installments: number;
  amount_per_installment: number;
  account_id: number;
  category_id: number;
  start_date: string;
  frequency: string;
  next_due_date: string;
  installments_paid: number;
  total_paid: number;
  status: string;
  memo: string | null;
  created_at: string;
  updated_at: string;
}

export interface InstallmentPayment {
  id: number;
  installment_plan_id: number;
  transaction_id: number;
  installment_number: number;
  amount: number;
  due_date: string;
  paid_date: string;
  created_at: string;
}

export interface InstallmentPaymentDetails {
  payment: InstallmentPayment;
  installment_number: number;
  amount: number;
  due_date: string;
  paid_date: string | null;
  status: string;
}

export interface InstallmentPlanWithDetails {
  plan: InstallmentPlan;
  payments: InstallmentPaymentDetails[];
  account_name: string;
  category_name: string;
  remaining_amount: number;
  remaining_installments: number;
  next_payment_amount: number;
}

export interface CreateInstallmentPlan {
  name: string;
  total_amount: number;
  num_installments: number;
  account_id: number;
  category_id: number;
  start_date: string;
  frequency: string;
  memo: string | null;
}
