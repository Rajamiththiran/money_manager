// File: src/components/QuickAddBar.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  PlusIcon,
  CalendarDaysIcon,
  ChatBubbleLeftIcon,
  CheckIcon,
  ArrowsRightLeftIcon,
} from "@heroicons/react/24/outline";
import { useCurrency } from "../hooks/useCurrency";
import type { AccountWithBalance } from "../types/account";
import type { Category, CategoryWithChildren } from "../types/category";
import type { CreateTransactionInput } from "../types/transaction";

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";

const RECENT_CATEGORIES_LIMIT = 5;
const SUCCESS_DISPLAY_MS = 2000;

interface QuickAddBarProps {
  onTransactionAdded: () => void;
}

export default function QuickAddBar({ onTransactionAdded }: QuickAddBarProps) {
  const { formatAmount } = useCurrency();
  const amountRef = useRef<HTMLInputElement>(null);

  // Form state
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [amount, setAmount] = useState("");
  const [accountId, setAccountId] = useState<number>(0);
  const [toAccountId, setToAccountId] = useState<number>(0);
  const [categoryId, setCategoryId] = useState<number>(0);
  const [memo, setMemo] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [showDate, setShowDate] = useState(false);
  const [showMemo, setShowMemo] = useState(false);

  // Data state
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [recentCategories, setRecentCategories] = useState<Category[]>([]);

  // UI state
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const successTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load accounts and categories on mount
  useEffect(() => {
    loadFormData();
  }, []);

  // Load recent categories when type changes (only for INCOME/EXPENSE)
  useEffect(() => {
    if (type !== "TRANSFER") {
      loadRecentCategories(type);
    }
  }, [type]);

  // Listen for focus-quick-add event (Ctrl+N from anywhere)
  useEffect(() => {
    const handleFocus = () => {
      amountRef.current?.focus();
    };
    window.addEventListener("focus-quick-add", handleFocus);
    return () => window.removeEventListener("focus-quick-add", handleFocus);
  }, []);

  // Escape key clears and blurs
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        resetForm();
        amountRef.current?.blur();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, []);

  const loadFormData = async () => {
    try {
      const [accountsData, categoriesData] = await Promise.all([
        invoke<AccountWithBalance[]>("get_accounts_with_balance"),
        invoke<CategoryWithChildren[]>("get_categories_with_children"),
      ]);
      setAccounts(accountsData);
      setCategories(categoriesData);
      if (accountsData.length > 0) {
        setAccountId(accountsData[0].id);
        if (accountsData.length > 1) {
          setToAccountId(accountsData[1].id);
        }
      }
    } catch (err) {
      console.error("Failed to load quick-add data:", err);
    }
  };

  const loadRecentCategories = async (txnType: TransactionType) => {
    try {
      const recent = await invoke<Category[]>("get_recent_categories", {
        limit: RECENT_CATEGORIES_LIMIT,
        transactionType: txnType,
      });
      setRecentCategories(recent);
    } catch {
      setRecentCategories([]);
    }
  };

  const evaluateAmount = (input: string): number | null => {
    if (!input.trim()) return null;
    try {
      // Simple math evaluation: support +, -, *, /
      const sanitized = input.replace(/[^0-9+\-*/.() ]/g, "");
      if (!sanitized) return null;
      // eslint-disable-next-line no-eval
      const result = Function('"use strict"; return (' + sanitized + ")")();
      if (typeof result === "number" && isFinite(result) && result > 0) {
        return Math.round(result * 100) / 100;
      }
      return null;
    } catch {
      return null;
    }
  };

  const resetForm = useCallback(() => {
    setAmount("");
    setCategoryId(0);
    setMemo("");
    setDate(new Date().toISOString().split("T")[0]);
    setShowDate(false);
    setShowMemo(false);
    setError(null);
    // Keep account and type — user likely uses the same account repeatedly
  }, []);

  const handleSubmit = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setError(null);

    // Validate
    const parsedAmount = evaluateAmount(amount);
    if (!parsedAmount) {
      setError("Enter a valid amount greater than 0");
      return;
    }

    if (!accountId) {
      setError("Select an account");
      return;
    }

    if (type === "TRANSFER") {
      if (!toAccountId) {
        setError("Select a destination account");
        return;
      }
      if (accountId === toAccountId) {
        setError("From and To accounts must be different");
        return;
      }
    } else {
      if (!categoryId) {
        setError("Select a category");
        return;
      }
    }

    setLoading(true);
    try {
      const input: CreateTransactionInput = {
        date,
        transaction_type: type,
        amount: parsedAmount,
        account_id: accountId,
        to_account_id: type === "TRANSFER" ? toAccountId : null,
        category_id: type === "TRANSFER" ? null : categoryId,
        memo: memo.trim() || null,
      };

      await invoke("create_transaction", { input });

      // Build success message
      const categoryName =
        type !== "TRANSFER"
          ? getCategoryName(categoryId)
          : getAccountName(toAccountId);
      const label =
        type === "TRANSFER"
          ? "Transfer"
          : type === "INCOME"
            ? "Income"
            : "Expense";
      setSuccessMessage(
        `✓ ${label} saved — ${formatAmount(parsedAmount)} → ${categoryName}`,
      );

      // Clear success after 2s
      if (successTimerRef.current) clearTimeout(successTimerRef.current);
      successTimerRef.current = setTimeout(() => {
        setSuccessMessage(null);
      }, SUCCESS_DISPLAY_MS);

      resetForm();
      onTransactionAdded();

      // Reload recent categories after adding
      if (type !== "TRANSFER") {
        loadRecentCategories(type);
      }

      // Re-focus amount for next entry
      amountRef.current?.focus();
    } catch (err) {
      setError(typeof err === "string" ? err : "Failed to save transaction");
    } finally {
      setLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  };

  const getCategoryName = (id: number): string => {
    for (const parent of categories) {
      if (parent.id === id) return parent.name;
      for (const child of parent.children) {
        if (child.id === id) return child.name;
      }
    }
    return "Unknown";
  };

  const getAccountName = (id: number): string => {
    return accounts.find((a) => a.id === id)?.name || "Unknown";
  };

  // Build category options: recent first, divider, then full tree
  const buildCategoryOptions = () => {
    const filteredCategories = categories.filter(
      (c) => c.category_type === type,
    );
    const recentIds = new Set(recentCategories.map((c) => c.id));

    const options: {
      value: number;
      label: string;
      isRecent?: boolean;
      isDivider?: boolean;
    }[] = [];

    // Recent categories at top
    if (recentCategories.length > 0) {
      recentCategories.forEach((cat) => {
        // Find parent name for context
        const parent = categories.find((p) =>
          p.children.some((c) => c.id === cat.id),
        );
        const label = parent ? `${parent.name} › ${cat.name}` : cat.name;
        options.push({ value: cat.id, label: `⏱ ${label}`, isRecent: true });
      });
      options.push({ value: -1, label: "──────────", isDivider: true });
    }

    // Full category tree
    filteredCategories.forEach((parent) => {
      if (!recentIds.has(parent.id)) {
        options.push({ value: parent.id, label: parent.name });
      }
      parent.children.forEach((child) => {
        if (!recentIds.has(child.id)) {
          options.push({
            value: child.id,
            label: `  └ ${child.name}`,
          });
        }
      });
    });

    return options;
  };

  // No accounts — show empty state
  if (accounts.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
        <p className="text-sm text-gray-500 dark:text-gray-400 text-center">
          Create an account first to start adding transactions quickly.
        </p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4 mb-6">
      <form onSubmit={handleSubmit} onKeyDown={handleKeyDown}>
        {/* Main row */}
        <div className="flex items-center gap-3">
          {/* Type toggle pills */}
          <div className="flex rounded-lg border border-gray-200 dark:border-gray-700 overflow-hidden flex-shrink-0">
            <button
              type="button"
              onClick={() => setType("EXPENSE")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                type === "EXPENSE"
                  ? "bg-red-500 text-white"
                  : "bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600"
              }`}
            >
              Expense
            </button>
            <button
              type="button"
              onClick={() => setType("INCOME")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors border-x border-gray-200 dark:border-gray-700 ${
                type === "INCOME"
                  ? "bg-green-500 text-white"
                  : "bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600"
              }`}
            >
              Income
            </button>
            <button
              type="button"
              onClick={() => setType("TRANSFER")}
              className={`px-3 py-1.5 text-xs font-medium transition-colors ${
                type === "TRANSFER"
                  ? "bg-blue-500 text-white"
                  : "bg-gray-50 dark:bg-gray-700 text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-600"
              }`}
            >
              <ArrowsRightLeftIcon className="h-3.5 w-3.5 inline" />
            </button>
          </div>

          {/* Amount */}
          <input
            ref={amountRef}
            type="text"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            placeholder="Amount"
            className="w-32 px-3 py-2 text-sm font-medium border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            autoFocus
          />

          {/* Account (From) */}
          <select
            value={accountId}
            onChange={(e) => setAccountId(Number(e.target.value))}
            className="w-40 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
          >
            {accounts.map((acc) => (
              <option key={acc.id} value={acc.id}>
                {type === "TRANSFER" ? `From: ${acc.name}` : acc.name}
              </option>
            ))}
          </select>

          {/* To Account (Transfer only) */}
          {type === "TRANSFER" && (
            <select
              value={toAccountId}
              onChange={(e) => setToAccountId(Number(e.target.value))}
              className="w-40 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            >
              {accounts
                .filter((acc) => acc.id !== accountId)
                .map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    To: {acc.name}
                  </option>
                ))}
            </select>
          )}

          {/* Category (Income/Expense only) */}
          {type !== "TRANSFER" && (
            <select
              value={categoryId}
              onChange={(e) => setCategoryId(Number(e.target.value))}
              className="w-44 px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            >
              <option value={0}>Category</option>
              {buildCategoryOptions().map((opt) =>
                opt.isDivider ? (
                  <option key="divider" disabled>
                    {opt.label}
                  </option>
                ) : (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ),
              )}
            </select>
          )}

          {/* Optional field toggles */}
          <div className="flex items-center gap-1 flex-shrink-0">
            <button
              type="button"
              onClick={() => setShowDate(!showDate)}
              className={`p-1.5 rounded-lg transition-colors ${
                showDate
                  ? "bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400"
                  : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
              title="Change date"
            >
              <CalendarDaysIcon className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => setShowMemo(!showMemo)}
              className={`p-1.5 rounded-lg transition-colors ${
                showMemo
                  ? "bg-accent-100 dark:bg-accent-900/30 text-accent-600 dark:text-accent-400"
                  : "text-gray-400 dark:text-gray-500 hover:bg-gray-100 dark:hover:bg-gray-700"
              }`}
              title="Add memo"
            >
              <ChatBubbleLeftIcon className="h-4 w-4" />
            </button>
          </div>

          {/* Add button */}
          <button
            type="submit"
            disabled={loading}
            className="flex items-center gap-1.5 px-4 py-2 text-sm font-medium text-white bg-accent-600 hover:bg-accent-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex-shrink-0"
          >
            {loading ? (
              <div className="h-4 w-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
            ) : (
              <PlusIcon className="h-4 w-4" />
            )}
            Add
          </button>
        </div>

        {/* Expanded optional fields row */}
        {(showDate || showMemo) && (
          <div className="flex items-center gap-3 mt-3 pl-1">
            {showDate && (
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              />
            )}
            {showMemo && (
              <input
                type="text"
                value={memo}
                onChange={(e) => setMemo(e.target.value)}
                placeholder="Memo (optional)"
                className="flex-1 px-3 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              />
            )}
          </div>
        )}
      </form>

      {/* Success message (inline, fades) */}
      {successMessage && (
        <div className="mt-2 text-sm text-green-600 dark:text-green-400 font-medium flex items-center gap-1.5 animate-fade-in">
          <CheckIcon className="h-4 w-4" />
          {successMessage}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mt-2 text-sm text-red-600 dark:text-red-400">
          {error}
        </div>
      )}
    </div>
  );
}
