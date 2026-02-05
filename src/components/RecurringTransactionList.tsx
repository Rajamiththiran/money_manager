// File: src/components/RecurringTransactionList.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type { RecurringTransaction } from "../types/recurring";
import Button from "./Button";

interface RecurringTransactionListProps {
  onEdit?: (recurring: RecurringTransaction) => void;
}

export default function RecurringTransactionList({
  onEdit,
}: RecurringTransactionListProps) {
  const [recurring, setRecurring] = useState<RecurringTransaction[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadRecurring();
  }, []);

  const loadRecurring = async () => {
    try {
      const data = await invoke<RecurringTransaction[]>(
        "get_recurring_transactions",
      );
      setRecurring(data);
    } catch (error) {
      console.error("Failed to load recurring transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleStatus = async (id: number, currentStatus: boolean) => {
    try {
      const newStatus = !currentStatus;
      await invoke("update_recurring_status", { id, status: newStatus });
      await loadRecurring();
    } catch (error) {
      console.error("Failed to toggle status:", error);
    }
  };

  const handleDelete = async (id: number) => {
    if (
      !confirm(
        "Delete this recurring transaction? Past transactions will remain.",
      )
    )
      return;

    try {
      await invoke("delete_recurring_transaction", { id });
      await loadRecurring();
    } catch (error) {
      console.error("Failed to delete recurring transaction:", error);
    }
  };

  const handleExecuteNow = async (id: number) => {
    try {
      await invoke("execute_recurring_transaction", { id });
      alert("Transaction created successfully!");
      await loadRecurring();
    } catch (error) {
      console.error("Failed to execute recurring transaction:", error);
    }
  };

  const getFrequencyLabel = (frequency: string, customDays?: number) => {
    if (frequency === "CUSTOM" && customDays) {
      return `Every ${customDays} days`;
    }
    return frequency.charAt(0) + frequency.slice(1).toLowerCase();
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "INCOME":
        return "text-green-600 dark:text-green-400";
      case "EXPENSE":
        return "text-red-600 dark:text-red-400";
      case "TRANSFER":
        return "text-blue-600 dark:text-blue-400";
      default:
        return "text-gray-600 dark:text-gray-400";
    }
  };

  if (loading) {
    return (
      <div className="text-center py-8">Loading recurring transactions...</div>
    );
  }

  if (recurring.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500 dark:text-gray-400">
        <p className="text-lg mb-2">No recurring transactions yet</p>
        <p className="text-sm">
          Set up automatic income, expenses, or transfers
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {recurring.map((item) => (
        <div
          key={item.id}
          className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700"
        >
          <div className="flex justify-between items-start mb-2">
            <div className="flex-1">
              <div className="flex items-center gap-3 mb-1">
                <h3 className="font-semibold text-gray-900 dark:text-white">
                  {item.name}
                </h3>
                <span
                  className={`font-semibold ${getTypeColor(item.transaction_type)}`}
                >
                  {item.transaction_type}
                </span>
                <span className="text-sm px-2 py-0.5 bg-gray-100 dark:bg-gray-700 rounded">
                  {getFrequencyLabel(item.frequency, item.interval_days)}
                </span>
                <span
                  className={`text-sm px-2 py-0.5 rounded ${
                    item.is_active
                      ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                      : "bg-gray-100 text-gray-800 dark:bg-gray-700 dark:text-gray-300"
                  }`}
                >
                  {item.is_active ? "ACTIVE" : "PAUSED"}
                </span>
              </div>
              {item.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                  {item.description}
                </p>
              )}
              <div className="text-sm text-gray-500 dark:text-gray-500">
                <span>
                  Next:{" "}
                  {new Date(item.next_execution_date).toLocaleDateString()}
                </span>
                {item.end_date && (
                  <span className="ml-3">
                    Ends: {new Date(item.end_date).toLocaleDateString()}
                  </span>
                )}
                <span className="ml-3">
                  Executed: {item.execution_count} times
                </span>
              </div>
            </div>
            <div className="text-right">
              <div className="text-xl font-bold text-gray-900 dark:text-white">
                LKR {item.amount.toLocaleString()}
              </div>
            </div>
          </div>

          <div className="flex gap-2 mt-3">
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleExecuteNow(item.id)}
            >
              Execute Now
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => handleToggleStatus(item.id, item.is_active)}
            >
              {item.is_active ? "Pause" : "Activate"}
            </Button>
            {onEdit && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => onEdit(item)}
              >
                Edit
              </Button>
            )}
            <Button
              variant="danger"
              size="sm"
              onClick={() => handleDelete(item.id)}
            >
              Delete
            </Button>
          </div>
        </div>
      ))}
    </div>
  );
}
