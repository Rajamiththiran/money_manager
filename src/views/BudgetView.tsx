// File: src/views/BudgetView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlusIcon, ExclamationTriangleIcon } from "@heroicons/react/24/outline";
import Button from "../components/Button";
import BudgetCard from "../components/BudgetCard";
import BudgetForm from "../components/BudgetForm";
import type {
  BudgetStatus,
  BudgetAlert,
  CreateBudgetInput,
  UpdateBudgetInput,
} from "../types/budget";
import type { CategoryWithChildren } from "../types/category";

export default function BudgetView() {
  const [budgets, setBudgets] = useState<BudgetStatus[]>([]);
  const [alerts, setAlerts] = useState<BudgetAlert[]>([]);
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingBudget, setEditingBudget] = useState<BudgetStatus | null>(null);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [budgetStatuses, budgetAlerts, cats] = await Promise.all([
        invoke<BudgetStatus[]>("get_all_budget_statuses"),
        invoke<BudgetAlert[]>("get_budget_alerts"),
        invoke<CategoryWithChildren[]>("get_categories_with_children"),
      ]);
      setBudgets(budgetStatuses);
      setAlerts(budgetAlerts);
      setCategories(cats);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (input: CreateBudgetInput) => {
    setError(null);
    try {
      await invoke("create_budget", { input });
      await loadData();
      setShowForm(false);
    } catch (err) {
      setError(err as string);
      throw err;
    }
  };

  const handleUpdate = async (input: UpdateBudgetInput) => {
    setError(null);
    try {
      await invoke("update_budget", { input });
      await loadData();
      setShowForm(false);
      setEditingBudget(null);
    } catch (err) {
      setError(err as string);
      throw err;
    }
  };

  const handleDelete = async (budgetId: number) => {
    if (!confirm("Are you sure you want to delete this budget?")) return;

    setError(null);
    try {
      await invoke("delete_budget", { budgetId });
      await loadData();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleEdit = (budget: BudgetStatus) => {
    setEditingBudget(budget);
    setShowForm(true);
  };

  const handleModalClose = () => {
    setShowForm(false);
    setEditingBudget(null);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Budgets
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Set spending limits and track your progress
          </p>
        </div>
        <Button
          onClick={() => setShowForm(true)}
          icon={<PlusIcon className="h-5 w-5" />}
        >
          New Budget
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

      {/* Budget Alerts */}
      {alerts.length > 0 && (
        <div className="mb-8 space-y-3">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white flex items-center gap-2">
            <ExclamationTriangleIcon className="h-5 w-5 text-yellow-600" />
            Budget Alerts
          </h2>
          {alerts.map((alert) => (
            <div
              key={alert.budget_id}
              className={`p-4 rounded-lg border-l-4 ${
                alert.alert_level === "CRITICAL"
                  ? "bg-red-100 dark:bg-red-900/20 border-red-600"
                  : alert.alert_level === "DANGER"
                    ? "bg-red-50 dark:bg-red-900/10 border-red-500"
                    : "bg-yellow-50 dark:bg-yellow-900/10 border-yellow-500"
              }`}
            >
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold text-gray-900 dark:text-white">
                    {alert.category_name}
                  </p>
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Rs {alert.spent_amount.toLocaleString()} of Rs{" "}
                    {alert.budget_amount.toLocaleString()} (
                    {alert.percentage_used.toFixed(1)}%)
                  </p>
                </div>
                <span
                  className={`px-3 py-1 rounded-full text-xs font-semibold ${
                    alert.alert_level === "CRITICAL"
                      ? "bg-red-600 text-white"
                      : alert.alert_level === "DANGER"
                        ? "bg-red-500 text-white"
                        : "bg-yellow-500 text-white"
                  }`}
                >
                  {alert.alert_level}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Budget List */}
      {loading && budgets.length === 0 ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading budgets...
          </p>
        </div>
      ) : budgets.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">
            No budgets yet. Create your first one to start tracking spending!
          </p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {budgets.map((budget) => (
            <BudgetCard
              key={budget.id}
              status={budget}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))}
        </div>
      )}

      {/* Modal */}
      {showForm && (
        <BudgetForm
          budget={editingBudget}
          categories={categories}
          onSave={async (input) => {
            if (editingBudget) {
              await handleUpdate(input as UpdateBudgetInput);
            } else {
              await handleCreate(input as CreateBudgetInput);
            }
          }}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
