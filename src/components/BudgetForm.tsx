// File: src/components/BudgetForm.tsx
import { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import Input from "./Input";
import Select from "./Select";
import type {
  BudgetStatus,
  CreateBudgetInput,
  UpdateBudgetInput,
} from "../types/budget";
import type { CategoryWithChildren } from "../types/category";

interface BudgetFormProps {
  budget: BudgetStatus | null;
  categories: CategoryWithChildren[];
  onSave: (input: CreateBudgetInput | UpdateBudgetInput) => Promise<void>;
  onClose: () => void;
}

export default function BudgetForm({
  budget,
  categories,
  onSave,
  onClose,
}: BudgetFormProps) {
  const [formData, setFormData] = useState({
    category_id: 0,
    amount: "",
    period: "MONTHLY",
    start_date: new Date().toISOString().split("T")[0],
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (budget) {
      setFormData({
        category_id: budget.category_id,
        amount: budget.amount.toString(),
        period: budget.period,
        start_date: budget.start_date,
      });
    }
  }, [budget]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Please enter a valid amount greater than 0");
      }

      if (budget) {
        // Update existing budget
        await onSave({
          id: budget.id,
          amount,
          start_date: formData.start_date,
        });
      } else {
        // Create new budget
        if (formData.category_id === 0) {
          throw new Error("Please select a category");
        }

        await onSave({
          category_id: formData.category_id,
          amount,
          period: formData.period,
          start_date: formData.start_date,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Flatten categories for dropdown (only EXPENSE categories)
  const expenseCategories = categories.filter(
    (cat) => cat.category_type === "EXPENSE",
  );

  const categoryOptions = [
    { value: "0", label: "Select Category" },
    ...expenseCategories.flatMap((parent) => [
      { value: parent.id.toString(), label: parent.name },
      ...parent.children.map((child) => ({
        value: child.id.toString(),
        label: `  ↳ ${child.name}`,
      })),
    ]),
  ];

  const periodOptions = [
    { value: "MONTHLY", label: "Monthly" },
    { value: "YEARLY", label: "Yearly" },
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {budget ? "Edit Budget" : "Create Budget"}
          </h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          {!budget && (
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
          )}

          {budget && (
            <div className="p-4 bg-gray-50 dark:bg-gray-700/50 rounded-lg">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Category:</strong> {budget.category_name}
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                <strong>Period:</strong> {budget.period}
              </p>
            </div>
          )}

          <Input
            label="Budget Amount"
            type="number"
            step="0.01"
            value={formData.amount}
            onChange={(e) =>
              setFormData({ ...formData, amount: e.target.value })
            }
            placeholder="0.00"
            required
          />

          {!budget && (
            <Select
              label="Period"
              value={formData.period}
              onChange={(e) =>
                setFormData({ ...formData, period: e.target.value })
              }
              options={periodOptions}
              required
            />
          )}

          <Input
            label="Start Date"
            type="date"
            value={formData.start_date}
            onChange={(e) =>
              setFormData({ ...formData, start_date: e.target.value })
            }
            required
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
              {loading ? "Saving..." : budget ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
