// File: src/components/AccountCard.tsx
import { TrashIcon } from "@heroicons/react/24/outline";
import clsx from "clsx";

interface AccountCardProps {
  id: number;
  name: string;
  groupName: string;
  currentBalance: number;
  initialBalance: number;
  currency: string;
  onDelete: (id: number) => void;
}

export default function AccountCard({
  id,
  name,
  groupName,
  currentBalance,
  initialBalance,
  currency,
  onDelete,
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
        <button
          onClick={() => onDelete(id)}
          className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
          aria-label="Delete account"
        >
          <TrashIcon className="h-5 w-5" />
        </button>
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
    </div>
  );
}
