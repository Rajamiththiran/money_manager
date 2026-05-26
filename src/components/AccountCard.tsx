// File: src/components/AccountCard.tsx
import { PencilIcon, TrashIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

interface AccountCardProps {
  id: number;
  name: string;
  groupName: string;
  groupId: number;
  currentBalance: number;
  initialBalance: number;
  currency: string;
  onEdit: (id: number) => void;
  onDelete: (id: number) => void;
  // Virtual Envelope props
  hasLinkedGoals?: boolean;
  unallocatedBalance?: number;
  allocatedBalance?: number;
}

export default function AccountCard({
  id,
  name,
  groupName,
  currentBalance,
  initialBalance,
  currency,
  onEdit,
  onDelete,
  hasLinkedGoals,
  unallocatedBalance,
  allocatedBalance,
}: AccountCardProps) {
  const isPositive = currentBalance >= 0;
  const change = currentBalance - initialBalance;

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-5 hover:shadow-md transition-shadow">
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-2">
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              {name}
            </h3>
            <span className="px-2 py-1 text-xs font-medium rounded-full bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
              {groupName}
            </span>
          </div>
          <p className="mt-1 text-sm text-gray-600 dark:text-gray-400">
            Initial: {initialBalance.toFixed(2)} {currency}
          </p>
        </div>
        <div className="flex items-center gap-1">
          <button
            onClick={() => onEdit(id)}
            className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            aria-label="Edit account"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(id)}
            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            aria-label="Delete account"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="mt-4">
        <p
          className={clsx("text-2xl font-bold", {
            "text-green-600 dark:text-green-400": isPositive,
            "text-red-600 dark:text-red-400": !isPositive,
          })}
        >
          {currentBalance.toFixed(2)} {currency}
        </p>
        {change !== 0 && (
          <p
            className={clsx("text-sm font-medium mt-1", {
              "text-green-600 dark:text-green-400": change > 0,
              "text-red-600 dark:text-red-400": change < 0,
            })}
          >
            {change > 0 ? "+" : ""}
            {change.toFixed(2)} {currency}
          </p>
        )}
      </div>

      {/* Virtual Envelope: Unallocated Balance */}
      {hasLinkedGoals && unallocatedBalance !== undefined && allocatedBalance !== undefined && (
        <div className="mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-1.5 mb-2">
            <svg className="h-3.5 w-3.5 text-accent-500" viewBox="0 0 20 20" fill="currentColor">
              <path d="M2.5 4A1.5 1.5 0 001 5.5V6h18v-.5A1.5 1.5 0 0017.5 4h-15zM19 8H1v6.5A1.5 1.5 0 002.5 16h15a1.5 1.5 0 001.5-1.5V8zM3 13.25a.75.75 0 01.75-.75h1.5a.75.75 0 010 1.5h-1.5a.75.75 0 01-.75-.75zm4.75-.75a.75.75 0 000 1.5h3.5a.75.75 0 000-1.5h-3.5z" />
            </svg>
            <span className="text-xs font-medium text-gray-500 dark:text-gray-400">
              Virtual Envelope
            </span>
          </div>
          <div className="space-y-1">
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Allocated to goals
              </span>
              <span className="text-xs font-medium text-accent-600 dark:text-accent-400">
                {allocatedBalance.toFixed(2)} {currency}
              </span>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Unallocated
              </span>
              <span
                className={clsx("text-xs font-semibold", {
                  "text-green-600 dark:text-green-400": unallocatedBalance >= 0,
                  "text-red-600 dark:text-red-400": unallocatedBalance < 0,
                })}
              >
                {unallocatedBalance.toFixed(2)} {currency}
              </span>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
