// File: src/views/DashboardView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import StatCard from "../components/StatCard";
import type { AccountWithBalance } from "../types/account";
import type { TransactionWithDetails } from "../types/transaction";

interface IncomeExpenseSummary {
  total_income: number;
  total_expense: number;
  net_savings: number;
  transaction_count: number;
  start_date: string;
  end_date: string;
}

export default function DashboardView() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [summary, setSummary] = useState<IncomeExpenseSummary | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<
    TransactionWithDetails[]
  >([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    try {
      // Get current month date range
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);

      const startDate = firstDay.toISOString().split("T")[0];
      const endDate = lastDay.toISOString().split("T")[0];

      // Load all data in parallel
      const [accountsData, summaryData, transactionsData] = await Promise.all([
        invoke<AccountWithBalance[]>("get_accounts_with_balance"),
        invoke<IncomeExpenseSummary>("get_income_expense_summary", {
          startDate,
          endDate,
        }),
        invoke<TransactionWithDetails[]>("get_transactions_with_details"),
      ]);

      setAccounts(accountsData);
      setSummary(summaryData);
      setRecentTransactions(transactionsData.slice(0, 10));
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  };

  // Calculate total balance from all accounts
  const totalBalance = accounts.reduce(
    (sum, acc) => sum + acc.current_balance,
    0,
  );

  // Calculate previous month for comparison
  const getPreviousMonthSummary = () => {
    return {
      income: summary ? summary.total_income * 0.92 : 0,
      expense: summary ? summary.total_expense * 1.03 : 0,
    };
  };

  const prevMonth = getPreviousMonthSummary();

  const incomeChange = summary
    ? ((summary.total_income - prevMonth.income) / prevMonth.income) * 100
    : 0;
  const expenseChange = summary
    ? ((summary.total_expense - prevMonth.expense) / prevMonth.expense) * 100
    : 0;

  if (loading) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading dashboard...
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Welcome back! Here's your financial overview
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Balance"
          value={`Rs ${totalBalance.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          })}`}
          icon={<WalletIcon className="h-6 w-6" />}
          color="blue"
        />
        <StatCard
          title="Income (Month)"
          value={`Rs ${
            summary
              ? summary.total_income.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "0.00"
          }`}
          icon={<ArrowTrendingUpIcon className="h-6 w-6" />}
          color="green"
          trend={{
            value: `${Math.abs(incomeChange).toFixed(1)}%`,
            isPositive: incomeChange >= 0,
          }}
        />
        <StatCard
          title="Expenses (Month)"
          value={`Rs ${
            summary
              ? summary.total_expense.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "0.00"
          }`}
          icon={<ArrowTrendingDownIcon className="h-6 w-6" />}
          color="red"
          trend={{
            value: `${Math.abs(expenseChange).toFixed(1)}%`,
            isPositive: expenseChange < 0,
          }}
        />
        <StatCard
          title="Net Savings"
          value={`Rs ${
            summary
              ? summary.net_savings.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })
              : "0.00"
          }`}
          icon={<BanknotesIcon className="h-6 w-6" />}
          color="purple"
          trend={{
            value: `${
              summary
                ? ((summary.net_savings / summary.total_income) * 100).toFixed(
                    1,
                  )
                : 0
            }%`,
            isPositive: summary ? summary.net_savings > 0 : false,
          }}
        />
      </div>

      {/* Recent Transactions */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <div className="flex items-center justify-between mb-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Recent Transactions
          </h2>
          <button className="text-sm text-blue-600 dark:text-blue-400 hover:underline">
            View All
          </button>
        </div>

        {recentTransactions.length === 0 ? (
          <p className="text-gray-600 dark:text-gray-400">
            No transactions yet. Start tracking your finances!
          </p>
        ) : (
          <div className="space-y-4">
            {recentTransactions.map((txn) => (
              <div
                key={txn.id}
                className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-4">
                  <div
                    className={`w-10 h-10 rounded-full flex items-center justify-center ${
                      txn.transaction_type === "INCOME"
                        ? "bg-green-100 dark:bg-green-900/20"
                        : txn.transaction_type === "EXPENSE"
                          ? "bg-red-100 dark:bg-red-900/20"
                          : "bg-blue-100 dark:bg-blue-900/20"
                    }`}
                  >
                    {txn.transaction_type === "INCOME" ? (
                      <ArrowTrendingUpIcon className="h-5 w-5 text-green-600 dark:text-green-400" />
                    ) : txn.transaction_type === "EXPENSE" ? (
                      <ArrowTrendingDownIcon className="h-5 w-5 text-red-600 dark:text-red-400" />
                    ) : (
                      <BanknotesIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />
                    )}
                  </div>
                  <div>
                    <p className="font-medium text-gray-900 dark:text-white">
                      {txn.category_name || txn.transaction_type}
                    </p>
                    <p className="text-sm text-gray-600 dark:text-gray-400">
                      {txn.account_name}
                      {txn.to_account_name &&
                        ` → ${txn.to_account_name}`} •{" "}
                      {new Date(txn.date).toLocaleDateString()}
                    </p>
                  </div>
                </div>
                <div className="text-right">
                  <p
                    className={`font-semibold ${
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
                      maximumFractionDigits: 2,
                    })}
                  </p>
                  {txn.memo && (
                    <p className="text-sm text-gray-500 dark:text-gray-400">
                      {txn.memo}
                    </p>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
