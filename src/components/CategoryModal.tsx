// File: src/components/CategoryModal.tsx
import { useState, useEffect } from "react";
import { XMarkIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import Input from "./Input";
import Select from "./Select";
import type {
  CategoryWithChildren,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../types/category";

interface CategoryModalProps {
  category: CategoryWithChildren | null;
  categoryType: "INCOME" | "EXPENSE";
  parentCategories: CategoryWithChildren[];
  onSave: (input: CreateCategoryInput | UpdateCategoryInput) => Promise<void>;
  onClose: () => void;
}

export default function CategoryModal({
  category,
  categoryType,
  parentCategories,
  onSave,
  onClose,
}: CategoryModalProps) {
  const [formData, setFormData] = useState({
    name: "",
    parent_id: null as number | null,
  });
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (category) {
      setFormData({
        name: category.name,
        parent_id: category.parent_id,
      });
    }
  }, [category]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      if (category) {
        // Update existing category
        await onSave({
          id: category.id,
          name: formData.name,
          parent_id: formData.parent_id ?? undefined,
        });
      } else {
        // Create new category
        await onSave({
          name: formData.name,
          parent_id: formData.parent_id ?? null,
          category_type: categoryType,
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  // Filter out the category being edited from parent options (prevent self-parent)
  const availableParents = category
    ? parentCategories.filter((p) => p.id !== category.id)
    : parentCategories;

  const parentOptions = [
    { value: "", label: "None (Top Level)" },
    ...availableParents.map((cat) => ({
      value: cat.id.toString(),
      label: cat.name,
    })),
  ];

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            {category ? "Edit Category" : "Create Category"}
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

          <Input
            label="Category Name"
            type="text"
            value={formData.name}
            onChange={(e) => setFormData({ ...formData, name: e.target.value })}
            placeholder="e.g., Food, Salary, Transportation"
            required
          />

          <Select
            label="Parent Category (Optional)"
            value={formData.parent_id?.toString() || ""}
            onChange={(e) =>
              setFormData({
                ...formData,
                parent_id: e.target.value ? parseInt(e.target.value) : null,
              })
            }
            options={parentOptions}
          />

          {!category && (
            <div className="p-4 rounded-lg bg-gray-50 dark:bg-gray-700/50">
              <p className="text-sm text-gray-600 dark:text-gray-400">
                <strong>Type:</strong>{" "}
                <span
                  className={
                    categoryType === "INCOME"
                      ? "text-green-600 dark:text-green-400"
                      : "text-red-600 dark:text-red-400"
                  }
                >
                  {categoryType}
                </span>
              </p>
            </div>
          )}

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
              {loading ? "Saving..." : category ? "Update" : "Create"}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
