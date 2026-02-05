// File: src/components/AccountActivityCard.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import clsx from "clsx";
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";
import type { AccountWithBalance } from "../types/account";
import type { TransactionWithDetails } from "../types/transaction";

interface AccountActivityCardProps {
  account: AccountWithBalance;
  startDate: string;
  endDate: string;
}

export default function AccountActivityCard({
  account,
  startDate,
  endDate,
}: AccountActivityCardProps) {
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>(
    [],
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadAccountTransactions();
  }, [account.id, startDate, endDate]);

  const loadAccountTransactions = async () => {
    setLoading(true);
    try {
      const result = await invoke<TransactionWithDetails[]>(
        "get_transactions_filtered",
        {
          filter: {
            start_date: startDate,
            end_date: endDate,
            account_id: account.id,
          },
        },
      );
      setTransactions(result);
    } catch (error) {
      console.error("Failed to load account transactions:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate activity summary
  const activity = transactions.reduce(
    (acc, txn) => {
      if (txn.transaction_type === "INCOME") {
        acc.inflow += txn.amount;
        acc.incomeCount++;
      } else if (txn.transaction_type === "EXPENSE") {
        acc.outflow += txn.amount;
        acc.expenseCount++;
      } else if (txn.transaction_type === "TRANSFER") {
        if (txn.account_id === account.id) {
          acc.outflow += txn.amount;
          acc.transferOutCount++;
        }
        if (txn.to_account_id === account.id) {
          acc.inflow += txn.amount;
          acc.transferInCount++;
        }
      }
      return acc;
    },
    {
      inflow: 0,
      outflow: 0,
      incomeCount: 0,
      expenseCount: 0,
      transferInCount: 0,
      transferOutCount: 0,
    },
  );

  const netChange = activity.inflow - activity.outflow;
  const totalTransactions =
    activity.incomeCount +
    activity.expenseCount +
    activity.transferInCount +
    activity.transferOutCount;

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
        <div className="animate-pulse">
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-1/3 mb-4"></div>
          <div className="h-8 bg-gray-200 dark:bg-gray-700 rounded w-1/2 mb-4"></div>
          <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded w-2/3"></div>
        </div>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 hover:shadow-md transition-shadow">
      {/* Account Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/20">
            <BanknotesIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
          </div>
          <div>
            <h3 className="font-semibold text-gray-900 dark:text-white">
              {account.name}
            </h3>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              {account.currency}
            </p>
          </div>
        </div>
        <div className="text-right">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            Current Balance
          </p>
          <p
            className={clsx("text-lg font-bold", {
              "text-green-600 dark:text-green-400":
                account.current_balance >= 0,
              "text-red-600 dark:text-red-400": account.current_balance < 0,
            })}
          >
            Rs{" "}
            {account.current_balance.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </p>
        </div>
      </div>

      {/* Activity Summary */}
      <div className="grid grid-cols-3 gap-4 mb-4">
        <div className="text-center p-3 rounded-lg bg-green-50 dark:bg-green-900/10">
          <div className="flex items-center justify-center gap-1 mb-1">
            <ArrowTrendingUpIcon className="h-4 w-4 text-green-600 dark:text-green-400" />
            <span className="text-xs text-green-600 dark:text-green-400 font-medium">
              Inflow
            </span>
          </div>
          <p className="text-lg font-semibold text-green-700 dark:text-green-300">
            Rs{" "}
            {activity.inflow.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {activity.incomeCount + activity.transferInCount} transactions
          </p>
        </div>

        <div className="text-center p-3 rounded-lg bg-red-50 dark:bg-red-900/10">
          <div className="flex items-center justify-center gap-1 mb-1">
            <ArrowTrendingDownIcon className="h-4 w-4 text-red-600 dark:text-red-400" />
            <span className="text-xs text-red-600 dark:text-red-400 font-medium">
              Outflow
            </span>
          </div>
          <p className="text-lg font-semibold text-red-700 dark:text-red-300">
            Rs{" "}
            {activity.outflow.toLocaleString("en-US", {
              minimumFractionDigits: 2,
            })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {activity.expenseCount + activity.transferOutCount} transactions
          </p>
        </div>

        <div
          className={clsx("text-center p-3 rounded-lg", {
            "bg-blue-50 dark:bg-blue-900/10": netChange >= 0,
            "bg-orange-50 dark:bg-orange-900/10": netChange < 0,
          })}
        >
          <div className="flex items-center justify-center gap-1 mb-1">
            <BanknotesIcon
              className={clsx("h-4 w-4", {
                "text-blue-600 dark:text-blue-400": netChange >= 0,
                "text-orange-600 dark:text-orange-400": netChange < 0,
              })}
            />
            <span
              className={clsx("text-xs font-medium", {
                "text-blue-600 dark:text-blue-400": netChange >= 0,
                "text-orange-600 dark:text-orange-400": netChange < 0,
              })}
            >
              Net
            </span>
          </div>
          <p
            className={clsx("text-lg font-semibold", {
              "text-blue-700 dark:text-blue-300": netChange >= 0,
              "text-orange-700 dark:text-orange-300": netChange < 0,
            })}
          >
            {netChange >= 0 ? "+" : ""}Rs{" "}
            {netChange.toLocaleString("en-US", { minimumFractionDigits: 2 })}
          </p>
          <p className="text-xs text-gray-500 dark:text-gray-400">
            {totalTransactions} total
          </p>
        </div>
      </div>

      {/* Transaction Breakdown */}
      {totalTransactions > 0 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-2">
            Transaction Breakdown
          </p>
          <div className="grid grid-cols-2 gap-2 text-sm">
            {activity.incomeCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">Income</span>
                <span className="font-medium text-green-600 dark:text-green-400">
                  {activity.incomeCount}
                </span>
              </div>
            )}
            {activity.expenseCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  Expenses
                </span>
                <span className="font-medium text-red-600 dark:text-red-400">
                  {activity.expenseCount}
                </span>
              </div>
            )}
            {activity.transferInCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  Transfers In
                </span>
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {activity.transferInCount}
                </span>
              </div>
            )}
            {activity.transferOutCount > 0 && (
              <div className="flex items-center justify-between">
                <span className="text-gray-500 dark:text-gray-400">
                  Transfers Out
                </span>
                <span className="font-medium text-blue-600 dark:text-blue-400">
                  {activity.transferOutCount}
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {totalTransactions === 0 && (
        <div className="pt-4 border-t border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
            No transactions in this period
          </p>
        </div>
      )}
    </div>
  );
}
