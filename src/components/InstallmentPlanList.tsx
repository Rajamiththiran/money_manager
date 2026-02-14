// File: src/components/InstallmentPlanList.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChevronDown,
  ChevronUp,
  Trash2,
  Ban,
  CheckCircle2,
  CreditCard,
  Clock,
  CircleDollarSign,
} from "lucide-react";
import Button from "./Button";
import { useToast } from "./Toast";
import type {
  InstallmentPlanWithDetails,
  InstallmentPayment,
} from "../types/installment";

interface InstallmentPlanListProps {
  refreshKey?: number;
}

const STATUS_STYLES: Record<string, { bg: string; text: string }> = {
  ACTIVE: {
    bg: "bg-emerald-100 dark:bg-emerald-900/40",
    text: "text-emerald-800 dark:text-emerald-300",
  },
  COMPLETED: {
    bg: "bg-blue-100 dark:bg-blue-900/40",
    text: "text-blue-800 dark:text-blue-300",
  },
  CANCELLED: {
    bg: "bg-gray-200 dark:bg-gray-600",
    text: "text-gray-700 dark:text-gray-300",
  },
};

export default function InstallmentPlanList({
  refreshKey,
}: InstallmentPlanListProps) {
  const { success, error: showError, warning } = useToast();
  const [plans, setPlans] = useState<InstallmentPlanWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedPlan, setExpandedPlan] = useState<number | null>(null);
  const [processingPayment, setProcessingPayment] = useState<number | null>(
    null,
  );

  useEffect(() => {
    loadPlans();
  }, [refreshKey]);

  const loadPlans = async () => {
    try {
      const plansData = await invoke<
        Array<{
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
        }>
      >("get_installment_plans", { statusFilter: null });

      const detailedPlans = await Promise.all(
        plansData.map((plan) =>
          invoke<InstallmentPlanWithDetails>(
            "get_installment_plan_with_details",
            {
              planId: plan.id,
            },
          ),
        ),
      );

      setPlans(detailedPlans);
    } catch (err) {
      console.error("Failed to load installment plans:", err);
      showError("Failed to load plans", String(err));
    } finally {
      setLoading(false);
    }
  };

  const handlePayInstallment = async (planId: number, planName: string) => {
    setProcessingPayment(planId);
    try {
      await invoke<InstallmentPayment>("process_installment_payment", {
        planId,
      });
      await loadPlans();
      success(
        "Payment Processed",
        `Installment payment for "${planName}" recorded.`,
      );
    } catch (err) {
      showError("Payment Failed", String(err));
    } finally {
      setProcessingPayment(null);
    }
  };

  const handleCancelPlan = async (planId: number, planName: string) => {
    if (
      !confirm(
        `Cancel installment plan "${planName}"?\n\nThis cannot be undone. All recorded payments will remain in your transaction history.`,
      )
    )
      return;

    try {
      await invoke("cancel_installment_plan", { planId });
      await loadPlans();
      warning("Plan Cancelled", `"${planName}" has been cancelled.`);
    } catch (err) {
      showError("Failed to cancel", String(err));
    }
  };

  const handleDeletePlan = async (planId: number, planName: string) => {
    if (
      !confirm(
        `Delete installment plan "${planName}"?\n\nThe plan will be removed but all recorded transactions will remain in your reports and history.`,
      )
    )
      return;

    try {
      await invoke("delete_installment_plan", { planId });
      await loadPlans();
      success("Plan Deleted", `"${planName}" has been removed.`);
    } catch (err) {
      showError("Cannot Delete", String(err));
    }
  };

  const formatDate = (dateStr: string) => {
    try {
      return new Date(dateStr + "T00:00:00").toLocaleDateString("en-US", {
        month: "short",
        day: "numeric",
        year: "numeric",
      });
    } catch {
      return dateStr;
    }
  };

  const getProgressColor = (percent: number) => {
    if (percent >= 100) return "bg-emerald-500";
    if (percent >= 75) return "bg-blue-500";
    if (percent >= 50) return "bg-amber-500";
    return "bg-gray-400";
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-500 dark:text-gray-400">
          Loading installment plans...
        </div>
      </div>
    );
  }

  if (plans.length === 0) {
    return (
      <div className="text-center py-16">
        <CreditCard className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-1">
          No installment plans
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Break down large expenses into manageable monthly payments
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {plans.map((item) => {
        const plan = item.plan;
        const progressPercent =
          plan.total_amount > 0
            ? Math.min((plan.total_paid / plan.total_amount) * 100, 100)
            : 0;
        const isExpanded = expandedPlan === plan.id;
        const statusStyle = STATUS_STYLES[plan.status] || STATUS_STYLES.ACTIVE;
        const isActive = plan.status === "ACTIVE";
        const isCompleted = plan.status === "COMPLETED";
        const isCancelled = plan.status === "CANCELLED";
        const canDelete = isCompleted || isCancelled;

        return (
          <div
            key={plan.id}
            className={`
              bg-white dark:bg-gray-800 rounded-xl border
              ${
                isActive
                  ? "border-gray-200 dark:border-gray-700"
                  : "border-gray-200/60 dark:border-gray-700/60 opacity-90"
              }
              p-5 transition-all
            `}
          >
            {/* Header */}
            <div className="flex justify-between items-start mb-3">
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="font-semibold text-gray-900 dark:text-white">
                    {plan.name}
                  </h3>
                  <span
                    className={`text-xs font-medium px-2 py-0.5 rounded-full ${statusStyle.bg} ${statusStyle.text}`}
                  >
                    {plan.status}
                  </span>
                </div>
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  <span>{item.account_name}</span>
                  <span className="mx-1.5">•</span>
                  <span>{item.category_name}</span>
                  <span className="mx-1.5">•</span>
                  <span>
                    {plan.installments_paid} of {plan.num_installments} paid
                  </span>
                </div>
              </div>
              <div className="text-right">
                <div className="text-sm text-gray-500 dark:text-gray-400">
                  Total
                </div>
                <div className="text-xl font-bold text-gray-900 dark:text-white">
                  LKR{" "}
                  {plan.total_amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </div>
              </div>
            </div>

            {/* Progress */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1.5">
                <span className="text-gray-500 dark:text-gray-400">
                  LKR{" "}
                  {plan.amount_per_installment.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}{" "}
                  / {plan.frequency.toLowerCase()}
                </span>
                <span className="font-medium text-gray-700 dark:text-gray-200">
                  {progressPercent.toFixed(0)}%
                </span>
              </div>
              <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2.5">
                <div
                  className={`h-2.5 rounded-full transition-all duration-500 ${getProgressColor(progressPercent)}`}
                  style={{ width: `${progressPercent}%` }}
                />
              </div>
              <div className="flex justify-between text-xs mt-1.5">
                <span className="text-emerald-600 dark:text-emerald-400 font-medium">
                  Paid: LKR{" "}
                  {plan.total_paid.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
                <span className="text-red-500 dark:text-red-400 font-medium">
                  Remaining: LKR{" "}
                  {item.remaining_amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </span>
              </div>
            </div>

            {plan.memo && (
              <p className="text-sm text-gray-500 dark:text-gray-400 italic mb-3">
                {plan.memo}
              </p>
            )}

            {/* Actions */}
            <div className="flex gap-2 flex-wrap">
              {/* Pay button - only for ACTIVE plans */}
              {isActive && (
                <Button
                  size="sm"
                  onClick={() => handlePayInstallment(plan.id, plan.name)}
                  disabled={processingPayment === plan.id}
                  icon={<CircleDollarSign className="w-3.5 h-3.5" />}
                >
                  {processingPayment === plan.id
                    ? "Processing..."
                    : `Pay LKR ${item.next_payment_amount.toLocaleString("en-US", { minimumFractionDigits: 2 })}`}
                </Button>
              )}

              {/* Show/Hide Payments toggle */}
              <Button
                variant="secondary"
                size="sm"
                onClick={() => setExpandedPlan(isExpanded ? null : plan.id)}
                icon={
                  isExpanded ? (
                    <ChevronUp className="w-3.5 h-3.5" />
                  ) : (
                    <ChevronDown className="w-3.5 h-3.5" />
                  )
                }
              >
                {isExpanded ? "Hide" : "Show"} Payments
              </Button>

              {/* Cancel button - only for ACTIVE plans */}
              {isActive && (
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCancelPlan(plan.id, plan.name)}
                  icon={<Ban className="w-3.5 h-3.5" />}
                >
                  Cancel Plan
                </Button>
              )}

              {/* Delete button - only for COMPLETED or CANCELLED plans */}
              {canDelete && (
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDeletePlan(plan.id, plan.name)}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete
                </Button>
              )}
            </div>

            {/* Payment Schedule (Expanded) */}
            {isExpanded && (
              <div className="mt-4 pt-4 border-t border-gray-200 dark:border-gray-700">
                <h4 className="text-sm font-semibold text-gray-700 dark:text-gray-200 mb-3 flex items-center gap-2">
                  <Clock className="w-4 h-4" />
                  Payment Schedule
                </h4>
                {item.payments.length > 0 ? (
                  <div className="space-y-2">
                    {item.payments.map((payment) => {
                      const isPaid = payment.status === "PAID";
                      return (
                        <div
                          key={payment.installment_number}
                          className={`
                            flex items-center justify-between p-3 rounded-lg text-sm
                            ${
                              isPaid
                                ? "bg-emerald-50 dark:bg-emerald-900/20"
                                : "bg-gray-50 dark:bg-gray-700/40"
                            }
                          `}
                        >
                          <div className="flex items-center gap-3">
                            {isPaid ? (
                              <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                            ) : (
                              <Clock className="w-4 h-4 text-gray-400" />
                            )}
                            <span className="font-medium text-gray-900 dark:text-white">
                              #{payment.installment_number}
                            </span>
                            <span className="text-gray-500 dark:text-gray-400">
                              Due: {formatDate(payment.due_date)}
                            </span>
                            {isPaid && payment.paid_date && (
                              <span className="text-xs text-emerald-600 dark:text-emerald-400">
                                Paid: {formatDate(payment.paid_date)}
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-gray-900 dark:text-white">
                              LKR{" "}
                              {payment.amount.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                            </span>
                            {isPaid && (
                              <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">
                                Paid
                              </span>
                            )}
                            {!isPaid && isActive && (
                              <span className="text-xs font-medium text-gray-400 dark:text-gray-500">
                                Pending
                              </span>
                            )}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <p className="text-sm text-gray-400 dark:text-gray-500 text-center py-4">
                    No payments recorded yet
                  </p>
                )}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
