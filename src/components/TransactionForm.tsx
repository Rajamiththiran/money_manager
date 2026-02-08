// File: src/components/TransactionForm.tsx
import { useState, useEffect } from "react";
import Input from "./Input";
import Select from "./Select";
import Button from "./Button";
import Calculator from "./Calculator";
import type { CreateTransactionInput } from "../types/transaction";
import type { AccountWithBalance } from "../types/account";
import type { CategoryWithChildren } from "../types/category";

interface TransactionFormProps {
  accounts: AccountWithBalance[];
  categories: CategoryWithChildren[];
  onSubmit: (input: CreateTransactionInput) => Promise<void>;
  onCancel: () => void;
  prefillData?: {
    transaction_type?: "INCOME" | "EXPENSE" | "TRANSFER";
    account_id?: number;
    category_id?: number;
    from_account_id?: number;
    to_account_id?: number;
    amount?: number;
    memo?: string;
  } | null;
}

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";

export default function TransactionForm({
  accounts,
  categories,
  onSubmit,
  onCancel,
  prefillData,
}: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    account_id: accounts[0]?.id || 0,
    to_account_id: accounts[1]?.id || 0,
    category_id: 0,
    memo: "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);

  // React to prefillData changes (template usage or initial load)
  useEffect(() => {
    if (prefillData) {
      // Set the transaction type from template
      if (prefillData.transaction_type) {
        setType(prefillData.transaction_type);
      }
      // Set form fields from template
      setFormData({
        date: new Date().toISOString().split("T")[0],
        amount: prefillData.amount?.toString() || "",
        account_id:
          prefillData.account_id ||
          prefillData.from_account_id ||
          accounts[0]?.id ||
          0,
        to_account_id: prefillData.to_account_id || accounts[1]?.id || 0,
        category_id: prefillData.category_id || 0,
        memo: prefillData.memo || "",
      });
    } else {
      // No prefill — default to EXPENSE for manual "New Transaction"
      setType("EXPENSE");
      setFormData({
        date: new Date().toISOString().split("T")[0],
        amount: "",
        account_id: accounts[0]?.id || 0,
        to_account_id: accounts[1]?.id || 0,
        category_id: 0,
        memo: "",
      });
    }
  }, [prefillData, accounts]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Please enter a valid amount greater than 0");
      }

      const input: CreateTransactionInput = {
        date: formData.date,
        transaction_type: type,
        amount,
        account_id: formData.account_id,
        to_account_id: type === "TRANSFER" ? formData.to_account_id : null,
        category_id:
          type !== "TRANSFER" && formData.category_id
            ? formData.category_id
            : null,
        memo: formData.memo || null,
      };

      // Validation
      if (type === "TRANSFER" && input.account_id === input.to_account_id) {
        throw new Error("Cannot transfer to the same account");
      }

      if (type !== "TRANSFER" && !input.category_id) {
        throw new Error("Please select a category");
      }

      await onSubmit(input);

      // Reset form
      setFormData({
        date: new Date().toISOString().split("T")[0],
        amount: "",
        account_id: accounts[0]?.id || 0,
        to_account_id: accounts[1]?.id || 0,
        category_id: 0,
        memo: "",
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (value: string) => {
    setFormData({ ...formData, amount: value });
  };

  // Filter categories by type
  const filteredCategories =
    type !== "TRANSFER"
      ? categories.filter((cat) => cat.category_type === type)
      : [];

  // Flatten categories for dropdown
  const categoryOptions = [
    { value: "0", label: "Select Category" },
    ...filteredCategories.flatMap((parent) => [
      { value: parent.id.toString(), label: parent.name },
      ...parent.children.map((child) => ({
        value: child.id.toString(),
        label: `  ↳ ${child.name}`,
      })),
    ]),
  ];

  const accountOptions = accounts.map((acc) => ({
    value: acc.id.toString(),
    label: `${acc.name} (${acc.current_balance.toFixed(2)} ${acc.currency})`,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        {prefillData ? "New Transaction from Template" : "New Transaction"}
      </h2>

      {/* Transaction Type Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setType("INCOME")}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            type === "INCOME"
              ? "bg-green-500 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          Income
        </button>
        <button
          type="button"
          onClick={() => setType("EXPENSE")}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            type === "EXPENSE"
              ? "bg-red-500 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setType("TRANSFER")}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            type === "TRANSFER"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          Transfer
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date */}
          <Input
            label="Date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />

          {/* Amount with Calculator */}
          <div className="relative">
            <Input
              label="Amount"
              type="text"
              value={formData.amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="Enter amount or calculation (e.g., 50+20+10)"
              required
            />
            <button
              type="button"
              onClick={() => setShowCalculator(!showCalculator)}
              className="absolute right-3 top-9 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showCalculator ? "Hide" : "Calculator"}
            </button>
            {showCalculator && (
              <Calculator
                value={formData.amount}
                onChange={handleAmountChange}
              />
            )}
          </div>

          {/* Account Selection */}
          {type === "TRANSFER" ? (
            <>
              <Select
                label="From Account"
                value={formData.account_id.toString()}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    account_id: parseInt(e.target.value),
                  })
                }
                options={accountOptions}
                required
              />
              <Select
                label="To Account"
                value={formData.to_account_id.toString()}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    to_account_id: parseInt(e.target.value),
                  })
                }
                options={accountOptions}
                required
              />
            </>
          ) : (
            <>
              <Select
                label="Account"
                value={formData.account_id.toString()}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    account_id: parseInt(e.target.value),
                  })
                }
                options={accountOptions}
                required
              />
              <Select
                label="Category"
                value={formData.category_id.toString()}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    category_id: parseInt(e.target.value),
                  })
                }
                options={categoryOptions}
                required
              />
            </>
          )}
        </div>

        {/* Memo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Memo (Optional)
          </label>
          <textarea
            value={formData.memo}
            onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Add a note about this transaction..."
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            fullWidth
          >
            Cancel
          </Button>
          <Button type="submit" disabled={loading} fullWidth>
            {loading ? "Saving..." : "Save Transaction"}
          </Button>
        </div>
      </form>
    </div>
  );
}
