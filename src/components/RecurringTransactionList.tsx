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
  X,
} from "lucide-react";
import Button from "./Button";
import ExecutionHistoryPanel from "./ExecutionHistoryPanel";
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

  // Pause Modal States
  const [pausingRecurringId, setPausingRecurringId] = useState<number | null>(null);
  const [resumeDate, setResumeDate] = useState<string>("");

  // Variable amount input state
  const [variableAmounts, setVariableAmounts] = useState<Record<number, string>>({});

  // Counter to trigger history panel refresh
  const [historyRefreshKey, setHistoryRefreshKey] = useState(0);

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
    if (item.is_active) {
      // User clicked Pause. Open dialog to ask for optional resume date.
      setPausingRecurringId(item.id);
      setResumeDate("");
      return;
    }

    // User clicked Activate. Call normal toggle.
    try {
      const newState = await invoke<boolean>("toggle_recurring_transaction", {
        recurringId: item.id,
      });
      await loadRecurring();
      success("Activated", `"${item.name}" is now active.`);
    } catch (err) {
      showError("Failed to toggle status", String(err));
    }
  };

  const handleConfirmPause = async () => {
    if (pausingRecurringId === null) return;
    try {
      await invoke("pause_with_resume", {
        recurringId: pausingRecurringId,
        resumeDate: resumeDate ? resumeDate : null,
      });
      await loadRecurring();
      const item = recurring.find((r) => r.id === pausingRecurringId);
      success(
        "Paused",
        `"${item?.name || "Transaction"}" is now paused${
          resumeDate ? ` and will resume on ${formatDate(resumeDate)}` : ""
        }.`,
      );
    } catch (err) {
      showError("Failed to pause", String(err));
    } finally {
      setPausingRecurringId(null);
      setResumeDate("");
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
      setHistoryRefreshKey((k) => k + 1);
    } catch (err) {
      showError("Failed to execute", String(err));
    }
  };

  const handleConfirmVariable = async (item: RecurringTransaction) => {
    const amountStr = variableAmounts[item.id];
    const amount = parseFloat(amountStr || "0");
    if (!amount || amount <= 0) {
      showError("Invalid amount", "Please enter an amount greater than zero.");
      return;
    }
    try {
      await invoke<number>("confirm_variable_amount", {
        recurringId: item.id,
        amount,
      });
      setVariableAmounts((prev) => {
        const next = { ...prev };
        delete next[item.id];
        return next;
      });
      await loadRecurring();
      success(
        "Transaction Created",
        `"${item.name}" executed with LKR ${amount.toLocaleString(undefined, { minimumFractionDigits: 2 })}.`,
      );
      setHistoryRefreshKey((k) => k + 1);
    } catch (err) {
      showError("Failed to confirm", String(err));
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
      setHistoryRefreshKey((k) => k + 1);
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
                    {item.amount_mode === "VARIABLE" && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-amber-100 dark:bg-amber-900/40 text-amber-700 dark:text-amber-300 font-medium">
                        Variable
                      </span>
                    )}
                    {item.active_months && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-indigo-100 dark:bg-indigo-900/40 text-indigo-700 dark:text-indigo-300 font-medium">
                        Seasonal
                      </span>
                    )}
                    {item.auto_approve && (
                      <span className="text-xs px-2 py-0.5 rounded-md bg-cyan-100 dark:bg-cyan-900/40 text-cyan-700 dark:text-cyan-300 font-medium">
                        Auto
                      </span>
                    )}
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
                    {item.amount_mode === "VARIABLE" && (
                      <span className="text-xs text-amber-500 dark:text-amber-400 font-normal mr-1">Est.</span>
                    )}
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
                {!item.is_active && item.resume_date && (
                  <span className="text-blue-500 dark:text-blue-400 font-medium">
                    Resumes: {formatDate(item.resume_date)}
                  </span>
                )}
              </div>

              {/* Action Buttons */}
              <div className="flex gap-2 flex-wrap items-center">
                {item.amount_mode === "VARIABLE" ? (
                  <>
                    <input
                      type="number"
                      placeholder={item.amount > 0 ? `Est. ${item.amount.toFixed(0)}` : "Amount"}
                      value={variableAmounts[item.id] || ""}
                      onChange={(e) =>
                        setVariableAmounts((prev) => ({
                          ...prev,
                          [item.id]: e.target.value,
                        }))
                      }
                      className="w-28 text-sm px-3 py-1.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                    />
                    <Button
                      variant="primary"
                      size="sm"
                      onClick={() => handleConfirmVariable(item)}
                      disabled={!item.is_active || !variableAmounts[item.id]}
                      icon={<Zap className="w-3.5 h-3.5" />}
                    >
                      Confirm & Pay
                    </Button>
                  </>
                ) : (
                  <Button
                    variant="primary"
                    size="sm"
                    onClick={() => handleExecuteNow(item)}
                    disabled={!item.is_active}
                    icon={<Zap className="w-3.5 h-3.5" />}
                  >
                    Execute Now
                  </Button>
                )}
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

              {/* Execution History */}
              <ExecutionHistoryPanel recurringId={item.id} />
            </div>
          </div>
        );
      })}

      {/* Pause Confirmation Modal */}
      {pausingRecurringId !== null && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50 backdrop-blur-sm">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl w-full max-w-sm overflow-hidden">
            <div className="p-4 flex items-center justify-between border-b border-gray-100 dark:border-gray-700">
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                Pause Transaction
              </h3>
              <button
                onClick={() => setPausingRecurringId(null)}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200"
              >
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-4 space-y-4">
              <p className="text-sm text-gray-600 dark:text-gray-300">
                Are you sure you want to pause this transaction? It will not execute while paused.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Auto-Resume Date (Optional)
                </label>
                <input
                  type="date"
                  min={new Date().toISOString().split("T")[0]}
                  value={resumeDate}
                  onChange={(e) => setResumeDate(e.target.value)}
                  className="w-full rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 px-3 py-2 text-sm text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-accent-500"
                />
                <p className="mt-1 text-xs text-gray-500 dark:text-gray-400">
                  Leave empty to pause indefinitely.
                </p>
              </div>
            </div>
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 flex justify-end gap-3 border-t border-gray-100 dark:border-gray-700">
              <Button
                variant="secondary"
                onClick={() => setPausingRecurringId(null)}
              >
                Cancel
              </Button>
              <Button variant="primary" onClick={handleConfirmPause}>
                Confirm Pause
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
