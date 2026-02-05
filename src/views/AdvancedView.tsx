// File: src/views/AdvancedView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import TemplateLibrary from "../components/TemplateLibrary";
import RecurringTransactionList from "../components/RecurringTransactionList";
import InstallmentPlanList from "../components/InstallmentPlanList";
import Button from "../components/Button";
import Input from "../components/Input";
import Select from "../components/Select";
import type { CreateRecurringTransactionInput } from "../types/recurring";
import type { CreateInstallmentPlan } from "../types/installment";

type Tab = "templates" | "recurring" | "installments";

interface TransactionTemplate {
  transaction_type: "INCOME" | "EXPENSE" | "TRANSFER";
  account_id?: number;
  category_id?: number;
  from_account_id?: number;
  to_account_id?: number;
  amount: number;
  memo: string;
}

interface AdvancedViewProps {
  onUseTemplate?: (template: TransactionTemplate) => void;
}

export default function AdvancedView({ onUseTemplate }: AdvancedViewProps) {
  const [activeTab, setActiveTab] = useState<Tab>("templates");
  const [accounts, setAccounts] = useState<any[]>([]);
  const [categories, setCategories] = useState<any[]>([]);
  const [showRecurringForm, setShowRecurringForm] = useState(false);
  const [showInstallmentForm, setShowInstallmentForm] = useState(false);
  const [installmentRefreshKey, setInstallmentRefreshKey] = useState(0);

  const [recurringForm, setRecurringForm] =
    useState<CreateRecurringTransactionInput>({
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
    });

  const [installmentForm, setInstallmentForm] = useState<CreateInstallmentPlan>(
    {
      name: "",
      total_amount: 0,
      num_installments: 12,
      account_id: 0,
      category_id: 0,
      start_date: new Date().toISOString().split("T")[0],
      frequency: "MONTHLY",
      memo: null,
    },
  );

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [accountsData, categoriesData] = await Promise.all([
        invoke<any[]>("get_accounts"),
        invoke<any[]>("get_categories"),
      ]);
      setAccounts(accountsData);
      setCategories(categoriesData);
    } catch (error) {
      console.error("Failed to load data:", error);
    }
  };

  const handleUseTemplate = (template: TransactionTemplate) => {
    // Store template data and trigger navigation
    sessionStorage.setItem("templateData", JSON.stringify(template));
    window.dispatchEvent(new CustomEvent("navigate-to-transactions"));

    // Call the optional callback if provided
    if (onUseTemplate) {
      onUseTemplate(template);
    }
  };

  const handleCreateRecurring = async () => {
    if (
      !recurringForm.name ||
      recurringForm.amount <= 0 ||
      recurringForm.account_id === 0
    ) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      await invoke("create_recurring_transaction", { input: recurringForm });
      setShowRecurringForm(false);
      setRecurringForm({
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
      });
      alert("Recurring transaction created!");
    } catch (error) {
      console.error("Failed to create recurring transaction:", error);
      alert("Error: " + error);
    }
  };

  const handleCreateInstallment = async () => {
    if (
      !installmentForm.name ||
      installmentForm.total_amount <= 0 ||
      installmentForm.account_id === 0 ||
      installmentForm.category_id === 0
    ) {
      alert("Please fill in all required fields");
      return;
    }

    try {
      await invoke("create_installment_plan", { plan: installmentForm });
      setShowInstallmentForm(false);
      setInstallmentForm({
        name: "",
        total_amount: 0,
        num_installments: 12,
        account_id: 0,
        category_id: 0,
        start_date: new Date().toISOString().split("T")[0],
        frequency: "MONTHLY",
        memo: null,
      });
      // Trigger refresh of installment list
      setInstallmentRefreshKey((prev) => prev + 1);
      alert("Installment plan created!");
    } catch (error) {
      console.error("Failed to create installment plan:", error);
      alert("Error: " + error);
    }
  };

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

  const accountOptions = [
    { value: 0, label: "Select Account" },
    ...accounts.map((acc) => ({ value: acc.id, label: acc.name })),
  ];

  const getCategoryOptions = (type: "INCOME" | "EXPENSE" | "TRANSFER") => [
    { value: 0, label: "Select Category" },
    ...categories
      .filter((cat) => cat.category_type === type)
      .map((cat) => ({ value: cat.id, label: cat.name })),
  ];

  const expenseCategoryOptions = [
    { value: 0, label: "Select Category" },
    ...categories
      .filter((cat) => cat.category_type === "EXPENSE")
      .map((cat) => ({ value: cat.id, label: cat.name })),
  ];

  return (
    <div className="p-8">
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Advanced Features
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Transaction templates, recurring transactions, and installment plans
        </p>
      </div>

      {/* Tab Navigation */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        <button
          onClick={() => setActiveTab("templates")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "templates"
              ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          Templates
        </button>
        <button
          onClick={() => setActiveTab("recurring")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "recurring"
              ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          Recurring
        </button>
        <button
          onClick={() => setActiveTab("installments")}
          className={`px-4 py-2 font-medium transition-colors ${
            activeTab === "installments"
              ? "text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400"
              : "text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
          }`}
        >
          Installments
        </button>
      </div>

      {/* Tab Content */}
      {activeTab === "templates" && (
        <TemplateLibrary
          accounts={accounts}
          categories={categories}
          onUseTemplate={handleUseTemplate}
        />
      )}

      {activeTab === "recurring" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Recurring Transactions
            </h2>
            <Button onClick={() => setShowRecurringForm(!showRecurringForm)}>
              {showRecurringForm ? "Cancel" : "New Recurring Transaction"}
            </Button>
          </div>

          {showRecurringForm && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-white mb-4">
                Create Recurring Transaction
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Name"
                  value={recurringForm.name}
                  onChange={(e) =>
                    setRecurringForm({ ...recurringForm, name: e.target.value })
                  }
                  placeholder="e.g., Monthly Rent"
                />
                <Select
                  label="Type"
                  value={recurringForm.transaction_type}
                  onChange={(e) =>
                    setRecurringForm({
                      ...recurringForm,
                      transaction_type: e.target.value as any,
                    })
                  }
                  options={transactionTypeOptions}
                />
                <Select
                  label="Frequency"
                  value={recurringForm.frequency}
                  onChange={(e) =>
                    setRecurringForm({
                      ...recurringForm,
                      frequency: e.target.value as any,
                    })
                  }
                  options={frequencyOptions}
                />
                {recurringForm.transaction_type !== "TRANSFER" && (
                  <>
                    <Select
                      label="Account"
                      value={recurringForm.account_id}
                      onChange={(e) =>
                        setRecurringForm({
                          ...recurringForm,
                          account_id: Number(e.target.value),
                        })
                      }
                      options={accountOptions}
                    />
                    <Select
                      label="Category"
                      value={recurringForm.category_id || 0}
                      onChange={(e) =>
                        setRecurringForm({
                          ...recurringForm,
                          category_id: Number(e.target.value) || null,
                        })
                      }
                      options={getCategoryOptions(
                        recurringForm.transaction_type,
                      )}
                    />
                  </>
                )}
                <Input
                  label="Amount"
                  type="number"
                  value={recurringForm.amount}
                  onChange={(e) =>
                    setRecurringForm({
                      ...recurringForm,
                      amount: Number(e.target.value),
                    })
                  }
                />
                <Input
                  label="Start Date"
                  type="date"
                  value={recurringForm.start_date}
                  onChange={(e) =>
                    setRecurringForm({
                      ...recurringForm,
                      start_date: e.target.value,
                    })
                  }
                />
                <div className="col-span-2">
                  <Input
                    label="Description (Optional)"
                    value={recurringForm.description || ""}
                    onChange={(e) =>
                      setRecurringForm({
                        ...recurringForm,
                        description: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
              <Button onClick={handleCreateRecurring} className="mt-4">
                Create Recurring Transaction
              </Button>
            </div>
          )}

          <RecurringTransactionList />
        </div>
      )}

      {activeTab === "installments" && (
        <div className="space-y-6">
          <div className="flex justify-between items-center">
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Installment Plans
            </h2>
            <Button
              onClick={() => setShowInstallmentForm(!showInstallmentForm)}
            >
              {showInstallmentForm ? "Cancel" : "New Installment Plan"}
            </Button>
          </div>

          {showInstallmentForm && (
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 border border-gray-200 dark:border-gray-700">
              <h3 className="font-medium text-gray-900 dark:text-white mb-4">
                Create Installment Plan
              </h3>
              <div className="grid grid-cols-2 gap-4">
                <Input
                  label="Plan Name"
                  value={installmentForm.name}
                  onChange={(e) =>
                    setInstallmentForm({
                      ...installmentForm,
                      name: e.target.value,
                    })
                  }
                  placeholder="e.g., Laptop Purchase"
                />
                <Select
                  label="Account"
                  value={installmentForm.account_id}
                  onChange={(e) =>
                    setInstallmentForm({
                      ...installmentForm,
                      account_id: Number(e.target.value),
                    })
                  }
                  options={accountOptions}
                />
                <Select
                  label="Category"
                  value={installmentForm.category_id}
                  onChange={(e) =>
                    setInstallmentForm({
                      ...installmentForm,
                      category_id: Number(e.target.value),
                    })
                  }
                  options={expenseCategoryOptions}
                />
                <Input
                  label="Total Amount"
                  type="number"
                  value={installmentForm.total_amount}
                  onChange={(e) =>
                    setInstallmentForm({
                      ...installmentForm,
                      total_amount: Number(e.target.value),
                    })
                  }
                />
                <Input
                  label="Number of Installments"
                  type="number"
                  value={installmentForm.num_installments}
                  onChange={(e) =>
                    setInstallmentForm({
                      ...installmentForm,
                      num_installments: Number(e.target.value),
                    })
                  }
                />
                <Input
                  label="Start Date"
                  type="date"
                  value={installmentForm.start_date}
                  onChange={(e) =>
                    setInstallmentForm({
                      ...installmentForm,
                      start_date: e.target.value,
                    })
                  }
                />
                <div className="col-span-2">
                  <Input
                    label="Memo (Optional)"
                    value={installmentForm.memo || ""}
                    onChange={(e) =>
                      setInstallmentForm({
                        ...installmentForm,
                        memo: e.target.value || null,
                      })
                    }
                  />
                </div>
              </div>
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 rounded">
                <p className="text-sm text-gray-700 dark:text-gray-300">
                  Monthly Payment:{" "}
                  <span className="font-bold">
                    LKR{" "}
                    {installmentForm.num_installments > 0
                      ? (
                          installmentForm.total_amount /
                          installmentForm.num_installments
                        ).toFixed(2)
                      : 0}
                  </span>
                </p>
              </div>
              <Button onClick={handleCreateInstallment} className="mt-4">
                Create Installment Plan
              </Button>
            </div>
          )}

          <InstallmentPlanList key={installmentRefreshKey} />
        </div>
      )}
    </div>
  );
}
