// File: src/components/Calendar.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ChevronLeftIcon, ChevronRightIcon } from "@heroicons/react/24/outline";
import CalendarDay from "./CalendarDay";

interface DailySummary {
  date: string;
  total_income: number;
  total_expense: number;
  net: number;
  transaction_count: number;
}

interface TransactionWithDetails {
  id: number;
  date: string;
  transaction_type: string;
  amount: number;
  account_name: string;
  to_account_name: string | null;
  category_name: string | null;
  memo: string | null;
}

export default function Calendar() {
  const [currentDate, setCurrentDate] = useState(new Date());
  const [dailySummaries, setDailySummaries] = useState<
    Map<string, DailySummary>
  >(new Map());
  const [selectedDate, setSelectedDate] = useState<string | null>(null);
  const [selectedTransactions, setSelectedTransactions] = useState<
    TransactionWithDetails[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadMonthData();
  }, [currentDate]);

  const loadMonthData = async () => {
    setLoading(true);
    try {
      const year = currentDate.getFullYear();
      const month = currentDate.getMonth();

      const firstDay = new Date(year, month, 1);
      const lastDay = new Date(year, month + 1, 0);

      const startDate = firstDay.toISOString().split("T")[0];
      const endDate = lastDay.toISOString().split("T")[0];

      const summaries = await invoke<DailySummary[]>("get_daily_summary", {
        startDate,
        endDate,
      });

      const summaryMap = new Map<string, DailySummary>();
      summaries.forEach((summary) => {
        summaryMap.set(summary.date, summary);
      });

      setDailySummaries(summaryMap);
    } catch (error) {
      console.error("Failed to load calendar data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadDayTransactions = async (dateStr: string) => {
    try {
      const transactions = await invoke<TransactionWithDetails[]>(
        "get_transactions_filtered",
        {
          filter: {
            start_date: dateStr,
            end_date: dateStr,
          },
        },
      );
      setSelectedTransactions(transactions);
      setSelectedDate(dateStr);
    } catch (error) {
      console.error("Failed to load transactions:", error);
    }
  };

  const previousMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() - 1),
    );
    setSelectedDate(null);
  };

  const nextMonth = () => {
    setCurrentDate(
      new Date(currentDate.getFullYear(), currentDate.getMonth() + 1),
    );
    setSelectedDate(null);
  };

  const today = () => {
    setCurrentDate(new Date());
    setSelectedDate(null);
  };

  // Generate calendar grid
  const generateCalendar = () => {
    const year = currentDate.getFullYear();
    const month = currentDate.getMonth();

    const firstDayOfMonth = new Date(year, month, 1);
    const lastDayOfMonth = new Date(year, month + 1, 0);
    const startingDayOfWeek = firstDayOfMonth.getDay();

    const daysInMonth = lastDayOfMonth.getDate();
    const daysInPrevMonth = new Date(year, month, 0).getDate();

    const calendarDays: (Date | null)[] = [];

    // Previous month days
    for (let i = startingDayOfWeek - 1; i >= 0; i--) {
      calendarDays.push(new Date(year, month - 1, daysInPrevMonth - i));
    }

    // Current month days
    for (let day = 1; day <= daysInMonth; day++) {
      calendarDays.push(new Date(year, month, day));
    }

    // Next month days to fill grid
    const remainingDays = 42 - calendarDays.length; // 6 rows × 7 days
    for (let day = 1; day <= remainingDays; day++) {
      calendarDays.push(new Date(year, month + 1, day));
    }

    return calendarDays;
  };

  const calendarDays = generateCalendar();
  const monthName = currentDate.toLocaleString("default", {
    month: "long",
    year: "numeric",
  });
  const todayStr = new Date().toISOString().split("T")[0];

  return (
    <div className="space-y-6">
      {/* Calendar Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          {monthName}
        </h2>
        <div className="flex items-center gap-2">
          <button
            onClick={today}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Today
          </button>
          <button
            onClick={previousMonth}
            className="p-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronLeftIcon className="h-5 w-5" />
          </button>
          <button
            onClick={nextMonth}
            className="p-2 text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            <ChevronRightIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Day Headers */}
      <div className="grid grid-cols-7 gap-0 border-b border-gray-200 dark:border-gray-700">
        {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((day) => (
          <div
            key={day}
            className="py-2 text-center text-sm font-semibold text-gray-700 dark:text-gray-300"
          >
            {day}
          </div>
        ))}
      </div>

      {/* Calendar Grid */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <div className="grid grid-cols-7 gap-0 border-l border-t border-gray-200 dark:border-gray-700">
          {calendarDays.map((date, index) => {
            if (!date) return <div key={index} />;

            const dateStr = date.toISOString().split("T")[0];
            const summary = dailySummaries.get(dateStr);
            const isToday = dateStr === todayStr;
            const isCurrentMonth = date.getMonth() === currentDate.getMonth();

            return (
              <CalendarDay
                key={index}
                date={date}
                income={summary?.total_income || 0}
                expense={summary?.total_expense || 0}
                isToday={isToday}
                isCurrentMonth={isCurrentMonth}
                onClick={() => loadDayTransactions(dateStr)}
              />
            );
          })}
        </div>
      )}

      {/* Selected Day Transactions */}
      {selectedDate && (
        <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
            Transactions for{" "}
            {new Date(selectedDate).toLocaleDateString("en-US", {
              weekday: "long",
              year: "numeric",
              month: "long",
              day: "numeric",
            })}
          </h3>

          {selectedTransactions.length === 0 ? (
            <p className="text-gray-600 dark:text-gray-400">
              No transactions on this day
            </p>
          ) : (
            <div className="space-y-3">
              {selectedTransactions.map((txn) => (
                <div
                  key={txn.id}
                  className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50"
                >
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {txn.category_name || txn.transaction_type}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {txn.account_name}
                      {txn.to_account_name && ` → ${txn.to_account_name}`}
                    </p>
                    {txn.memo && (
                      <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                        {txn.memo}
                      </p>
                    )}
                  </div>
                  <p
                    className={`text-lg font-semibold ${
                      txn.transaction_type === "INCOME"
                        ? "text-green-600 dark:text-green-400"
                        : txn.transaction_type === "EXPENSE"
                          ? "text-red-600 dark:text-red-400"
                          : "text-blue-600 dark:text-blue-400"
                    }`}
                  >
                    {txn.transaction_type === "INCOME" ? "+" : "-"}Rs{" "}
                    {txn.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
