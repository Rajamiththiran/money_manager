// File: src/components/RecurringTransactionList.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Play,
  Pause,
  Trash2,
  SkipForward,
  Zap,
  Repeat,
  Calendar,
  Clock,
} from "lucide-react";
import Button from "./Button";
import { useToast } from "./Toast";
import type { RecurringTransaction } from "../types/recurring";

interface RecurringTransactionListProps {
  refreshKey?: number;
}

const TYPE_COLORS: Record<string, string> = {
  INCOME: "text-emerald-600 dark:text-emerald-400",
  EXPENSE: "text-red-600 dark:text-red-400",
  TRANSFER: "text-blue-600 dark:text-blue-400",
};

const TYPE_BADGES: Record<string, string> = {
  INCOME:
    "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
  EXPENSE: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
  TRANSFER: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
};

const FREQUENCY_LABELS: Record<string, string> = {
  DAILY: "Daily",
  WEEKLY: "Weekly",
  MONTHLY: "Monthly",
  YEARLY: "Yearly",
};

export default function RecurringTransactionList({
  refreshKey,
}: RecurringTransactionListProps) {
  const { success, error: showError, info } = useToast();
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecurring();
  }, [refreshKey]);

  const loadRecurring = async () => {
    try {
      const data = await invoke<RecurringTransaction[]>(
        "get_recurring_transactions",
      );
      setRecurring(data);
    } catch (err) {
      console.error("Failed to load recurring transactions:", err);
      showError("Failed to load", String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (item: RecurringTransaction) => {
    try {
      const newState = await invoke<boolean>("toggle_recurring_transaction", {
        recurringId: item.id,
      });
      await loadRecurring();
      success(
        newState ? "Activated" : "Paused",
        `"${item.name}" is now ${newState ? "active" : "paused"}.`,
      );
    } catch (err) {
      showError("Failed to toggle status", String(err));
    }
  };

  const handleExecuteNow = async (item: RecurringTransaction) => {
    try {
      await invoke<number>("execute_recurring_transaction", {
        recurringId: item.id,
      });
      await loadRecurring();
      success(
        "Transaction Created",
        `"${item.name}" executed. LKR ${item.amount.toLocaleString()} recorded.`,
      );
    } catch (err) {
      showError("Failed to execute", String(err));
    }
  };

  const handleSkip = async (item: RecurringTransaction) => {
    try {
      const newDate = await invoke<string>("skip_next_occurrence", {
        recurringId: item.id,
      });
      await loadRecurring();
      info(
        "Occurrence Skipped",
        `"${item.name}" next execution moved to ${formatDate(newDate)}.`,
      );
    } catch (err) {
      showError("Failed to skip", String(err));
    }
  };

  const handleDelete = async (item: RecurringTransaction) => {
    if (
      !confirm(
        `Delete "${item.name}"? Past generated transactions will remain.`,
      )
    )
      return;

    try {
      await invoke("delete_recurring_transaction", { recurringId: item.id });
      await loadRecurring();
      success("Deleted", `"${item.name}" has been removed.`);
    } catch (err) {
      showError("Failed to delete", String(err));
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

  const getFrequencyLabel = (frequency: string, intervalDays?: number) => {
    if (frequency === "CUSTOM" && intervalDays) {
      return `Every ${intervalDays} days`;
    }
    return FREQUENCY_LABELS[frequency] || frequency;
  };

  const getDaysUntilNext = (nextDate: string): string => {
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const next = new Date(nextDate + "T00:00:00");
    const diffDays = Math.ceil(
      (next.getTime() - today.getTime()) / (1000 * 60 * 60 * 24),
    );

    if (diffDays < 0) return "Overdue";
    if (diffDays === 0) return "Today";
    if (diffDays === 1) return "Tomorrow";
    return `In ${diffDays} days`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-500 dark:text-gray-400">
          Loading recurring transactions...
        </div>
      </div>
    );
  }

  if (recurring.length === 0) {
    return (
      <div className="text-center py-16">
        <Repeat className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
        <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-1">
          No recurring transactions
        </p>
        <p className="text-sm text-gray-400 dark:text-gray-500">
          Set up automatic income, expenses, or transfers that repeat on a
          schedule
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {recurring.map((item) => {
        const daysLabel = getDaysUntilNext(item.next_execution_date);
        const isOverdue = daysLabel === "Overdue";

        return (
          <div
            key={item.id}
            className={`
              bg-white dark:bg-gray-800 rounded-xl border
              ${
                item.is_active
                  ? "border-gray-200 dark:border-gray-700"
                  : "border-dashed border-gray-300 dark:border-gray-600 opacity-70"
              }
              transition-all duration-200 hover:shadow-sm
            `}
          >
            <div className="p-4">
              {/* Top Row */}
              <div className="flex items-start justify-between mb-2">
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap mb-1">
                    <h3 className="font-semibold text-gray-900 dark:text-white truncate">
                      {item.name}
                    </h3>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-md font-medium ${TYPE_BADGES[item.transaction_type]}`}
                    >
                      {item.transaction_type}
                    </span>
                    <span className="text-xs px-2 py-0.5 rounded-md bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-300 font-medium">
                      {getFrequencyLabel(item.frequency, item.interval_days)}
                    </span>
                    <span
                      className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        item.is_active
                          ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/40 dark:text-emerald-300"
                          : "bg-gray-200 text-gray-600 dark:bg-gray-600 dark:text-gray-300"
                      }`}
                    >
                      {item.is_active ? "Active" : "Paused"}
                    </span>
                  </div>
                  {item.description && (
                    <p className="text-sm text-gray-500 dark:text-gray-400 truncate">
                      {item.description}
                    </p>
                  )}
                </div>
                <div className="text-right ml-4 flex-shrink-0">
                  <div
                    className={`text-xl font-bold ${TYPE_COLORS[item.transaction_type]}`}
                  >
                    LKR{" "}
                    {item.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </div>
                </div>
              </div>

              {/* Info Row */}
              <div className="flex items-center gap-4 text-xs text-gray-500 dark:text-gray-400 mb-3">
                <span className="flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5" />
                  Next: {formatDate(item.next_execution_date)}
                </span>
                <span
                  className={`flex items-center gap-1 font-medium ${
                    isOverdue
                      ? "text-red-500 dark:text-red-400"
                      : "text-gray-500 dark:text-gray-400"
                  }`}
                >
                  <Clock className="w-3.5 h-3.5" />
                  {daysLabel}
                </span>
                {item.end_date && (
                  <span>Ends: {formatDate(item.end_date)}</span>
                )}
                <span>Executed: {item.execution_count}×</span>
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleExecuteNow(item)}
                  disabled={!item.is_active}
                  icon={<Zap className="w-3.5 h-3.5" />}
                >
                  Execute Now
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleSkip(item)}
                  disabled={!item.is_active}
                  icon={<SkipForward className="w-3.5 h-3.5" />}
                >
                  Skip
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleToggleStatus(item)}
                  icon={
                    item.is_active ? (
                      <Pause className="w-3.5 h-3.5" />
                    ) : (
                      <Play className="w-3.5 h-3.5" />
                    )
                  }
                >
                  {item.is_active ? "Pause" : "Activate"}
                </Button>
                <Button
                  variant="danger"
                  size="sm"
                  onClick={() => handleDelete(item)}
                  icon={<Trash2 className="w-3.5 h-3.5" />}
                >
                  Delete
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
