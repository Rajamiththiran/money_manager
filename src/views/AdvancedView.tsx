// File: src/views/AdvancedView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Bookmark, Repeat, CreditCard, Plus, X } from "lucide-react";
import TemplateLibrary from "../components/TemplateLibrary";
import RecurringTransactionList from "../components/RecurringTransactionList";
import InstallmentPlanList from "../components/InstallmentPlanList";
import Button from "../components/Button";
import Input from "../components/Input";
import Select from "../components/Select";
import { useToast } from "../components/Toast";
import type { Account } from "../types/account";
import type { Category } from "../types/category";
import type {
  CreateRecurringTransactionInput,
  RecurringFrequency,
} from "../types/recurring";
import type { CreateInstallmentPlan } from "../types/installment";
import type { TransactionTemplateWithDetails } from "../types/template";

type Tab = "templates" | "recurring" | "installments";

const TAB_CONFIG: Array<{
  key: Tab;
  label: string;
  icon: typeof Bookmark;
}> = [
  { key: "templates", label: "Templates", icon: Bookmark },
  { key: "recurring", label: "Recurring", icon: Repeat },
  { key: "installments", label: "Installments", icon: CreditCard },
];

const INITIAL_RECURRING: CreateRecurringTransactionInput = {
  name: "",
  description: null,
  transaction_type: "EXPENSE",
  amount: 0,
  account_id: 0,
  to_account_id: null,
  category_id: null,
  frequency: "MONTHLY",
  interval_days: null,
  start_date: new Date().toISOString().split("T")[0],
  end_date: null,
};

const INITIAL_INSTALLMENT: CreateInstallmentPlan = {
  name: "",
  total_amount: 0,
  num_installments: 12,
  account_id: 0,
  category_id: 0,
  start_date: new Date().toISOString().split("T")[0],
  frequency: "MONTHLY",
  memo: null,
};

export default function AdvancedView() {
  const { success, error: showError } = useToast();
  const [activeTab, setActiveTab] = useState<Tab>("templates");
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);

  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [recurringForm, setRecurringForm] = useState({ ...INITIAL_RECURRING });
  const [recurringRefreshKey, setRecurringRefreshKey] = useState(0);
  const [recurringSubmitting, setRecurringSubmitting] = useState(false);

  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [installmentForm, setInstallmentForm] = useState({
    ...INITIAL_INSTALLMENT,
  });
  const [installmentRefreshKey, setInstallmentRefreshKey] = useState(0);
  const [installmentSubmitting, setInstallmentSubmitting] = useState(false);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [acc, cat] = await Promise.all([
        invoke<Account[]>("get_accounts"),
        invoke<Category[]>("get_categories"),
      ]);
      setAccounts(acc);
      setCategories(cat);
    } catch (err) {
      console.error("Failed to load data:", err);
    }
  };

  const handleUseTemplate = (template: TransactionTemplateWithDetails) => {
    sessionStorage.setItem("templateData", JSON.stringify(template));
    window.dispatchEvent(new CustomEvent("navigate-to-transactions"));
  };

  const handleCreateRecurring = async () => {
    if (!recurringForm.name.trim()) {
      showError("Validation Error", "Name is required.");
      return;
    }
    if (recurringForm.amount <= 0) {
      showError("Validation Error", "Amount must be greater than zero.");
      return;
    }
    if (recurringForm.account_id === 0) {
      showError("Validation Error", "Please select an account.");
      return;
    }
    if (
      recurringForm.transaction_type === "TRANSFER" &&
      !recurringForm.to_account_id
    ) {
      showError("Validation Error", "Transfer requires a destination account.");
      return;
    }

    setRecurringSubmitting(true);
    try {
      await invoke("create_recurring_transaction", { input: recurringForm });
      success(
        "Recurring Created",
        `"${recurringForm.name}" scheduled ${recurringForm.frequency.toLowerCase()}.`,
      );
      setShowRecurringForm(false);
      setRecurringForm({ ...INITIAL_RECURRING });
      setRecurringRefreshKey((p) => p + 1);
    } catch (err) {
      showError("Failed to create", String(err));
    } finally {
      setRecurringSubmitting(false);
    }
  };

  const handleCreateInstallment = async () => {
    if (!installmentForm.name.trim()) {
      showError("Validation Error", "Plan name is required.");
      return;
    }
    if (installmentForm.total_amount <= 0) {
      showError("Validation Error", "Total amount must be greater than zero.");
      return;
    }
    if (installmentForm.num_installments <= 0) {
      showError(
        "Validation Error",
        "Number of installments must be at least 1.",
      );
      return;
    }
    if (installmentForm.account_id === 0) {
      showError("Validation Error", "Please select an account.");
      return;
    }
    if (installmentForm.category_id === 0) {
      showError("Validation Error", "Please select a category.");
      return;
    }

    setInstallmentSubmitting(true);
    try {
      await invoke("create_installment_plan", { plan: installmentForm });
      const monthly = (
        installmentForm.total_amount / installmentForm.num_installments
      ).toFixed(2);
      success(
        "Plan Created",
        `"${installmentForm.name}" — LKR ${monthly}/month × ${installmentForm.num_installments}.`,
      );
      setShowInstallmentForm(false);
      setInstallmentForm({ ...INITIAL_INSTALLMENT });
      setInstallmentRefreshKey((p) => p + 1);
    } catch (err) {
      showError("Failed to create plan", String(err));
    } finally {
      setInstallmentSubmitting(false);
    }
  };

  const accountOptions = [
    { value: "0", label: "Select Account" },
    ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
  ];

  const getCategoryOptions = (type: "INCOME" | "EXPENSE") => [
    { value: "0", label: "Select Category" },
    ...categories
      .filter((c) => c.category_type === type)
      .map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const transactionTypeOptions = [
    { value: "INCOME", label: "Income" },
    { value: "EXPENSE", label: "Expense" },
    { value: "TRANSFER", label: "Transfer" },
  ];

  const frequencyOptions = [
    { value: "DAILY", label: "Daily" },
    { value: "WEEKLY", label: "Weekly" },
    { value: "MONTHLY", label: "Monthly" },
    { value: "YEARLY", label: "Yearly" },
  ];

  const installmentFreqOptions = [
    { value: "DAILY", label: "Daily" },
    { value: "WEEKLY", label: "Weekly" },
    { value: "MONTHLY", label: "Monthly" },
  ];

  const updateR = (p: Partial<CreateRecurringTransactionInput>) =>
    setRecurringForm((prev) => ({ ...prev, ...p }));

  const updateI = (p: Partial<CreateInstallmentPlan>) =>
    setInstallmentForm((prev) => ({ ...prev, ...p }));

  const monthlyPaymentPreview =
    installmentForm.num_installments > 0
      ? (
          installmentForm.total_amount / installmentForm.num_installments
        ).toFixed(2)
      : "0.00";

  return (
    <div className="p-6 lg:p-8 max-w-7xl">
      {/* Page Header */}
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          Advanced Features
        </h1>
        <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
          Templates, recurring transactions, and installment plans
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-1 mb-6 bg-gray-100 dark:bg-gray-800 rounded-xl p-1">
        {TAB_CONFIG.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => setActiveTab(tab.key)}
              className={`flex-1 flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg text-sm font-medium transition-all duration-200 ${
                isActive
                  ? "bg-white dark:bg-gray-700 text-gray-900 dark:text-white shadow-sm"
                  : "text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-200"
              }`}
            >
              <Icon className="w-4 h-4" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ════════ TEMPLATES ════════ */}
      {activeTab === "templates" && (
        <TemplateLibrary
          accounts={accounts}
          categories={categories}
          onUseTemplate={handleUseTemplate}
        />
      )}

      {/* ════════ RECURRING ════════ */}
      {activeTab === "recurring" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Recurring Transactions
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Automate your regular income, expenses, and transfers
              </p>
            </div>
            <Button
              onClick={() => {
                setShowRecurringForm(!showRecurringForm);
                if (!showRecurringForm)
                  setRecurringForm({ ...INITIAL_RECURRING });
              }}
              icon={
                showRecurringForm ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )
              }
              variant={showRecurringForm ? "secondary" : "primary"}
            >
              {showRecurringForm ? "Cancel" : "New Recurring"}
            </Button>
          </div>

          {showRecurringForm && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                <Repeat className="w-5 h-5 text-blue-500" />
                New Recurring Transaction
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Name"
                  value={recurringForm.name}
                  onChange={(e) => updateR({ name: e.target.value })}
                  placeholder="e.g., Monthly Rent, Salary"
                />
                <Select
                  label="Transaction Type"
                  value={recurringForm.transaction_type}
                  onChange={(e) => {
                    const type = e.target.value as
                      | "INCOME"
                      | "EXPENSE"
                      | "TRANSFER";
                    updateR({
                      transaction_type: type,
                      category_id: null,
                      to_account_id: null,
                    });
                  }}
                  options={transactionTypeOptions}
                />
                <Select
                  label="Frequency"
                  value={recurringForm.frequency}
                  onChange={(e) =>
                    updateR({ frequency: e.target.value as RecurringFrequency })
                  }
                  options={frequencyOptions}
                />
                <Input
                  label="Amount (LKR)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={recurringForm.amount || ""}
                  onChange={(e) => updateR({ amount: Number(e.target.value) })}
                  placeholder="0.00"
                />

                {recurringForm.transaction_type !== "TRANSFER" ? (
                  <>
                    <Select
                      label="Account"
                      value={String(recurringForm.account_id)}
                      onChange={(e) =>
                        updateR({ account_id: Number(e.target.value) })
                      }
                      options={accountOptions}
                    />
                    <Select
                      label="Category"
                      value={String(recurringForm.category_id || 0)}
                      onChange={(e) =>
                        updateR({ category_id: Number(e.target.value) || null })
                      }
                      options={getCategoryOptions(
                        recurringForm.transaction_type as "INCOME" | "EXPENSE",
                      )}
                    />
                  </>
                ) : (
                  <>
                    <Select
                      label="From Account"
                      value={String(recurringForm.account_id)}
                      onChange={(e) =>
                        updateR({ account_id: Number(e.target.value) })
                      }
                      options={accountOptions}
                    />
                    <Select
                      label="To Account"
                      value={String(recurringForm.to_account_id || 0)}
                      onChange={(e) =>
                        updateR({
                          to_account_id: Number(e.target.value) || null,
                        })
                      }
                      options={accountOptions.filter(
                        (a) =>
                          a.value === "0" ||
                          a.value !== String(recurringForm.account_id),
                      )}
                    />
                  </>
                )}

                <Input
                  label="Start Date"
                  type="date"
                  value={recurringForm.start_date}
                  onChange={(e) => updateR({ start_date: e.target.value })}
                />
                <Input
                  label="End Date (Optional)"
                  type="date"
                  value={recurringForm.end_date || ""}
                  onChange={(e) =>
                    updateR({ end_date: e.target.value || null })
                  }
                  helperText="Leave empty for no end date"
                />
                <div className="md:col-span-2">
                  <Input
                    label="Description (Optional)"
                    value={recurringForm.description || ""}
                    onChange={(e) =>
                      updateR({ description: e.target.value || null })
                    }
                    placeholder="e.g., Apartment rent payment"
                  />
                </div>
              </div>
              <div className="flex justify-end mt-5">
                <Button
                  onClick={handleCreateRecurring}
                  disabled={recurringSubmitting}
                  icon={<Plus className="w-4 h-4" />}
                >
                  {recurringSubmitting
                    ? "Creating..."
                    : "Create Recurring Transaction"}
                </Button>
              </div>
            </div>
          )}

          <RecurringTransactionList refreshKey={recurringRefreshKey} />
        </div>
      )}

      {/* ════════ INSTALLMENTS ════════ */}
      {activeTab === "installments" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Installment Plans
              </h2>
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
                Break large expenses into manageable payments
              </p>
            </div>
            <Button
              onClick={() => {
                setShowInstallmentForm(!showInstallmentForm);
                if (!showInstallmentForm)
                  setInstallmentForm({ ...INITIAL_INSTALLMENT });
              }}
              icon={
                showInstallmentForm ? (
                  <X className="w-4 h-4" />
                ) : (
                  <Plus className="w-4 h-4" />
                )
              }
              variant={showInstallmentForm ? "secondary" : "primary"}
            >
              {showInstallmentForm ? "Cancel" : "New Plan"}
            </Button>
          </div>

          {showInstallmentForm && (
            <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
              <h3 className="font-semibold text-gray-900 dark:text-white mb-5 flex items-center gap-2">
                <CreditCard className="w-5 h-5 text-blue-500" />
                New Installment Plan
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <Input
                  label="Plan Name"
                  value={installmentForm.name}
                  onChange={(e) => updateI({ name: e.target.value })}
                  placeholder="e.g., Laptop Purchase, Phone Installment"
                />
                <Select
                  label="Account"
                  value={String(installmentForm.account_id)}
                  onChange={(e) =>
                    updateI({ account_id: Number(e.target.value) })
                  }
                  options={accountOptions}
                />
                <Select
                  label="Category"
                  value={String(installmentForm.category_id)}
                  onChange={(e) =>
                    updateI({ category_id: Number(e.target.value) })
                  }
                  options={getCategoryOptions("EXPENSE")}
                />
                <Input
                  label="Total Amount (LKR)"
                  type="number"
                  min="0"
                  step="0.01"
                  value={installmentForm.total_amount || ""}
                  onChange={(e) =>
                    updateI({ total_amount: Number(e.target.value) })
                  }
                  placeholder="0.00"
                />
                <Input
                  label="Number of Installments"
                  type="number"
                  min="1"
                  value={installmentForm.num_installments}
                  onChange={(e) =>
                    updateI({ num_installments: Number(e.target.value) })
                  }
                />
                <Select
                  label="Frequency"
                  value={installmentForm.frequency}
                  onChange={(e) => updateI({ frequency: e.target.value })}
                  options={installmentFreqOptions}
                />
                <Input
                  label="Start Date"
                  type="date"
                  value={installmentForm.start_date}
                  onChange={(e) => updateI({ start_date: e.target.value })}
                />
                <Input
                  label="Memo (Optional)"
                  value={installmentForm.memo || ""}
                  onChange={(e) => updateI({ memo: e.target.value || null })}
                  placeholder="e.g., 0% interest plan from Samsung"
                />
              </div>

              {/* Payment Preview */}
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-200 dark:border-blue-800/40">
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-700 dark:text-gray-300">
                    Payment per installment:
                  </span>
                  <span className="text-lg font-bold text-blue-600 dark:text-blue-400">
                    LKR{" "}
                    {Number(monthlyPaymentPreview).toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </span>
                </div>
              </div>

              <div className="flex justify-end mt-5">
                <Button
                  onClick={handleCreateInstallment}
                  disabled={installmentSubmitting}
                  icon={<Plus className="w-4 h-4" />}
                >
                  {installmentSubmitting
                    ? "Creating..."
                    : "Create Installment Plan"}
                </Button>
              </div>
            </div>
          )}

          <InstallmentPlanList refreshKey={installmentRefreshKey} />
        </div>
      )}
    </div>
  );
}
