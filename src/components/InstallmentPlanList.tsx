// File: src/components/InstallmentPlanList.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import Button from "./Button";

interface InstallmentPlan {
  id: number;
  name: string;
  total_amount: number;
  num_installments: number;
  amount_per_installment: number;
  account_id: number;
  category_id: number;
  start_date: string;
  frequency: string;
  memo: string | null;
  created_at: string;
}

interface InstallmentPayment {
  id: number;
  installment_plan_id: number;
  payment_number: number;
  due_date: string;
  amount: number;
  is_paid: boolean;
  transaction_id: number | null;
  paid_at: string | null;
}

interface InstallmentPlanWithPayments {
  plan: InstallmentPlan;
  payments: InstallmentPayment[];
  total_paid: number;
  total_remaining: number;
}

export default function InstallmentPlanList() {
  const [plans, setPlans] = useState<InstallmentPlanWithPayments[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [plansData, accountsData, categoriesData] = await Promise.all([
        invoke<InstallmentPlanWithPayments[]>("get_all_installment_plans"),
        invoke<any[]>("get_accounts"),
        invoke<any[]>("get_categories"),
      ]);
      setPlans(plansData);
      setAccounts(accountsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error("Failed to load installment plans:", error);
    } finally {
      setLoading(false);
    }
  };

  const handlePayInstallment = async (paymentId: number) => {
    try {
      await invoke("pay_installment", { paymentId });
      await loadData();
    } catch (error) {
      console.error("Failed to pay installment:", error);
      alert("Error: " + error);
    }
  };

  const handleDeletePlan = async (planId: number) => {
    if (
      !confirm(
        "Delete this installment plan? All associated transactions will remain.",
      )
    )
      return;

    try {
      await invoke("delete_installment_plan", { planId });
      await loadData();
    } catch (error) {
      console.error("Failed to delete plan:", error);
      alert("Error: " + error);
    }
  };

  const toggleExpand = (planId: number) => {
    setExpandedPlan(expandedPlan === planId ? null : planId);
  };

  const getAccountName = (accountId: number) => {
    const account = accounts.find((a) => a.id === accountId);
    return account?.name || "Unknown";
  };

  const getCategoryName = (categoryId: number) => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || "Unknown";
  };

  if (loading) {
    return (
      <div className="text-center py-8 text-gray-600 dark:text-gray-400">
        Loading installment plans...
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg mb-2">No installment plans yet</p>
        <p className="text-sm">
          Break down large expenses into monthly payments
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {plans.map((item) => {
        const progressPercent =
          (item.total_paid / item.plan.total_amount) * 100;
        const isExpanded = expandedPlan === item.plan.id;
        const paidCount = item.payments.filter((p) => p.is_paid).length;

        return (
          <div
            key={item.plan.id}
            className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
          >
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                  {item.plan.name}
                </h3>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <span>Account: {getAccountName(item.plan.account_id)}</span>
                  <span className="mx-2">•</span>
                  <span>
                    Category: {getCategoryName(item.plan.category_id)}
                  </span>
                </div>
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <span>
                    {paidCount} of {item.plan.num_installments} paid
                  </span>
                  <span className="mx-2">•</span>
                  <span>
                    LKR {item.plan.amount_per_installment.toFixed(2)} / month
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Total
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  LKR {item.plan.total_amount.toLocaleString()}
                </div>
              </div>
            </div>

            {/* Progress Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span className="text-gray-600 dark:text-gray-400">
                  Progress
                </span>
                <span className="font-medium text-gray-900 dark:text-white">
                  {progressPercent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
                <div
                  className="bg-blue-600 h-2 rounded-full transition-all"
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-sm mt-1">
                <span className="text-green-600 dark:text-green-400">
                  Paid: LKR {item.total_paid.toLocaleString()}
                </span>
                <span className="text-red-600 dark:text-red-400">
                  Remaining: LKR {item.total_remaining.toLocaleString()}
                </span>
              </div>
            </div>

            {item.plan.memo && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                {item.plan.memo}
              </p>
            )}

            {/* Action Buttons */}
            <div className="flex gap-2">
              <Button
                variant="secondary"
                size="sm"
                onClick={() => toggleExpand(item.plan.id)}
              >
                {isExpanded ? "Hide" : "Show"} Payment Schedule
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDeletePlan(item.plan.id)}
              >
                Delete Plan
              </Button>
            </div>

            {/* Payment Schedule */}
            {isExpanded && (
              <div className="mt-4 border-t border-gray-200 dark:border-gray-700 pt-4">
                <h4 className="font-medium text-gray-900 dark:text-white mb-3">
                  Payment Schedule
                </h4>
                <div className="space-y-2">
                  {item.payments.map((payment) => (
                    <div
                      key={payment.id}
                      className={`flex justify-between items-center p-3 rounded ${
                        payment.is_paid
                          ? "bg-green-50 dark:bg-green-900/20"
                          : "bg-gray-50 dark:bg-gray-700/50"
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <span className="font-medium text-gray-900 dark:text-white">
                          #{payment.payment_number}
                        </span>
                        <span className="text-sm text-gray-600 dark:text-gray-400">
                          Due: {new Date(payment.due_date).toLocaleDateString()}
                        </span>
                        {payment.is_paid && payment.paid_at && (
                          <span className="text-xs text-green-600 dark:text-green-400">
                            Paid:{" "}
                            {new Date(payment.paid_at).toLocaleDateString()}
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="font-semibold text-gray-900 dark:text-white">
                          LKR {payment.amount.toLocaleString()}
                        </span>
                        {!payment.is_paid && (
                          <Button
                            size="sm"
                            onClick={() => handlePayInstallment(payment.id)}
                          >
                            Pay Now
                          </Button>
                        )}
                        {payment.is_paid && (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            ✓ Paid
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
