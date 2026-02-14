// File: src/components/TransactionFilterBar.tsx
import { useState } from "react";
import {
  MagnifyingGlassIcon,
  FunnelIcon,
  XMarkIcon,
} from "@heroicons/react/24/outline";
import Select from "./Select";
import type { TransactionFilter } from "../types/transaction";
import type { AccountWithBalance } from "../types/account";
import type { CategoryWithChildren } from "../types/category";

interface TransactionFilterBarProps {
  accounts: AccountWithBalance[];
  categories: CategoryWithChildren[];
  onFilterChange: (filter: TransactionFilter) => void;
}

type DatePreset = "all" | "today" | "this_week" | "this_month" | "custom";

export default function TransactionFilterBar({
  accounts,
  categories,
  onFilterChange,
}: TransactionFilterBarProps) {
  const [search, setSearch] = useState("");
  const [datePreset, setDatePreset] = useState<DatePreset>("this_month");
  const [customStart, setCustomStart] = useState("");
  const [customEnd, setCustomEnd] = useState("");
  const [type, setType] = useState<string>("");
  const [accountId, setAccountId] = useState<string>("");
  const [categoryId, setCategoryId] = useState<string>("");
  const [showAdvanced, setShowAdvanced] = useState(false);

  const buildFilter = (
    overrides: Partial<{
      search: string;
      datePreset: DatePreset;
      customStart: string;
      customEnd: string;
      type: string;
      accountId: string;
      categoryId: string;
    }> = {},
  ): TransactionFilter => {
    const s = overrides.search ?? search;
    const dp = overrides.datePreset ?? datePreset;
    const cs = overrides.customStart ?? customStart;
    const ce = overrides.customEnd ?? customEnd;
    const t = overrides.type ?? type;
    const a = overrides.accountId ?? accountId;
    const c = overrides.categoryId ?? categoryId;

    const filter: TransactionFilter = {};

    // Date range
    const now = new Date();
    switch (dp) {
      case "today": {
        const today = now.toISOString().split("T")[0];
        filter.start_date = today;
        filter.end_date = today;
        break;
      }
      case "this_week": {
        const day = now.getDay();
        const monday = new Date(now);
        monday.setDate(now.getDate() - (day === 0 ? 6 : day - 1));
        const sunday = new Date(monday);
        sunday.setDate(monday.getDate() + 6);
        filter.start_date = monday.toISOString().split("T")[0];
        filter.end_date = sunday.toISOString().split("T")[0];
        break;
      }
      case "this_month": {
        const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
        const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        filter.start_date = firstDay.toISOString().split("T")[0];
        filter.end_date = lastDay.toISOString().split("T")[0];
        break;
      }
      case "custom":
        if (cs) filter.start_date = cs;
        if (ce) filter.end_date = ce;
        break;
      case "all":
      default:
        break;
    }

    if (t) filter.transaction_type = t;
    if (a) filter.account_id = Number(a);
    if (c) {
      filter.category_id = Number(c);
      filter.include_subcategories = true;
    }
    if (s.trim()) filter.search_query = s.trim();

    return filter;
  };

  const applyFilter = (overrides: Parameters<typeof buildFilter>[0] = {}) => {
    onFilterChange(buildFilter(overrides));
  };

  const handleSearchChange = (value: string) => {
    setSearch(value);
    // Debounce-like: apply on each keystroke
    applyFilter({ search: value });
  };

  const handleDatePresetChange = (preset: DatePreset) => {
    setDatePreset(preset);
    applyFilter({ datePreset: preset });
  };

  const handleTypeChange = (value: string) => {
    setType(value);
    applyFilter({ type: value });
  };

  const handleAccountChange = (value: string) => {
    setAccountId(value);
    applyFilter({ accountId: value });
  };

  const handleCategoryChange = (value: string) => {
    setCategoryId(value);
    applyFilter({ categoryId: value });
  };

  const handleCustomDateChange = (start: string, end: string) => {
    setCustomStart(start);
    setCustomEnd(end);
    applyFilter({ customStart: start, customEnd: end, datePreset: "custom" });
  };

  const clearAllFilters = () => {
    setSearch("");
    setDatePreset("this_month");
    setCustomStart("");
    setCustomEnd("");
    setType("");
    setAccountId("");
    setCategoryId("");
    setShowAdvanced(false);
    onFilterChange(
      buildFilter({
        search: "",
        datePreset: "this_month",
        customStart: "",
        customEnd: "",
        type: "",
        accountId: "",
        categoryId: "",
      }),
    );
  };

  const hasActiveFilters =
    type !== "" || accountId !== "" || categoryId !== "" || search !== "";

  // Build category options (flat list with parent > child)
  const categoryOptions = [
    { value: "", label: "All Categories" },
    ...categories.flatMap((parent) => [
      { value: parent.id.toString(), label: parent.name },
      ...parent.children.map((child) => ({
        value: child.id.toString(),
        label: `  ↳ ${child.name}`,
      })),
    ]),
  ];

  const accountOptions = [
    { value: "", label: "All Accounts" },
    ...accounts.map((acc) => ({
      value: acc.id.toString(),
      label: acc.name,
    })),
  ];

  const typeOptions = [
    { value: "", label: "All Types" },
    { value: "INCOME", label: "Income" },
    { value: "EXPENSE", label: "Expense" },
    { value: "TRANSFER", label: "Transfer" },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6 space-y-3">
      {/* Row 1: Search + Date presets */}
      <div className="flex flex-col sm:flex-row gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <MagnifyingGlassIcon className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => handleSearchChange(e.target.value)}
            placeholder="Search by memo or amount..."
            className="w-full pl-9 pr-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
          />
        </div>

        {/* Date preset pills */}
        <div className="flex items-center gap-1 flex-wrap">
          {(
            [
              { value: "all", label: "All Time" },
              { value: "today", label: "Today" },
              { value: "this_week", label: "This Week" },
              { value: "this_month", label: "This Month" },
              { value: "custom", label: "Custom" },
            ] as const
          ).map((preset) => (
            <button
              key={preset.value}
              onClick={() => handleDatePresetChange(preset.value)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                datePreset === preset.value
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {preset.label}
            </button>
          ))}

          {/* Toggle advanced filters */}
          <button
            onClick={() => setShowAdvanced(!showAdvanced)}
            className={`p-1.5 rounded-lg transition-colors ${
              showAdvanced || hasActiveFilters
                ? "bg-blue-100 text-blue-600 dark:bg-blue-900/30 dark:text-blue-400"
                : "bg-gray-100 text-gray-500 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
            }`}
            title="Advanced filters"
          >
            <FunnelIcon className="h-4 w-4" />
          </button>

          {hasActiveFilters && (
            <button
              onClick={clearAllFilters}
              className="p-1.5 rounded-lg bg-red-50 text-red-500 dark:bg-red-900/20 dark:text-red-400 hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors"
              title="Clear all filters"
            >
              <XMarkIcon className="h-4 w-4" />
            </button>
          )}
        </div>
      </div>

      {/* Custom date range */}
      {datePreset === "custom" && (
        <div className="flex gap-3 items-center">
          <input
            type="date"
            value={customStart}
            onChange={(e) => handleCustomDateChange(e.target.value, customEnd)}
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <span className="text-sm text-gray-500">to</span>
          <input
            type="date"
            value={customEnd}
            onChange={(e) =>
              handleCustomDateChange(customStart, e.target.value)
            }
            className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
        </div>
      )}

      {/* Row 2: Advanced filters (collapsible) */}
      {showAdvanced && (
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 pt-2 border-t border-gray-100 dark:border-gray-700/50">
          <Select
            value={type}
            onChange={(e) => handleTypeChange(e.target.value)}
            options={typeOptions}
          />
          <Select
            value={accountId}
            onChange={(e) => handleAccountChange(e.target.value)}
            options={accountOptions}
          />
          <Select
            value={categoryId}
            onChange={(e) => handleCategoryChange(e.target.value)}
            options={categoryOptions}
          />
        </div>
      )}
    </div>
  );
}
