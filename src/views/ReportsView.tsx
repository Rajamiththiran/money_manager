// File: src/views/ReportsView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ChartBarIcon,
  TableCellsIcon,
  ArrowsRightLeftIcon,
  BanknotesIcon,
} from "@heroicons/react/24/outline";
import ReportFilters from "../components/ReportFilters";
import TrendChart from "../components/TrendChart";
import ComparisonCard from "../components/ComparisonCard";
import ReportTable from "../components/ReportTable";
import ExportMenu from "../components/ExportMenu";
import CategorySpendingChart from "../components/CategorySpendingChart";
import AccountActivityCard from "../components/AccountActivityCard";
import type {
  ReportFilters as ReportFiltersType,
  MonthlyTrend,
  PeriodComparison,
} from "../types/report";
import type { TransactionWithDetails } from "../types/transaction";
import type { AccountWithBalance } from "../types/account";

type ReportTab =
  | "overview"
  | "trends"
  | "categories"
  | "accounts"
  | "transactions";

export default function ReportsView() {
  const [activeTab, setActiveTab] = useState<ReportTab>("overview");
  const [filters, setFilters] = useState<ReportFiltersType>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      startDate: firstDay.toISOString().split("T")[0],
      endDate: lastDay.toISOString().split("T")[0],
      period: "monthly",
    };
  });

  const [trends, setTrends] = useState<MonthlyTrend[]>([]);
  const [comparison, setComparison] = useState<PeriodComparison | null>(null);
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>(
    [],
  );
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadReportData();
  }, [filters]);

  const loadReportData = async () => {
    setLoading(true);
    try {
      const [trendsData, transactionsData, accountsData] = await Promise.all([
        invoke<MonthlyTrend[]>("get_monthly_trends", { months: 12 }),
        invoke<TransactionWithDetails[]>("get_transactions_filtered", {
          filter: {
            start_date: filters.startDate,
            end_date: filters.endDate,
            transaction_type: filters.transactionType,
            category_id: filters.categoryId,
            account_id: filters.accountId,
          },
        }),
        invoke<AccountWithBalance[]>("get_accounts_with_balance"),
      ]);

      setTrends(trendsData);
      setTransactions(transactionsData);
      setAccounts(accountsData);

      // Load comparison separately
      const comparisonData = await loadComparison();
      setComparison(comparisonData);
    } catch (error) {
      console.error("Failed to load report data:", error);
    } finally {
      setLoading(false);
    }
  };

  const loadComparison = async (): Promise<PeriodComparison | null> => {
    try {
      // Current period
      const currentStart = filters.startDate;
      const currentEnd = filters.endDate;

      // Previous period (same duration, shifted back)
      const startDate = new Date(filters.startDate);
      const endDate = new Date(filters.endDate);
      const duration = endDate.getTime() - startDate.getTime();
      const prevEnd = new Date(startDate.getTime() - 1);
      const prevStart = new Date(prevEnd.getTime() - duration);

      const [currentSummary, previousSummary] = await Promise.all([
        invoke<any>("get_income_expense_summary", {
          startDate: currentStart,
          endDate: currentEnd,
        }),
        invoke<any>("get_income_expense_summary", {
          startDate: prevStart.toISOString().split("T")[0],
          endDate: prevEnd.toISOString().split("T")[0],
        }),
      ]);

      const incomeChange =
        previousSummary.total_income > 0
          ? ((currentSummary.total_income - previousSummary.total_income) /
              previousSummary.total_income) *
            100
          : 0;

      const expenseChange =
        previousSummary.total_expense > 0
          ? ((currentSummary.total_expense - previousSummary.total_expense) /
              previousSummary.total_expense) *
            100
          : 0;

      const savingsChange =
        previousSummary.net_savings !== 0
          ? ((currentSummary.net_savings - previousSummary.net_savings) /
              Math.abs(previousSummary.net_savings)) *
            100
          : 0;

      return {
        currentPeriod: {
          label: "Current Period",
          startDate: currentStart,
          endDate: currentEnd,
          totalIncome: currentSummary.total_income,
          totalExpense: currentSummary.total_expense,
          netSavings: currentSummary.net_savings,
          transactionCount: currentSummary.transaction_count,
        },
        previousPeriod: {
          label: "Previous Period",
          startDate: prevStart.toISOString().split("T")[0],
          endDate: prevEnd.toISOString().split("T")[0],
          totalIncome: previousSummary.total_income,
          totalExpense: previousSummary.total_expense,
          netSavings: previousSummary.net_savings,
          transactionCount: previousSummary.transaction_count,
        },
        incomeChange,
        expenseChange,
        savingsChange,
      };
    } catch (error) {
      console.error("Failed to load comparison:", error);
      return null;
    }
  };

  const handleFilterChange = (newFilters: ReportFiltersType) => {
    setFilters(newFilters);
  };

  // Convert ReportFilters to ExportFilter format
  const getExportFilters = () => ({
    start_date: filters.startDate,
    end_date: filters.endDate,
    transaction_type: filters.transactionType,
    category_id: filters.categoryId,
    account_id: filters.accountId,
  });

  const tabs = [
    { id: "overview" as ReportTab, label: "Overview", icon: ChartBarIcon },
    { id: "trends" as ReportTab, label: "Trends", icon: ArrowsRightLeftIcon },
    { id: "categories" as ReportTab, label: "Categories", icon: ChartBarIcon },
    { id: "accounts" as ReportTab, label: "Accounts", icon: BanknotesIcon },
    {
      id: "transactions" as ReportTab,
      label: "Transactions",
      icon: TableCellsIcon,
    },
  ];

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Reports & Analytics
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Analyze your financial data and track trends
          </p>
        </div>
        <ExportMenu filters={getExportFilters()} />
      </div>

      {/* Filters */}
      <div className="mb-6">
        <ReportFilters filters={filters} onFilterChange={handleFilterChange} />
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700 overflow-x-auto">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`flex items-center gap-2 px-4 py-3 font-medium border-b-2 transition-colors whitespace-nowrap ${
              activeTab === tab.id
                ? "border-blue-500 text-blue-600 dark:text-blue-400"
                : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
            }`}
          >
            <tab.icon className="h-5 w-5" />
            {tab.label}
          </button>
        ))}
      </div>

      {/* Tab Content */}
      {loading ? (
        <div className="flex items-center justify-center h-96">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
        </div>
      ) : (
        <>
          {/* Overview Tab */}
          {activeTab === "overview" && (
            <div className="space-y-8">
              {/* Period Comparison */}
              {comparison && <ComparisonCard comparison={comparison} />}

              {/* Quick Stats Grid */}
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total Income
                  </p>
                  <p className="text-2xl font-bold text-green-600 dark:text-green-400 mt-1">
                    Rs{" "}
                    {comparison?.currentPeriod.totalIncome.toLocaleString(
                      "en-US",
                      { minimumFractionDigits: 2 },
                    ) || "0.00"}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Total Expenses
                  </p>
                  <p className="text-2xl font-bold text-red-600 dark:text-red-400 mt-1">
                    Rs{" "}
                    {comparison?.currentPeriod.totalExpense.toLocaleString(
                      "en-US",
                      { minimumFractionDigits: 2 },
                    ) || "0.00"}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Net Savings
                  </p>
                  <p
                    className={`text-2xl font-bold mt-1 ${
                      (comparison?.currentPeriod.netSavings || 0) >= 0
                        ? "text-blue-600 dark:text-blue-400"
                        : "text-orange-600 dark:text-orange-400"
                    }`}
                  >
                    Rs{" "}
                    {comparison?.currentPeriod.netSavings.toLocaleString(
                      "en-US",
                      { minimumFractionDigits: 2 },
                    ) || "0.00"}
                  </p>
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Transactions
                  </p>
                  <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                    {comparison?.currentPeriod.transactionCount || 0}
                  </p>
                </div>
              </div>

              {/* Charts Row */}
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Expense Breakdown
                  </h3>
                  <CategorySpendingChart
                    startDate={filters.startDate}
                    endDate={filters.endDate}
                    transactionType="EXPENSE"
                  />
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Income Sources
                  </h3>
                  <CategorySpendingChart
                    startDate={filters.startDate}
                    endDate={filters.endDate}
                    transactionType="INCOME"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Trends Tab */}
          {activeTab === "trends" && (
            <div className="space-y-8">
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Income vs Expenses (Last 12 Months)
                </h3>
                <TrendChart data={trends} />
              </div>

              {/* Monthly Summary Table */}
              <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  Monthly Summary
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-gray-50 dark:bg-gray-700/50">
                      <tr>
                        <th className="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Month
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Income
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Expenses
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Net
                        </th>
                        <th className="px-4 py-3 text-right text-xs font-medium text-gray-500 dark:text-gray-400 uppercase">
                          Savings Rate
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-200 dark:divide-gray-700">
                      {trends.map((trend) => {
                        const savingsRate =
                          trend.income > 0
                            ? ((trend.income - trend.expense) / trend.income) *
                              100
                            : 0;
                        return (
                          <tr
                            key={trend.month}
                            className="hover:bg-gray-50 dark:hover:bg-gray-700/50"
                          >
                            <td className="px-4 py-3 text-sm text-gray-900 dark:text-white">
                              {trend.month_name}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-green-600 dark:text-green-400">
                              Rs{" "}
                              {trend.income.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td className="px-4 py-3 text-sm text-right text-red-600 dark:text-red-400">
                              Rs{" "}
                              {trend.expense.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td
                              className={`px-4 py-3 text-sm text-right font-medium ${
                                trend.net >= 0
                                  ? "text-blue-600 dark:text-blue-400"
                                  : "text-orange-600 dark:text-orange-400"
                              }`}
                            >
                              Rs{" "}
                              {trend.net.toLocaleString("en-US", {
                                minimumFractionDigits: 2,
                              })}
                            </td>
                            <td
                              className={`px-4 py-3 text-sm text-right ${
                                savingsRate >= 20
                                  ? "text-green-600 dark:text-green-400"
                                  : savingsRate >= 0
                                    ? "text-yellow-600 dark:text-yellow-400"
                                    : "text-red-600 dark:text-red-400"
                              }`}
                            >
                              {savingsRate.toFixed(1)}%
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* Categories Tab */}
          {activeTab === "categories" && (
            <div className="space-y-8">
              <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Spending by Category
                  </h3>
                  <CategorySpendingChart
                    startDate={filters.startDate}
                    endDate={filters.endDate}
                    transactionType="EXPENSE"
                  />
                </div>
                <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700">
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                    Income by Category
                  </h3>
                  <CategorySpendingChart
                    startDate={filters.startDate}
                    endDate={filters.endDate}
                    transactionType="INCOME"
                  />
                </div>
              </div>
            </div>
          )}

          {/* Accounts Tab */}
          {activeTab === "accounts" && (
            <div className="space-y-6">
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {accounts.map((account) => (
                  <AccountActivityCard
                    key={account.id}
                    account={account}
                    startDate={filters.startDate}
                    endDate={filters.endDate}
                  />
                ))}
              </div>
            </div>
          )}

          {/* Transactions Tab */}
          {activeTab === "transactions" && (
            <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
              <ReportTable transactions={transactions} />
            </div>
          )}
        </>
      )}
    </div>
  );
}
