// File: src/components/CalendarDay.tsx
import clsx from "clsx";

interface CalendarDayProps {
  date: Date | null;
  income: number;
  expense: number;
  isToday: boolean;
  isCurrentMonth: boolean;
  onClick: () => void;
}

export default function CalendarDay({
  date,
  income,
  expense,
  isToday,
  isCurrentMonth,
  onClick,
}: CalendarDayProps) {
  if (!date) {
    return (
      <div className="aspect-square border border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900" />
    );
  }

  const hasTransactions = income > 0 || expense > 0;
  const net = income - expense;

  return (
    <button
      onClick={onClick}
      className={clsx(
        "aspect-square border p-2 transition-all hover:shadow-md group",
        {
          "bg-white dark:bg-gray-800 border-gray-200 dark:border-gray-700":
            isCurrentMonth,
          "bg-gray-50 dark:bg-gray-900 border-gray-200 dark:border-gray-800 opacity-50":
            !isCurrentMonth,
          "ring-2 ring-blue-500": isToday,
          "hover:bg-gray-50 dark:hover:bg-gray-700": isCurrentMonth,
        },
      )}
    >
      <div className="h-full flex flex-col">
        {/* Date Number */}
        <div className="flex items-center justify-between mb-1">
          <span
            className={clsx("text-sm font-semibold", {
              "text-gray-900 dark:text-white": isCurrentMonth,
              "text-gray-400 dark:text-gray-600": !isCurrentMonth,
              "text-blue-600 dark:text-blue-400": isToday,
            })}
          >
            {date.getDate()}
          </span>
          {hasTransactions && (
            <div className="w-1.5 h-1.5 rounded-full bg-blue-500" />
          )}
        </div>

        {/* Income/Expense Display */}
        {hasTransactions && (
          <div className="flex-1 flex flex-col justify-center space-y-1 text-xs">
            {income > 0 && (
              <div className="text-green-600 dark:text-green-400 font-medium truncate">
                +{income.toLocaleString()}
              </div>
            )}
            {expense > 0 && (
              <div className="text-red-600 dark:text-red-400 font-medium truncate">
                -{expense.toLocaleString()}
              </div>
            )}
            {income > 0 && expense > 0 && (
              <div
                className={clsx(
                  "font-semibold truncate border-t pt-1 dark:border-gray-600",
                  {
                    "text-green-600 dark:text-green-400": net > 0,
                    "text-red-600 dark:text-red-400": net < 0,
                    "text-gray-600 dark:text-gray-400": net === 0,
                  },
                )}
              >
                {net > 0 ? "+" : ""}
                {net.toLocaleString()}
              </div>
            )}
          </div>
        )}
      </div>
    </button>
  );
}
