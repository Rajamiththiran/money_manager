// File: src/components/TransactionModal.tsx
import { useState } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import Input from "./Input";
import PhotoAttachment from "./PhotoAttachment";
import type {
  TransactionWithDetails,
  UpdateTransactionInput,
} from "../types/transaction";
import type { AccountWithBalance } from "../types/account";
import type { CategoryWithChildren } from "../types/category";

interface TransactionModalProps {
  transaction: TransactionWithDetails;
  accounts: AccountWithBalance[];
  categories: CategoryWithChildren[];
  onSave: (input: UpdateTransactionInput) => Promise<void>;
  onClose: () => void;
}

export default function TransactionModal({
  transaction,
  accounts,
  categories,
  onSave,
  onClose,
}: TransactionModalProps) {
  const [formData, setFormData] = useState({
    date: transaction.date.split("T")[0],
    amount: transaction.amount.toString(),
    category_id: transaction.category_id || 0,
    memo: transaction.memo || "",
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Please enter a valid amount greater than 0");
      }

      await onSave({
        id: transaction.id,
        date: formData.date,
        amount,
        category_id: formData.category_id || undefined,
        memo: formData.memo || undefined,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Filter categories by transaction type
  const filteredCategories =
    transaction.transaction_type !== "TRANSFER"
      ? categories.filter(
          (cat) => cat.category_type === transaction.transaction_type,
        )
      : [];

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

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full max-h-[90vh] overflow-y-auto">
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Edit Transaction
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {/* Read-only info */}
          <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg space-y-2">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Type:</strong>{" "}
              <span
                className={
                  transaction.transaction_type === "INCOME"
                    ? "text-green-600 dark:text-green-400"
                    : transaction.transaction_type === "EXPENSE"
                      ? "text-red-600 dark:text-red-400"
                      : "text-blue-600 dark:text-blue-400"
                }
              >
                {transaction.transaction_type}
              </span>
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              <strong>Account:</strong>{" "}
              {transaction.transaction_type === "TRANSFER"
                ? `${transaction.account_name} → ${transaction.to_account_name}`
                : transaction.account_name}
            </p>
          </div>

          <Input
            label="Date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />

          {/* Editable amount */}
          <Input
            label="Amount"
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) =>
              setFormData({ ...formData, amount: e.target.value })
            }
            required
          />

          {transaction.transaction_type !== "TRANSFER" && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category
              </label>
              <select
                value={formData.category_id.toString()}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    category_id: parseInt(e.target.value),
                  })
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
              >
                {categoryOptions.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Memo
            </label>
            <textarea
              value={formData.memo}
              onChange={(e) =>
                setFormData({ ...formData, memo: e.target.value })
              }
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Add a note..."
            />
          </div>

          {/* Receipt Photo */}
          <PhotoAttachment
            transactionId={transaction.id}
            photoPath={transaction.photo_path}
          />

          <div className="flex gap-3 pt-4">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              fullWidth
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading} fullWidth>
              {loading ? "Saving..." : "Update"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
