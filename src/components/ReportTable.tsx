// File: src/components/ReportTable.tsx
import {
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { TransactionWithDetails } from "../types/transaction";

interface ReportTableProps {
  transactions: TransactionWithDetails[];
}

export default function ReportTable({ transactions }: ReportTableProps) {
  if (transactions.length === 0) {
    return (
      <div className="p-8 text-center">
        <p className="text-gray-500 dark:text-gray-400">
          No transactions found for the selected period
        </p>
      </div>
    );
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "INCOME":
        return <ArrowDownIcon className="h-4 w-4 text-green-600" />;
      case "EXPENSE":
        return <ArrowUpIcon className="h-4 w-4 text-red-600" />;
      case "TRANSFER":
        return <ArrowsRightLeftIcon className="h-4 w-4 text-blue-600" />;
      default:
        return null;
    }
  };

  const getTypeColor = (type: string) => {
    switch (type) {
      case "INCOME":
        return "text-green-600 dark:text-green-400 bg-green-50 dark:bg-green-900/20";
      case "EXPENSE":
        return "text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-900/20";
      case "TRANSFER":
        return "text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20";
      default:
        return "";
    }
  };

  // Calculate totals
  const totals = transactions.reduce(
    (acc, txn) => {
      if (txn.transaction_type === "INCOME") {
        acc.income += txn.amount;
      } else if (txn.transaction_type === "EXPENSE") {
        acc.expense += txn.amount;
      }
      return acc;
    },
    { income: 0, expense: 0 },
  );

  return (
    <div>
      {/* Summary Header */}
      <div className="p-4 bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center justify-between">
          <span className="text-sm font-medium text-gray-600 dark:text-gray-400">
            {transactions.length} transactions
          </span>
          <div className="flex items-center gap-6 text-sm">
            <span>
              <span className="text-gray-500 dark:text-gray-400">Income: </span>
              <span className="font-medium text-green-600 dark:text-green-400">
                Rs{" "}
                {totals.income.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </span>
            <span>
              <span className="text-gray-500 dark:text-gray-400">
                Expenses:{" "}
              </span>
              <span className="font-medium text-red-600 dark:text-red-400">
                Rs{" "}
                {totals.expense.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </span>
            <span>
              <span className="text-gray-500 dark:text-gray-400">Net: </span>
              <span
                className={clsx("font-medium", {
                  "text-blue-600 dark:text-blue-400":
                    totals.income - totals.expense >= 0,
                  "text-orange-600 dark:text-orange-400":
                    totals.income - totals.expense < 0,
                })}
              >
                Rs{" "}
                {(totals.income - totals.expense).toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </span>
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-gray-700/50 border-b border-gray-200 dark:border-gray-700">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Date
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Type
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Account
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Category
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Memo
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
            {transactions.map((txn) => (
              <tr
                key={txn.id}
                className="hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900 dark:text-white">
                  {new Date(txn.date).toLocaleDateString()}
                </td>
                <td className="px-6 py-4 whitespace-nowrap">
                  <span
                    className={clsx(
                      "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                      getTypeColor(txn.transaction_type),
                    )}
                  >
                    {getTypeIcon(txn.transaction_type)}
                    {txn.transaction_type}
                  </span>
                </td>
                <td className="px-6 py-4 text-sm text-gray-900 dark:text-white">
                  {txn.transaction_type === "TRANSFER" ? (
                    <span>
                      {txn.account_name} → {txn.to_account_name}
                    </span>
                  ) : (
                    txn.account_name
                  )}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400">
                  {txn.category_name || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-right font-medium text-gray-900 dark:text-white">
                  Rs{" "}
                  {txn.amount.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                  })}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                  {txn.memo || "-"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
