// File: src/components/BudgetCard.tsx
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";
import ProgressBar from "./ProgressBar";
import type { BudgetStatus } from "../types/budget";

interface BudgetCardProps {
  status: BudgetStatus;
  onEdit: (status: BudgetStatus) => void;
  onDelete: (id: number) => void;
}

export default function BudgetCard({
  status,
  onEdit,
  onDelete,
}: BudgetCardProps) {
  const alertLevel =
    status.percentage_used >= 120
      ? "critical"
      : status.percentage_used >= 100
        ? "danger"
        : status.percentage_used >= 80
          ? "warning"
          : "success";

  const alertBorderClass = {
    success: "border-green-200 dark:border-green-800",
    warning: "border-yellow-200 dark:border-yellow-800",
    danger: "border-red-200 dark:border-red-800",
    critical: "border-red-400 dark:border-red-600",
  };

  const alertBgClass = {
    success: "bg-green-50 dark:bg-green-900/10",
    warning: "bg-yellow-50 dark:bg-yellow-900/10",
    danger: "bg-red-50 dark:bg-red-900/10",
    critical: "bg-red-100 dark:bg-red-900/20",
  };

  return (
    <div
      className={clsx(
        "rounded-lg border-2 p-6 transition-all hover:shadow-md",
        alertBorderClass[alertLevel],
        alertBgClass[alertLevel],
      )}
    >
      {/* Header */}
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
            {status.category_name}
          </h3>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {status.period} Budget
          </p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(status)}
            className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            aria-label="Edit budget"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(status.id)}
            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            aria-label="Delete budget"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Budget Amount */}
      <div className="mb-4">
        <div className="flex items-baseline justify-between">
          <span className="text-2xl font-bold text-gray-900 dark:text-white">
            Rs{" "}
            {status.spent_amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </span>
          <span className="text-sm text-gray-600 dark:text-gray-400">
            of Rs{" "}
            {status.amount.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </span>
        </div>
      </div>

      {/* Progress Bar */}
      <div className="mb-4">
        <ProgressBar percentage={status.percentage_used} />
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-2 gap-4 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Remaining</p>
          <p
            className={clsx("text-sm font-semibold", {
              "text-green-600 dark:text-green-400": !status.is_over_budget,
              "text-red-600 dark:text-red-400": status.is_over_budget,
            })}
          >
            Rs{" "}
            {Math.abs(status.remaining_amount).toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
            {status.is_over_budget && " over"}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Days Left</p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            {status.days_remaining} days
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Daily Avg Spent
          </p>
          <p className="text-sm font-semibold text-gray-900 dark:text-white">
            Rs{" "}
            {status.daily_average_spent.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            Daily Budget Left
          </p>
          <p
            className={clsx("text-sm font-semibold", {
              "text-green-600 dark:text-green-400":
                status.daily_budget_remaining > 0,
              "text-red-600 dark:text-red-400":
                status.daily_budget_remaining <= 0,
            })}
          >
            Rs{" "}
            {Math.abs(status.daily_budget_remaining).toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
      </div>
    </div>
  );
}
