// File: src/components/TransactionList.tsx
import {
  PencilIcon,
  TrashIcon,
  DocumentDuplicateIcon,
  ArrowUpIcon,
  ArrowDownIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { TransactionWithDetails } from "../types/transaction";

interface TransactionListProps {
  transactions: TransactionWithDetails[];
  onEdit: (transaction: TransactionWithDetails) => void;
  onDelete: (id: number) => void;
  onDuplicate: (transaction: TransactionWithDetails) => void;
}

export default function TransactionList({
  transactions,
  onEdit,
  onDelete,
  onDuplicate,
}: TransactionListProps) {
  if (transactions.length === 0) {
    return (
      <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
        <p className="text-gray-600 dark:text-gray-400">
          No transactions yet. Create your first one!
        </p>
      </div>
    );
  }

  const getTypeIcon = (type: string) => {
    switch (type) {
      case "INCOME":
        return <ArrowDownIcon className="h-5 w-5 text-green-600" />;
      case "EXPENSE":
        return <ArrowUpIcon className="h-5 w-5 text-red-600" />;
      case "TRANSFER":
        return <ArrowsRightLeftIcon className="h-5 w-5 text-blue-600" />;
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

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      {/* Desktop Table View */}
      <div className="hidden md:block overflow-x-auto">
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
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Amount
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Memo
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider">
                Actions
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
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                  {txn.amount.toFixed(2)}
                </td>
                <td className="px-6 py-4 text-sm text-gray-600 dark:text-gray-400 max-w-xs truncate">
                  {txn.memo || "-"}
                </td>
                <td className="px-6 py-4 whitespace-nowrap text-right text-sm">
                  <div className="flex items-center justify-end gap-2">
                    <button
                      onClick={() => onDuplicate(txn)}
                      className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="Duplicate"
                    >
                      <DocumentDuplicateIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onEdit(txn)}
                      className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                      title="Edit"
                    >
                      <PencilIcon className="h-4 w-4" />
                    </button>
                    <button
                      onClick={() => onDelete(txn.id)}
                      className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                      title="Delete"
                    >
                      <TrashIcon className="h-4 w-4" />
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {/* Mobile Card View */}
      <div className="md:hidden divide-y divide-gray-200 dark:divide-gray-700">
        {transactions.map((txn) => (
          <div key={txn.id} className="p-4">
            <div className="flex items-start justify-between mb-2">
              <div className="flex items-center gap-2">
                <span
                  className={clsx(
                    "inline-flex items-center gap-1 px-2 py-1 rounded-full text-xs font-medium",
                    getTypeColor(txn.transaction_type),
                  )}
                >
                  {getTypeIcon(txn.transaction_type)}
                  {txn.transaction_type}
                </span>
                <span className="text-sm text-gray-600 dark:text-gray-400">
                  {new Date(txn.date).toLocaleDateString()}
                </span>
              </div>
              <span className="text-lg font-bold text-gray-900 dark:text-white">
                {txn.amount.toFixed(2)}
              </span>
            </div>
            <div className="text-sm text-gray-900 dark:text-white mb-1">
              {txn.transaction_type === "TRANSFER" ? (
                <span>
                  {txn.account_name} → {txn.to_account_name}
                </span>
              ) : (
                <>
                  {txn.account_name} • {txn.category_name}
                </>
              )}
            </div>
            {txn.memo && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                {txn.memo}
              </p>
            )}
            <div className="flex items-center gap-2">
              <button
                onClick={() => onDuplicate(txn)}
                className="flex-1 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
              >
                Duplicate
              </button>
              <button
                onClick={() => onEdit(txn)}
                className="flex-1 px-3 py-1 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors"
              >
                Edit
              </button>
              <button
                onClick={() => onDelete(txn.id)}
                className="flex-1 px-3 py-1 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded transition-colors"
              >
                Delete
              </button>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
