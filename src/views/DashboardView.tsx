// File: src/views/DashboardView.tsx
import { useState, useEffect, useCallback, useMemo } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  WalletIcon,
  Cog6ToothIcon,
  Bars3Icon,
  EyeIcon,
  EyeSlashIcon,
  ChevronUpDownIcon,
} from "@heroicons/react/24/outline";
import StatCard from "../components/StatCard";
import CategorySpendingChart from "../components/CategorySpendingChart";
import Calendar from "../components/Calendar";
import QuickAddBar from "../components/QuickAddBar";
import NetWorthCard from "../components/NetWorthCard";
import UpcomingBillsWidget from "../components/UpcomingBillsWidget";
import ScheduledItemsWidget from "../components/ScheduledItemsWidget";
import GoalsDashboardWidget from "../components/GoalsDashboardWidget";
import { useDashboardLayout } from "../hooks/useDashboardLayout";
import type { AccountWithBalance } from "../types/account";
import type { TransactionWithDetails } from "../types/transaction";
import type { WidgetId, DateRangePreset } from "../types/dashboard";
import { WIDGET_LABELS, COMPACT_SUPPORTED } from "../types/dashboard";

interface IncomeExpenseSummary {
  total_income: number;
  total_expense: number;
  net_savings: number;
  transaction_count: number;
  start_date: string;
  end_date: string;
}

type ComparisonMode = "month" | "year" | "quarter";

// ── Sortable widget wrapper ──────────────────────────────────────
function SortableWidget({
  id,
  children,
  isCustomizing,
}: {
  id: string;
  children: React.ReactNode;
  isCustomizing: boolean;
}) {
  const {
    attributes,
    listeners,
    setNodeRef,
    transform,
    transition,
    isDragging,
  } = useSortable({ id });

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    position: "relative" as const,
  };

  return (
    <div ref={setNodeRef} style={style}>
      {isCustomizing && (
        <button
          {...attributes}
          {...listeners}
          className="absolute -left-2 top-1/2 -translate-y-1/2 z-10 p-1 rounded bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400 cursor-grab active:cursor-grabbing hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
          title="Drag to reorder"
        >
          <Bars3Icon className="h-4 w-4" />
        </button>
      )}
      {children}
    </div>
  );
}

// ── Date range helper ────────────────────────────────────────────
function computeDateRange(
  preset: DateRangePreset,
  custom?: { start: string; end: string },
): { start: string; end: string } {
  const now = new Date();
  switch (preset) {
    case "this-month": {
      const first = new Date(now.getFullYear(), now.getMonth(), 1);
      const last = new Date(now.getFullYear(), now.getMonth() + 1, 0);
      return {
        start: first.toISOString().split("T")[0],
        end: last.toISOString().split("T")[0],
      };
    }
    case "last-month": {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1);
      const last = new Date(now.getFullYear(), now.getMonth(), 0);
      return {
        start: first.toISOString().split("T")[0],
        end: last.toISOString().split("T")[0],
      };
    }
    case "this-week": {
      const dayOfWeek = now.getDay();
      const monday = new Date(now);
      monday.setDate(now.getDate() - ((dayOfWeek + 6) % 7));
      const sunday = new Date(monday);
      sunday.setDate(monday.getDate() + 6);
      return {
        start: monday.toISOString().split("T")[0],
        end: sunday.toISOString().split("T")[0],
      };
    }
    case "custom":
      return custom || computeDateRange("this-month");
    default:
      return computeDateRange("this-month");
  }
}

// ── Main component ───────────────────────────────────────────────
export default function DashboardView() {
  const {
    layout,
    loaded,
    reorderWidgets,
    toggleWidget,
    setWidgetMode,
    setDateRange,
    resetToDefault,
  } = useDashboardLayout();

  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [summary, setSummary] = useState<IncomeExpenseSummary | null>(null);
  const [prevSummary, setPrevSummary] = useState<IncomeExpenseSummary | null>(null);
  const [recentTransactions, setRecentTransactions] = useState<TransactionWithDetails[]>([]);
  const [loading, setLoading] = useState(true);
  const [comparisonMode, setComparisonMode] = useState<ComparisonMode>("month");
  const [showCustomize, setShowCustomize] = useState(false);
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");

  const dateRange = useMemo(
    () => computeDateRange(layout.dateRangePreset, layout.customDateRange),
    [layout.dateRangePreset, layout.customDateRange],
  );

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 8 } }),
  );

  const loadDashboardData = useCallback(async () => {
    setLoading(true);
    try {
      let prevStartDate: string;
      let prevEndDate: string;
      const now = new Date();

      switch (comparisonMode) {
        case "month": {
          const pf = new Date(now.getFullYear(), now.getMonth() - 1, 1);
          const pl = new Date(now.getFullYear(), now.getMonth(), 0);
          prevStartDate = pf.toISOString().split("T")[0];
          prevEndDate = pl.toISOString().split("T")[0];
          break;
        }
        case "year": {
          const pf = new Date(now.getFullYear() - 1, now.getMonth(), 1);
          const pl = new Date(now.getFullYear() - 1, now.getMonth() + 1, 0);
          prevStartDate = pf.toISOString().split("T")[0];
          prevEndDate = pl.toISOString().split("T")[0];
          break;
        }
        case "quarter": {
          const pf = new Date(now.getFullYear(), now.getMonth() - 3, 1);
          const pl = new Date(now.getFullYear(), now.getMonth() - 2, 0);
          prevStartDate = pf.toISOString().split("T")[0];
          prevEndDate = pl.toISOString().split("T")[0];
          break;
        }
      }

      const [accountsData, summaryData, prevSummaryData, transactionsData] =
        await Promise.all([
          invoke<AccountWithBalance[]>("get_accounts_with_balance"),
          invoke<IncomeExpenseSummary>("get_income_expense_summary", {
            startDate: dateRange.start,
            endDate: dateRange.end,
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
  }, [comparisonMode, dateRange]);

  useEffect(() => {
    if (loaded) loadDashboardData();
  }, [loaded, loadDashboardData]);

  const handleTransactionAdded = useCallback(() => {
    loadDashboardData();
    window.dispatchEvent(new CustomEvent("refresh-net-worth"));
  }, [loadDashboardData]);

  const totalBalance = accounts.reduce((sum, acc) => sum + acc.current_balance, 0);

  const incomeChange =
    summary && prevSummary && prevSummary.total_income > 0
      ? ((summary.total_income - prevSummary.total_income) / prevSummary.total_income) * 100
      : 0;

  const expenseChange =
    summary && prevSummary && prevSummary.total_expense > 0
      ? ((summary.total_expense - prevSummary.total_expense) / prevSummary.total_expense) * 100
      : 0;

  const getComparisonLabel = () => {
    switch (comparisonMode) {
      case "month": return "vs Last Month";
      case "year": return "vs Last Year";
      case "quarter": return "vs 3 Months Ago";
      default: return "";
    }
  };

  const handleDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const oldIndex = layout.widgets.findIndex((w) => w.id === active.id);
    const newIndex = layout.widgets.findIndex((w) => w.id === over.id);
    if (oldIndex !== -1 && newIndex !== -1) reorderWidgets(oldIndex, newIndex);
  };

  const handleCustomDateApply = () => {
    if (customStart && customEnd) {
      setDateRange("custom", { start: customStart, end: customEnd });
    }
  };

  // Get widget config by ID
  const getConfig = (id: WidgetId) => layout.widgets.find((w) => w.id === id);

  // ── Render a widget by ID ──────────────────────────────────────
  const renderWidget = (id: WidgetId) => {
    const config = getConfig(id);
    if (!config || !config.visible) return null;

    switch (id) {
      case "net-worth":
        return <NetWorthCard displayMode={config.displayMode} />;
      case "upcoming-bills":
        return (
          <UpcomingBillsWidget
            onBillAction={handleTransactionAdded}
            displayMode={config.displayMode}
          />
        );
      case "scheduled-items":
        return (
          <ScheduledItemsWidget
            onItemAction={handleTransactionAdded}
            displayMode={config.displayMode}
          />
        );
      case "goals":
        return <GoalsDashboardWidget displayMode={config.displayMode} />;
      case "stats-grid":
        return (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
            <StatCard
              title="Total Balance"
              value={`Rs ${totalBalance.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              icon={<WalletIcon className="h-6 w-6" />}
              color="blue"
            />
            <StatCard
              title="Income"
              value={`Rs ${summary ? summary.total_income.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`}
              icon={<ArrowTrendingUpIcon className="h-6 w-6" />}
              color="green"
              trend={incomeChange !== 0 ? { value: `${Math.abs(incomeChange).toFixed(1)}% ${getComparisonLabel()}`, isPositive: incomeChange >= 0 } : undefined}
            />
            <StatCard
              title="Expenses"
              value={`Rs ${summary ? summary.total_expense.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`}
              icon={<ArrowTrendingDownIcon className="h-6 w-6" />}
              color="red"
              trend={expenseChange !== 0 ? { value: `${Math.abs(expenseChange).toFixed(1)}% ${getComparisonLabel()}`, isPositive: expenseChange < 0 } : undefined}
            />
            <StatCard
              title="Net Savings"
              value={`Rs ${summary ? summary.net_savings.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 }) : "0.00"}`}
              icon={<BanknotesIcon className="h-6 w-6" />}
              color="purple"
              trend={summary && summary.total_income > 0 ? { value: `${((summary.net_savings / summary.total_income) * 100).toFixed(1)}% of income`, isPositive: summary.net_savings > 0 } : undefined}
            />
          </div>
        );
      case "spending-chart":
        return (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
              Spending by Category
            </h2>
            <CategorySpendingChart startDate={dateRange.start} endDate={dateRange.end} transactionType="EXPENSE" />
          </div>
        );
      case "income-chart":
        return (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-8">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
              Income Sources
            </h2>
            <CategorySpendingChart startDate={dateRange.start} endDate={dateRange.end} transactionType="INCOME" />
          </div>
        );
      case "recent-transactions":
        return (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-8">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">Recent Transactions</h2>
              <button
                onClick={() => window.dispatchEvent(new CustomEvent("navigate-to-transactions"))}
                className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
              >
                View All
              </button>
            </div>
            {recentTransactions.length === 0 ? (
              <p className="text-gray-600 dark:text-gray-400">No transactions yet. Start tracking your finances!</p>
            ) : (
              <div className="space-y-4">
                {recentTransactions.map((txn) => (
                  <div key={txn.id} className="flex items-center justify-between p-4 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors">
                    <div className="flex items-center gap-4">
                      <div className={`w-10 h-10 rounded-full flex items-center justify-center ${txn.transaction_type === "INCOME" ? "bg-green-100 dark:bg-green-900/20" : txn.transaction_type === "EXPENSE" ? "bg-red-100 dark:bg-red-900/20" : "bg-blue-100 dark:bg-blue-900/20"}`}>
                        {txn.transaction_type === "INCOME" ? <ArrowTrendingUpIcon className="h-5 w-5 text-green-600 dark:text-green-400" /> : txn.transaction_type === "EXPENSE" ? <ArrowTrendingDownIcon className="h-5 w-5 text-red-600 dark:text-red-400" /> : <BanknotesIcon className="h-5 w-5 text-blue-600 dark:text-blue-400" />}
                      </div>
                      <div>
                        <p className="font-medium text-gray-900 dark:text-white">{txn.category_name || txn.transaction_type}</p>
                        <p className="text-sm text-gray-600 dark:text-gray-400">
                          {txn.account_name}{txn.to_account_name && ` \u2192 ${txn.to_account_name}`} \u2022 {new Date(txn.date).toLocaleDateString()}
                        </p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className={`font-semibold ${txn.transaction_type === "INCOME" ? "text-green-600 dark:text-green-400" : txn.transaction_type === "EXPENSE" ? "text-red-600 dark:text-red-400" : "text-blue-600 dark:text-blue-400"}`}>
                        {txn.transaction_type === "INCOME" ? "+" : "-"}Rs {txn.amount.toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                      </p>
                      {txn.memo && <p className="text-sm text-gray-500 dark:text-gray-400">{txn.memo}</p>}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );
      case "calendar":
        return (
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8 mb-8">
            <Calendar />
          </div>
        );
      default:
        return null;
    }
  };

  const visibleWidgets = layout.widgets.filter((w) => w.visible);

  if (loading || !loaded) {
    return (
      <div className="p-8 flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading dashboard...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Dashboard</h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">Your financial overview</p>
        </div>

        <div className="flex items-center gap-3">
          {/* Date range switcher */}
          <div className="flex items-center rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden">
            {(["this-week", "this-month", "last-month", "custom"] as DateRangePreset[]).map((preset) => (
              <button
                key={preset}
                onClick={() => {
                  if (preset === "custom") {
                    // Set custom dates to current range as starting point
                    setCustomStart(dateRange.start);
                    setCustomEnd(dateRange.end);
                  }
                  setDateRange(preset, preset === "custom" ? { start: dateRange.start, end: dateRange.end } : undefined);
                }}
                className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                  layout.dateRangePreset === preset
                    ? "bg-accent-600 text-white"
                    : "bg-white dark:bg-gray-800 text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700"
                }`}
              >
                {preset === "this-week" ? "Week" : preset === "this-month" ? "Month" : preset === "last-month" ? "Last Month" : "Custom"}
              </button>
            ))}
          </div>

          {/* Comparison selector */}
          <select
            value={comparisonMode}
            onChange={(e) => setComparisonMode(e.target.value as ComparisonMode)}
            className="px-3 py-1.5 text-xs border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
          >
            <option value="month">vs Prev Month</option>
            <option value="quarter">vs 3mo Ago</option>
            <option value="year">vs Last Year</option>
          </select>

          {/* Customize button */}
          <button
            onClick={() => setShowCustomize(!showCustomize)}
            className={`p-2 rounded-lg transition-colors ${
              showCustomize
                ? "bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400"
                : "text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
            }`}
            title="Customize dashboard"
          >
            <Cog6ToothIcon className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Custom date pickers */}
      {layout.dateRangePreset === "custom" && (
        <div className="flex items-center gap-3 mb-6 p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
          <input
            type="date"
            value={customStart}
            onChange={(e) => setCustomStart(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <span className="text-gray-400 text-sm">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) => setCustomEnd(e.target.value)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500"
          />
          <button
            onClick={handleCustomDateApply}
            className="px-3 py-1.5 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors"
          >
            Apply
          </button>
        </div>
      )}

      {/* Customization panel */}
      {showCustomize && (
        <div className="mb-6 p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 animate-fade-in">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Customize Widgets
            </h3>
            <button
              onClick={resetToDefault}
              className="text-xs text-gray-500 dark:text-gray-400 hover:text-accent-600 dark:hover:text-accent-400 transition-colors"
            >
              Reset to default
            </button>
          </div>
          <div className="space-y-1">
            {layout.widgets.map((widget) => (
              <div
                key={widget.id}
                className="flex items-center justify-between p-2.5 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <ChevronUpDownIcon className="h-4 w-4 text-gray-400" />
                  <span className="text-sm text-gray-900 dark:text-white">
                    {WIDGET_LABELS[widget.id]}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  {COMPACT_SUPPORTED.includes(widget.id) && widget.visible && (
                    <select
                      value={widget.displayMode}
                      onChange={(e) => setWidgetMode(widget.id, e.target.value as "expanded" | "compact")}
                      className="text-xs px-2 py-1 border border-gray-300 dark:border-gray-600 rounded bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 focus:outline-none"
                    >
                      <option value="expanded">Expanded</option>
                      <option value="compact">Compact</option>
                    </select>
                  )}
                  <button
                    onClick={() => toggleWidget(widget.id)}
                    className={`p-1.5 rounded-lg transition-colors ${
                      widget.visible
                        ? "text-accent-600 dark:text-accent-400 hover:bg-accent-50 dark:hover:bg-accent-900/20"
                        : "text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700"
                    }`}
                    title={widget.visible ? "Hide widget" : "Show widget"}
                  >
                    {widget.visible ? (
                      <EyeIcon className="h-4 w-4" />
                    ) : (
                      <EyeSlashIcon className="h-4 w-4" />
                    )}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Quick Add Bar — always visible */}
      <QuickAddBar onTransactionAdded={handleTransactionAdded} />

      {/* Dynamic widget list with drag-and-drop */}
      <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
        <SortableContext items={visibleWidgets.map((w) => w.id)} strategy={verticalListSortingStrategy}>
          {visibleWidgets.map((widget) => (
            <SortableWidget key={widget.id} id={widget.id} isCustomizing={showCustomize}>
              {renderWidget(widget.id)}
            </SortableWidget>
          ))}
        </SortableContext>
      </DndContext>
    </div>
  );
}
