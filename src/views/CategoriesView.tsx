// File: src/views/CategoriesView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlusIcon } from "@heroicons/react/24/outline";
import Button from "../components/Button";
import CategoryTree from "../components/CategoryTree";
import CategoryModal from "../components/CategoryModal";
import type {
  CategoryWithChildren,
  CreateCategoryInput,
  UpdateCategoryInput,
} from "../types/category";

export default function CategoriesView() {
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [activeTab, setActiveTab] = useState<"INCOME" | "EXPENSE">("EXPENSE");
  const [showModal, setShowModal] = useState(false);
  const [editingCategory, setEditingCategory] =
    useState<CategoryWithChildren | null>(null);

  useEffect(() => {
    loadCategories();
  }, []);

  const loadCategories = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await invoke<CategoryWithChildren[]>(
        "get_categories_with_children",
      );
      setCategories(data);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (input: CreateCategoryInput) => {
    setError(null);
    try {
      await invoke("create_category", { input });
      await loadCategories();
      setShowModal(false);
    } catch (err) {
      setError(err as string);
      throw err;
    }
  };

  const handleUpdate = async (input: UpdateCategoryInput) => {
    setError(null);
    try {
      await invoke("update_category", { input });
      await loadCategories();
      setShowModal(false);
      setEditingCategory(null);
    } catch (err) {
      setError(err as string);
      throw err;
    }
  };

  const handleDelete = async (categoryId: number) => {
    if (!confirm("Are you sure you want to delete this category?")) return;

    setError(null);
    try {
      await invoke("delete_category", { categoryId });
      await loadCategories();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleEdit = (category: CategoryWithChildren) => {
    setEditingCategory(category);
    setShowModal(true);
  };

  const handleModalClose = () => {
    setShowModal(false);
    setEditingCategory(null);
  };

  const filteredCategories = categories.filter(
    (cat) => cat.category_type === activeTab,
  );

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Categories
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Organize your income and expenses
          </p>
        </div>
        <Button
          onClick={() => setShowModal(true)}
          icon={<PlusIcon className="h-5 w-5" />}
        >
          New Category
        </Button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="mb-6 p-4 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
          <p className="text-sm font-medium text-red-800 dark:text-red-200">
            {error}
          </p>
        </div>
      )}

      {/* Tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("EXPENSE")}
          className={`px-6 py-3 font-medium border-b-2 transition-colors ${
            activeTab === "EXPENSE"
              ? "border-red-500 text-red-600 dark:text-red-400"
              : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          Expenses
        </button>
        <button
          onClick={() => setActiveTab("INCOME")}
          className={`px-6 py-3 font-medium border-b-2 transition-colors ${
            activeTab === "INCOME"
              ? "border-green-500 text-green-600 dark:text-green-400"
              : "border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          Income
        </button>
      </div>

      {/* Categories List */}
      {loading && categories.length === 0 ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading categories...
          </p>
        </div>
      ) : filteredCategories.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">
            No {activeTab.toLowerCase()} categories yet. Create your first one!
          </p>
        </div>
      ) : (
        <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          {filteredCategories.map((category) => (
            <CategoryTree
              key={category.id}
              category={category}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showModal && (
        <CategoryModal
          category={editingCategory}
          categoryType={activeTab}
          parentCategories={filteredCategories}
          onSave={async (input) => {
            if (editingCategory) {
              await handleUpdate(input as UpdateCategoryInput);
            } else {
              await handleCreate(input as CreateCategoryInput);
            }
          }}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
