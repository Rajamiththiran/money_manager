// File: src/components/ComparisonCard.tsx
import clsx from "clsx";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";
import type { PeriodComparison } from "../types/report";

interface ComparisonCardProps {
  comparison: PeriodComparison;
}

export default function ComparisonCard({ comparison }: ComparisonCardProps) {
  const formatChange = (change: number) => {
    const prefix = change >= 0 ? "+" : "";
    return `${prefix}${change.toFixed(1)}%`;
  };

  const getChangeColor = (change: number, isExpense: boolean = false) => {
    // For expenses, increase is bad (red), decrease is good (green)
    // For income/savings, increase is good (green), decrease is bad (red)
    if (isExpense) {
      return change <= 0
        ? "text-green-600 dark:text-green-400"
        : "text-red-600 dark:text-red-400";
    }
    return change >= 0
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";
  };

  const getChangeBg = (change: number, isExpense: boolean = false) => {
    if (isExpense) {
      return change <= 0
        ? "bg-green-50 dark:bg-green-900/10"
        : "bg-red-50 dark:bg-red-900/10";
    }
    return change >= 0
      ? "bg-green-50 dark:bg-green-900/10"
      : "bg-red-50 dark:bg-red-900/10";
  };

  const ChangeIcon = ({
    change,
    isExpense,
  }: {
    change: number;
    isExpense?: boolean;
  }) => {
    const isPositive = isExpense ? change <= 0 : change >= 0;
    return isPositive ? (
      <ArrowTrendingUpIcon className="h-4 w-4" />
    ) : (
      <ArrowTrendingDownIcon className="h-4 w-4" />
    );
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-6">
      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-6">
        Period Comparison
      </h3>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
        {/* Income Comparison */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Income
            </span>
            <div
              className={clsx(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                getChangeBg(comparison.incomeChange),
                getChangeColor(comparison.incomeChange),
              )}
            >
              <ChangeIcon change={comparison.incomeChange} />
              {formatChange(comparison.incomeChange)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Current
              </p>
              <p className="text-lg font-semibold text-green-600 dark:text-green-400">
                Rs{" "}
                {comparison.currentPeriod.totalIncome.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Previous
              </p>
              <p className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                Rs{" "}
                {comparison.previousPeriod.totalIncome.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
        </div>

        {/* Expense Comparison */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Expenses
            </span>
            <div
              className={clsx(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                getChangeBg(comparison.expenseChange, true),
                getChangeColor(comparison.expenseChange, true),
              )}
            >
              <ChangeIcon change={comparison.expenseChange} isExpense />
              {formatChange(comparison.expenseChange)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Current
              </p>
              <p className="text-lg font-semibold text-red-600 dark:text-red-400">
                Rs{" "}
                {comparison.currentPeriod.totalExpense.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Previous
              </p>
              <p className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                Rs{" "}
                {comparison.previousPeriod.totalExpense.toLocaleString(
                  "en-US",
                  {
                    minimumFractionDigits: 2,
                  },
                )}
              </p>
            </div>
          </div>
        </div>

        {/* Net Savings Comparison */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
              Net Savings
            </span>
            <div
              className={clsx(
                "flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                getChangeBg(comparison.savingsChange),
                getChangeColor(comparison.savingsChange),
              )}
            >
              <ChangeIcon change={comparison.savingsChange} />
              {formatChange(comparison.savingsChange)}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Current
              </p>
              <p
                className={clsx("text-lg font-semibold", {
                  "text-blue-600 dark:text-blue-400":
                    comparison.currentPeriod.netSavings >= 0,
                  "text-orange-600 dark:text-orange-400":
                    comparison.currentPeriod.netSavings < 0,
                })}
              >
                Rs{" "}
                {comparison.currentPeriod.netSavings.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
            <div>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Previous
              </p>
              <p className="text-lg font-semibold text-gray-600 dark:text-gray-400">
                Rs{" "}
                {comparison.previousPeriod.netSavings.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
            </div>
          </div>
        </div>
      </div>

      {/* Transaction Count */}
      <div className="mt-6 pt-4 border-t border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between text-sm">
          <span className="text-gray-600 dark:text-gray-400">
            Transactions this period
          </span>
          <span className="font-medium text-gray-900 dark:text-white">
            {comparison.currentPeriod.transactionCount} (vs{" "}
            {comparison.previousPeriod.transactionCount} previous)
          </span>
        </div>
      </div>
    </div>
  );
}
