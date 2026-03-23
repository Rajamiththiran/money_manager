// File: src/components/UpcomingBillsWidget.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CalendarDaysIcon,
  ClockIcon,
  ForwardIcon,
  BanknotesIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

interface UpcomingBill {
  source: string; // "RECURRING" | "INSTALLMENT"
  source_id: number;
  name: string;
  amount: number;
  due_date: string;
  days_until_due: number;
  transaction_type: string;
  account_name: string;
  category_name: string | null;
  is_overdue: boolean;
  is_due_today: boolean;
  installment_progress: string | null;
}

interface UpcomingBillsWidgetProps {
  onBillAction?: () => void;
}

export default function UpcomingBillsWidget({
  onBillAction,
}: UpcomingBillsWidgetProps) {
  const [bills, setBills] = useState<UpcomingBill[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const loadBills = useCallback(async () => {
    try {
      const data = await invoke<UpcomingBill[]>("get_upcoming_bills", {
        daysAhead: 7,
      });
      setBills(data);
    } catch (err) {
      console.error("Failed to load upcoming bills:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadBills();
  }, [loadBills]);

  const handleSkip = async (bill: UpcomingBill) => {
    const key = `skip-${bill.source}-${bill.source_id}`;
    setActionLoading(key);
    try {
      await invoke("skip_bill_occurrence", {
        source: bill.source,
        sourceId: bill.source_id,
      });
      await loadBills();
      onBillAction?.();
    } catch (err) {
      console.error("Failed to skip bill:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handlePay = async (bill: UpcomingBill) => {
    const key = `pay-${bill.source}-${bill.source_id}`;
    setActionLoading(key);
    try {
      await invoke("pay_bill_now", {
        source: bill.source,
        sourceId: bill.source_id,
      });
      await loadBills();
      onBillAction?.();
    } catch (err) {
      console.error("Failed to pay bill:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const getDueLabel = (bill: UpcomingBill): string => {
    if (bill.is_overdue) {
      const days = Math.abs(bill.days_until_due);
      return days === 1 ? "1 day overdue" : `${days} days overdue`;
    }
    if (bill.is_due_today) return "Due today";
    if (bill.days_until_due === 1) return "Tomorrow";
    return `In ${bill.days_until_due} days`;
  };

  const getDueColor = (
    bill: UpcomingBill,
  ): { bg: string; text: string; badge: string } => {
    if (bill.is_overdue)
      return {
        bg: "bg-red-50 dark:bg-red-900/10",
        text: "text-red-600 dark:text-red-400",
        badge:
          "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300",
      };
    if (bill.is_due_today)
      return {
        bg: "bg-amber-50 dark:bg-amber-900/10",
        text: "text-amber-600 dark:text-amber-400",
        badge:
          "bg-amber-100 dark:bg-amber-900/30 text-amber-700 dark:text-amber-300",
      };
    return {
      bg: "hover:bg-gray-50 dark:hover:bg-gray-700/50",
      text: "text-gray-500 dark:text-gray-400",
      badge:
        "bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300",
    };
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <CalendarDaysIcon className="h-5 w-5 text-accent-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Upcoming Bills
          </h2>
        </div>
        <div className="flex items-center justify-center py-8">
          <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <CalendarDaysIcon className="h-5 w-5 text-accent-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Upcoming Bills
          </h2>
          {bills.length > 0 && (
            <span className="px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300">
              {bills.length}
            </span>
          )}
        </div>
        <span className="text-xs text-gray-400 dark:text-gray-500">
          Next 7 days
        </span>
      </div>

      {/* Bills List */}
      {bills.length === 0 ? (
        <div className="text-center py-8">
          <CalendarDaysIcon className="h-10 w-10 mx-auto text-gray-300 dark:text-gray-600 mb-3" />
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No upcoming bills in the next 7 days 🎉
          </p>
        </div>
      ) : (
        <div className="space-y-2 max-h-[320px] overflow-y-auto pr-1">
          {bills.map((bill) => {
            const colors = getDueColor(bill);
            const isSkipping =
              actionLoading === `skip-${bill.source}-${bill.source_id}`;
            const isPaying =
              actionLoading === `pay-${bill.source}-${bill.source_id}`;

            return (
              <div
                key={`${bill.source}-${bill.source_id}`}
                className={`flex items-center justify-between p-3 rounded-lg transition-colors ${colors.bg}`}
              >
                {/* Left: Info */}
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div
                    className={`flex-shrink-0 w-9 h-9 rounded-full flex items-center justify-center ${
                      bill.is_overdue
                        ? "bg-red-100 dark:bg-red-900/20"
                        : bill.is_due_today
                          ? "bg-amber-100 dark:bg-amber-900/20"
                          : "bg-gray-100 dark:bg-gray-700"
                    }`}
                  >
                    {bill.is_overdue ? (
                      <ExclamationTriangleIcon className="h-4 w-4 text-red-500" />
                    ) : (
                      <ClockIcon
                        className={`h-4 w-4 ${
                          bill.is_due_today
                            ? "text-amber-500"
                            : "text-gray-400"
                        }`}
                      />
                    )}
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {bill.name}
                      </p>
                      <span
                        className={`flex-shrink-0 px-1.5 py-0.5 rounded text-[10px] font-medium ${
                          bill.source === "RECURRING"
                            ? "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                            : "bg-purple-100 dark:bg-purple-900/30 text-purple-600 dark:text-purple-400"
                        }`}
                      >
                        {bill.source === "RECURRING" ? "Recurring" : "Installment"}
                      </span>
                    </div>
                    <div className="flex items-center gap-2 mt-0.5">
                      <span className="text-xs text-gray-500 dark:text-gray-400">
                        {bill.account_name}
                      </span>
                      {bill.installment_progress && (
                        <span className="text-xs text-purple-500 dark:text-purple-400 font-medium">
                          ({bill.installment_progress})
                        </span>
                      )}
                      <span className={`text-xs font-medium ${colors.text}`}>
                        • {getDueLabel(bill)}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Right: Amount + Actions */}
                <div className="flex items-center gap-3 flex-shrink-0 ml-3">
                  <div className="text-right">
                    <p className="text-sm font-semibold text-gray-900 dark:text-white">
                      Rs{" "}
                      {bill.amount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  </div>

                  <div className="flex items-center gap-1.5">
                    {/* Skip button — only for recurring */}
                    {bill.source === "RECURRING" && (
                      <button
                        onClick={() => handleSkip(bill)}
                        disabled={isSkipping || isPaying}
                        title="Skip this occurrence"
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50"
                      >
                        {isSkipping ? (
                          <ArrowPathIcon className="h-4 w-4 animate-spin" />
                        ) : (
                          <ForwardIcon className="h-4 w-4" />
                        )}
                      </button>
                    )}

                    {/* Pay Now button */}
                    <button
                      onClick={() => handlePay(bill)}
                      disabled={isSkipping || isPaying}
                      title="Pay now"
                      className="p-1.5 rounded-lg text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20 transition-colors disabled:opacity-50"
                    >
                      {isPaying ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      ) : (
                        <BanknotesIcon className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
