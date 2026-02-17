// File: src/views/DashboardView.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import StatCard from "../components/StatCard";
import CategorySpendingChart from "../components/CategorySpendingChart";
import Calendar from "../components/Calendar";
import QuickAddBar from "../components/QuickAddBar";
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

type ComparisonMode = "month" | "year" | "quarter";

export default function DashboardView() {
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [summary, setSummary] = useState<IncomeExpenseSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<IncomeExpenseSummary | null>(
    null,
  );
  const [recentTransactions, setRecentTransactions] = useState<
    TransactionWithDetails[]
  >([]);
  const [loading, setLoading] = useState(true);
  const [dateRange, setDateRange] = useState({ start: "", end: "" });
  const [activeTab, setActiveTab] = useState<"overview" | "calendar">(
    "overview",
  );
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("month");

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      const now = new Date();

      // Current month
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      const startDate = firstDay.toISOString().split("T")[0];
      const endDate = lastDay.toISOString().split("T")[0];

      setDateRange({ start: startDate, end: endDate });

      // Calculate comparison period based on mode
      let prevStartDate: string;
      let prevEndDate: string;

      switch (comparisonMode) {
        case "month":
          // Previous month
          const prevFirstDay = new Date(
            now.getFullYear(),
            now.getMonth() - 1,
            1,
          );
          const prevLastDay = new Date(now.getFullYear(), now.getMonth(), 0);
          prevStartDate = prevFirstDay.toISOString().split("T")[0];
          prevEndDate = prevLastDay.toISOString().split("T")[0];
          break;

        case "year":
          // Same month last year
          const prevYearFirstDay = new Date(
            now.getFullYear() - 1,
            now.getMonth(),
            1,
          );
          const prevYearLastDay = new Date(
            now.getFullYear() - 1,
            now.getMonth() + 1,
            0,
          );
          prevStartDate = prevYearFirstDay.toISOString().split("T")[0];
          prevEndDate = prevYearLastDay.toISOString().split("T")[0];
          break;

        case "quarter":
          // Previous quarter (3 months ago)
          const prevQuarterFirstDay = new Date(
            now.getFullYear(),
            now.getMonth() - 3,
            1,
          );
          const prevQuarterLastDay = new Date(
            now.getFullYear(),
            now.getMonth() - 2,
            0,
          );
          prevStartDate = prevQuarterFirstDay.toISOString().split("T")[0];
          prevEndDate = prevQuarterLastDay.toISOString().split("T")[0];
          break;
      }

      const [accountsData, summaryData, prevSummaryData, transactionsData] =
        await Promise.all([
          invoke<AccountWithBalance[]>("get_accounts_with_balance"),
          invoke<IncomeExpenseSummary>("get_income_expense_summary", {
            startDate,
            endDate,
          }),
          invoke<IncomeExpenseSummary>("get_income_expense_summary", {
            startDate: prevStartDate,
            endDate: prevEndDate,
          }),
          invoke<TransactionWithDetails[]>("get_transactions_with_details"),
        ]);

      setAccounts(accountsData);
      setSummary(summaryData);
      setPrevSummary(prevSummaryData);
      setRecentTransactions(transactionsData.slice(0, 10));
    } catch (error) {
      console.error("Failed to load dashboard data:", error);
    } finally {
      setLoading(false);
    }
  }, [comparisonMode]);

  useEffect(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  // Callback when QuickAddBar saves a transaction — refresh dashboard data
  const handleTransactionAdded = useCallback(() => {
    loadDashboardData();
  }, [loadDashboardData]);

  const totalBalance = accounts.reduce(
    (sum, acc) => sum + acc.current_balance,
    0,
  );

  // Calculate percentage changes
  const incomeChange =
    summary && prevSummary && prevSummary.total_income > 0
      ? ((summary.total_income - prevSummary.total_income) /
          prevSummary.total_income) *
        100
      : 0;

  const expenseChange =
    summary && prevSummary && prevSummary.total_expense > 0
      ? ((summary.total_expense - prevSummary.total_expense) /
          prevSummary.total_expense) *
        100
      : 0;

  // Get comparison label
  const getComparisonLabel = () => {
    switch (comparisonMode) {
      case "month":
        return "vs Last Month";
      case "year":
        return "vs Last Year";
      case "quarter":
        return "vs 3 Months Ago";
      default:
        return "";
    }
  };

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
      {/* Header with Comparison Selector */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Dashboard
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Welcome back! Here's your financial overview
          </p>
        </div>

        {/* Comparison Mode Selector */}
        <div className="flex items-center gap-3 bg-white dark:bg-gray-800 px-4 py-2 rounded-lg border border-gray-200 dark:border-gray-700">
          <label className="text-sm font-medium text-gray-700 dark:text-gray-300">
            Compare with:
          </label>
          <select
            value={comparisonMode}
            onChange={(e) =>
              setComparisonMode(e.target.value as ComparisonMode)
            }
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="month">Previous Month</option>
            <option value="quarter">3 Months Ago</option>
            <option value="year">Same Month Last Year</option>
          </select>
        </div>
      </div>

      {/* Quick Add Bar */}
      <QuickAddBar onTransactionAdded={handleTransactionAdded} />

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
          trend={
            incomeChange !== 0
              ? {
                  value: `${Math.abs(incomeChange).toFixed(1)}% ${getComparisonLabel()}`,
                  isPositive: incomeChange >= 0,
                }
              : undefined
          }
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
          trend={
            expenseChange !== 0
              ? {
                  value: `${Math.abs(expenseChange).toFixed(1)}% ${getComparisonLabel()}`,
                  isPositive: expenseChange < 0,
                }
              : undefined
          }
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
          trend={
            summary && summary.total_income > 0
              ? {
                  value: `${((summary.net_savings / summary.total_income) * 100).toFixed(1)}% of income`,
                  isPositive: summary.net_savings > 0,
                }
              : undefined
          }
        />
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("overview")}
          className={`px-6 py-3 font-medium border-b-2 transition-colors ${
            activeTab === "overview"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          Overview
        </button>
        <button
          onClick={() => setActiveTab("calendar")}
          className={`px-6 py-3 font-medium border-b-2 transition-colors ${
            activeTab === "calendar"
              ? "border-blue-500 text-blue-600 dark:text-blue-400"
              : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          Calendar
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "overview" ? (
        <>
          {/* Two Column Layout */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
            {/* Category Spending Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                Spending by Category
              </h2>
              <CategorySpendingChart
                startDate={dateRange.start}
                endDate={dateRange.end}
                transactionType="EXPENSE"
              />
            </div>

            {/* Income Sources Chart */}
            <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
                Income Sources
              </h2>
              <CategorySpendingChart
                startDate={dateRange.start}
                endDate={dateRange.end}
                transactionType="INCOME"
              />
            </div>
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
        </>
      ) : (
        /* Calendar View */
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
          <Calendar />
        </div>
      )}
    </div>
  );
}
