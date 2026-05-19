// File: src/components/ScheduledItemsWidget.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  CalendarDaysIcon,
  ClockIcon,
  ArrowPathIcon,
  BanknotesIcon,
  ArrowsRightLeftIcon,
  ArrowDownTrayIcon,
  ForwardIcon,
} from "@heroicons/react/24/outline";
import type { WidgetDisplayMode } from "../types/dashboard";

interface ScheduledItem {
  source: string;
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
  amount_mode: string;
}

interface ScheduledItemsWidgetProps {
  onItemAction?: () => void;
  displayMode?: WidgetDisplayMode;
}

export default function ScheduledItemsWidget({
  onItemAction,
  displayMode = "expanded",
}: ScheduledItemsWidgetProps) {
  const [items, setItems] = useState<ScheduledItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);
  const [variableAmounts, setVariableAmounts] = useState<
    Record<string, string>
  >({});

  const loadItems = useCallback(async () => {
    try {
      const data = await invoke<ScheduledItem[]>("get_upcoming_bills", {
        daysAhead: 7,
      });
      // Only show INCOME and TRANSFER items
      setItems(
        data.filter(
          (b) =>
            b.source === "RECURRING" &&
            (b.transaction_type === "INCOME" ||
              b.transaction_type === "TRANSFER"),
        ),
      );
    } catch (err) {
      console.error("Failed to load scheduled items:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadItems();
  }, [loadItems]);

  const handleExecute = async (item: ScheduledItem) => {
    const key = `${item.source}-${item.source_id}`;
    setActionLoading(`pay-${key}`);
    try {
      await invoke("pay_bill_now", {
        source: item.source,
        sourceId: item.source_id,
      });
      await loadItems();
      onItemAction?.();
    } catch (err) {
      console.error("Failed to execute:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleSkip = async (item: ScheduledItem) => {
    const key = `${item.source}-${item.source_id}`;
    setActionLoading(`skip-${key}`);
    try {
      await invoke("skip_bill_occurrence", {
        source: item.source,
        sourceId: item.source_id,
      });
      await loadItems();
      onItemAction?.();
    } catch (err) {
      console.error("Failed to skip:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const handleConfirmVariable = async (item: ScheduledItem) => {
    const key = `${item.source}-${item.source_id}`;
    const amountStr = variableAmounts[key];
    const amount = parseFloat(amountStr || "0");
    if (!amount || amount <= 0) return;

    setActionLoading(`pay-${key}`);
    try {
      await invoke("confirm_variable_amount", {
        recurringId: item.source_id,
        amount,
      });
      setVariableAmounts((prev) => {
        const next = { ...prev };
        delete next[key];
        return next;
      });
      await loadItems();
      onItemAction?.();
    } catch (err) {
      console.error("Failed to confirm variable amount:", err);
    } finally {
      setActionLoading(null);
    }
  };

  const getDueLabel = (item: ScheduledItem): string => {
    if (item.is_overdue) {
      const days = Math.abs(item.days_until_due);
      return days === 1 ? "1 day overdue" : `${days} days overdue`;
    }
    if (item.is_due_today) return "Due today";
    if (item.days_until_due === 1) return "Tomorrow";
    return `In ${item.days_until_due} days`;
  };

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowsRightLeftIcon className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Scheduled Items
          </h2>
        </div>
        <div className="flex justify-center py-6">
          <ArrowPathIcon className="h-5 w-5 text-gray-400 animate-spin" />
        </div>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
        <div className="flex items-center gap-2 mb-4">
          <ArrowsRightLeftIcon className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Scheduled Items
          </h2>
        </div>
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center py-4">
          No pending income or transfers
        </p>
      </div>
    );
  }

  const isCompact = displayMode === "compact";

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <ArrowsRightLeftIcon className="h-5 w-5 text-blue-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Scheduled Items
          </h2>
          <span className="text-xs px-2 py-0.5 rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300 font-medium">
            {items.length}
          </span>
        </div>
      </div>

      <div className={`space-y-2 ${isCompact ? "max-h-48 overflow-y-auto" : ""}`}>
        {items.map((item) => {
          const key = `${item.source}-${item.source_id}`;
          const isPaying = actionLoading === `pay-${key}`;
          const isSkipping = actionLoading === `skip-${key}`;
          const isIncome = item.transaction_type === "INCOME";

          return (
            <div
              key={key}
              className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              {/* Left: Info */}
              <div className="flex-1 min-w-0 mr-3">
                <div className="flex items-center gap-2 mb-0.5">
                  <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                    {item.name}
                  </p>
                  <span
                    className={`text-[10px] px-1.5 py-0.5 rounded font-medium ${
                      isIncome
                        ? "bg-emerald-100 dark:bg-emerald-900/40 text-emerald-700 dark:text-emerald-300"
                        : "bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300"
                    }`}
                  >
                    {isIncome ? "Income" : "Transfer"}
                  </span>
                </div>
                <div className="flex items-center gap-2 text-xs text-gray-500 dark:text-gray-400">
                  <span className="flex items-center gap-0.5">
                    <CalendarDaysIcon className="h-3 w-3" />
                    {getDueLabel(item)}
                  </span>
                  <span>{item.account_name}</span>
                </div>
              </div>

              {/* Right: Amount + Actions */}
              <div className="flex items-center gap-3 flex-shrink-0">
                <div className="text-right">
                  {item.amount_mode === "VARIABLE" ? (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] text-amber-500 font-medium">
                        Var
                      </span>
                      <input
                        type="number"
                        placeholder={
                          item.amount > 0 ? item.amount.toFixed(0) : "Amount"
                        }
                        value={variableAmounts[key] || ""}
                        onChange={(e) =>
                          setVariableAmounts((prev) => ({
                            ...prev,
                            [key]: e.target.value,
                          }))
                        }
                        className="w-20 text-right text-sm px-2 py-1 rounded-md border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-1 focus:ring-accent-500 focus:border-accent-500"
                      />
                    </div>
                  ) : (
                    <p
                      className={`text-sm font-semibold ${
                        isIncome
                          ? "text-emerald-600 dark:text-emerald-400"
                          : "text-blue-600 dark:text-blue-400"
                      }`}
                    >
                      Rs{" "}
                      {item.amount.toLocaleString("en-US", {
                        minimumFractionDigits: 2,
                        maximumFractionDigits: 2,
                      })}
                    </p>
                  )}
                </div>

                <div className="flex items-center gap-1.5">
                  {/* Skip button */}
                  <button
                    onClick={() => handleSkip(item)}
                    disabled={isSkipping || isPaying}
                    title="Skip this occurrence"
                    className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50"
                  >
                    {isSkipping ? (
                      <ArrowPathIcon className="h-4 w-4 animate-spin" />
                    ) : (
                      <ForwardIcon className="h-4 w-4" />
                    )}
                  </button>

                  {/* Execute / Confirm button */}
                  {item.amount_mode === "VARIABLE" ? (
                    <button
                      onClick={() => handleConfirmVariable(item)}
                      disabled={isSkipping || isPaying || !variableAmounts[key]}
                      title="Confirm amount"
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        isIncome
                          ? "text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          : "text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      }`}
                    >
                      {isPaying ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      ) : isIncome ? (
                        <ArrowDownTrayIcon className="h-4 w-4" />
                      ) : (
                        <ArrowsRightLeftIcon className="h-4 w-4" />
                      )}
                    </button>
                  ) : (
                    <button
                      onClick={() => handleExecute(item)}
                      disabled={isSkipping || isPaying}
                      title={isIncome ? "Receive now" : "Transfer now"}
                      className={`p-1.5 rounded-lg transition-colors disabled:opacity-50 ${
                        isIncome
                          ? "text-emerald-500 hover:text-emerald-600 dark:hover:text-emerald-400 hover:bg-emerald-50 dark:hover:bg-emerald-900/20"
                          : "text-blue-500 hover:text-blue-600 dark:hover:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20"
                      }`}
                    >
                      {isPaying ? (
                        <ArrowPathIcon className="h-4 w-4 animate-spin" />
                      ) : isIncome ? (
                        <ArrowDownTrayIcon className="h-4 w-4" />
                      ) : (
                        <ArrowsRightLeftIcon className="h-4 w-4" />
                      )}
                    </button>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
