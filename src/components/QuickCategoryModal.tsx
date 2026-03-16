// File: src/components/QuickCategoryModal.tsx
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { XMarkIcon, PlusIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import Input from "./Input";
import Select from "./Select";
import type { CategoryWithChildren, CreateCategoryInput } from "../types/category";

interface QuickCategoryModalProps {
  categoryType: "INCOME" | "EXPENSE";
  parentCategories: CategoryWithChildren[];
  onCreated: (newCategoryId: number) => void;
  onClose: () => void;
}

export default function QuickCategoryModal({
  categoryType,
  parentCategories,
  onCreated,
  onClose,
}: QuickCategoryModalProps) {
  const [name, setName] = useState("");
  const [parentId, setParentId] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) return;

    setLoading(true);
    setError(null);

    try {
      const input: CreateCategoryInput = {
        name: name.trim(),
        parent_id: parentId,
        category_type: categoryType,
      };
      const newId = await invoke<number>("create_category", { input });
      onCreated(newId);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const parentOptions = [
    { value: "", label: "None (Top Level)" },
    ...parentCategories.map((cat) => ({
      value: cat.id.toString(),
      label: cat.name,
    })),
  ];

  const isIncome = categoryType === "INCOME";

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-[9999] p-4">
      <div
        className="bg-white dark:bg-gray-800 rounded-xl shadow-2xl max-w-sm w-full
          border border-gray-200 dark:border-gray-700
          animate-in fade-in zoom-in duration-200"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <div
              className={`p-1.5 rounded-lg ${
                isIncome
                  ? "bg-green-100 dark:bg-green-900/30"
                  : "bg-red-100 dark:bg-red-900/30"
              }`}
            >
              <PlusIcon
                className={`h-4 w-4 ${
                  isIncome
                    ? "text-green-600 dark:text-green-400"
                    : "text-red-600 dark:text-red-400"
                }`}
              />
            </div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
              Quick Add Category
            </h3>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="p-5 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}

          <Input
            label="Category Name"
            type="text"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={isIncome ? "e.g., Freelance, Bonus" : "e.g., Dining Out, Gym"}
            required
            autoFocus
          />

          <Select
            label="Parent Category (Optional)"
            value={parentId?.toString() || ""}
            onChange={(e) =>
              setParentId(e.target.value ? parseInt(e.target.value) : null)
            }
            options={parentOptions}
          />

          {/* Type badge */}
          <div
            className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-medium ${
              isIncome
                ? "bg-green-100 dark:bg-green-900/30 text-green-700 dark:text-green-300"
                : "bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300"
            }`}
          >
            <span
              className={`w-1.5 h-1.5 rounded-full ${
                isIncome
                  ? "bg-green-500"
                  : "bg-red-500"
              }`}
            />
            {categoryType} category
          </div>

          <div className="flex gap-3 pt-2">
            <Button
              type="button"
              variant="secondary"
              onClick={onClose}
              fullWidth
            >
              Cancel
            </Button>
            <Button type="submit" disabled={loading || !name.trim()} fullWidth>
              {loading ? "Creating..." : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
