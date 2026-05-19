// File: src/components/ExecutionHistoryPanel.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ClockIcon,
  CheckCircleIcon,
  ForwardIcon,
  ExclamationTriangleIcon,
  ChevronDownIcon,
  ChevronUpIcon,
} from "@heroicons/react/24/outline";
import type { RecurringExecutionLog } from "../types/recurring";

interface ExecutionHistoryPanelProps {
  recurringId: number;
  refreshKey?: number;
}

const STATUS_CONFIG: Record<
  string,
  { icon: typeof CheckCircleIcon; color: string; label: string }
> = {
  SUCCESS: {
    icon: CheckCircleIcon,
    color: "text-emerald-500",
    label: "Executed",
  },
  SKIPPED: {
    icon: ForwardIcon,
    color: "text-amber-500",
    label: "Skipped",
  },
  FAILED: {
    icon: ExclamationTriangleIcon,
    color: "text-red-500",
    label: "Failed",
  },
  VARIABLE_PENDING: {
    icon: ClockIcon,
    color: "text-blue-500",
    label: "Pending",
  },
};

export default function ExecutionHistoryPanel({
  recurringId,
  refreshKey,
}: ExecutionHistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [logs, setLogs] = useState<RecurringExecutionLog[]>([]);
  const [loading, setLoading] = useState(false);
  const [loaded, setLoaded] = useState(false);

  useEffect(() => {
    if (open) {
      loadHistory();
    }
  }, [open, recurringId, refreshKey]);

  const loadHistory = async () => {
    setLoading(true);
    try {
      const data = await invoke<RecurringExecutionLog[]>(
        "get_execution_history",
        { recurringId },
      );
      setLogs(data);
      setLoaded(true);
    } catch (err) {
      console.error("Failed to load execution history:", err);
    } finally {
      setLoading(false);
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

  return (
    <div className="mt-2">
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-1.5 text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 transition-colors"
      >
        <ClockIcon className="h-3.5 w-3.5" />
        Execution History
        {open ? (
          <ChevronUpIcon className="h-3 w-3" />
        ) : (
          <ChevronDownIcon className="h-3 w-3" />
        )}
      </button>

      {open && (
        <div className="mt-2 rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
          {loading ? (
            <div className="p-3 text-center text-xs text-gray-400">
              Loading...
            </div>
          ) : logs.length === 0 ? (
            <div className="p-3 text-center text-xs text-gray-400">
              No execution history yet
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto">
              <table className="w-full text-xs">
                <thead>
                  <tr className="bg-gray-50 dark:bg-gray-700/50 text-gray-500 dark:text-gray-400">
                    <th className="text-left px-3 py-2 font-medium">Date</th>
                    <th className="text-left px-3 py-2 font-medium">Status</th>
                    <th className="text-right px-3 py-2 font-medium">Amount</th>
                    <th className="text-left px-3 py-2 font-medium">Notes</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-100 dark:divide-gray-700">
                  {logs.map((log) => {
                    const config = STATUS_CONFIG[log.status] || STATUS_CONFIG.SUCCESS;
                    const Icon = config.icon;
                    return (
                      <tr
                        key={log.id}
                        className="hover:bg-gray-50 dark:hover:bg-gray-700/30 transition-colors"
                      >
                        <td className="px-3 py-2 text-gray-700 dark:text-gray-300">
                          {formatDate(log.execution_date)}
                        </td>
                        <td className="px-3 py-2">
                          <span className={`flex items-center gap-1 ${config.color}`}>
                            <Icon className="h-3.5 w-3.5" />
                            {config.label}
                          </span>
                        </td>
                        <td className="px-3 py-2 text-right text-gray-700 dark:text-gray-300">
                          {log.amount != null
                            ? `Rs ${log.amount.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}`
                            : "—"}
                        </td>
                        <td className="px-3 py-2 text-gray-500 dark:text-gray-400 truncate max-w-[120px]">
                          {log.notes || "—"}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
