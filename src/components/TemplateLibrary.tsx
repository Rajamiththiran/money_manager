// File: src/components/TemplateLibrary.tsx
import { useState } from "react";
import Button from "./Button";
import Input from "./Input";
import Select from "./Select";

interface TransactionTemplate {
  name: string;
  transaction_type: "INCOME" | "EXPENSE" | "TRANSFER";
  account_id?: number;
  category_id?: number;
  from_account_id?: number;
  to_account_id?: number;
  amount: number;
  memo: string;
}

interface TemplateLibraryProps {
  accounts: any[];
  categories: any[];
  onUseTemplate: (template: TransactionTemplate) => void;
}

export default function TemplateLibrary({
  accounts,
  categories,
  onUseTemplate,
}: TemplateLibraryProps) {
  const [templates, setTemplates] = useState<TransactionTemplate[]>([
    {
      name: "Daily Coffee",
      transaction_type: "EXPENSE",
      category_id: 1,
      account_id: 1,
      amount: 250,
      memo: "Morning coffee",
    },
    {
      name: "Lunch Break",
      transaction_type: "EXPENSE",
      category_id: 1,
      account_id: 1,
      amount: 500,
      memo: "Lunch",
    },
    {
      name: "Fuel Station",
      transaction_type: "EXPENSE",
      category_id: 2,
      account_id: 1,
      amount: 3000,
      memo: "Petrol",
    },
  ]);

  const [isCreating, setIsCreating] = useState(false);
  const [newTemplate, setNewTemplate] = useState<TransactionTemplate>({
    name: "",
    transaction_type: "EXPENSE",
    account_id: undefined,
    category_id: undefined,
    amount: 0,
    memo: "",
  });

  const handleCreateTemplate = () => {
    if (!newTemplate.name || newTemplate.amount <= 0) {
      alert("Please fill in template name and amount");
      return;
    }

    setTemplates([...templates, newTemplate]);
    setIsCreating(false);
    setNewTemplate({
      name: "",
      transaction_type: "EXPENSE",
      account_id: undefined,
      category_id: undefined,
      amount: 0,
      memo: "",
    });
  };

  const handleDeleteTemplate = (index: number) => {
    setTemplates(templates.filter((_, i) => i !== index));
  };

  const getCategoryName = (categoryId?: number) => {
    const category = categories.find((c) => c.id === categoryId);
    return category?.name || "N/A";
  };

  const getAccountName = (accountId?: number) => {
    const account = accounts.find((a) => a.id === accountId);
    return account?.name || "N/A";
  };

  const transactionTypeOptions = [
    { value: "INCOME", label: "Income" },
    { value: "EXPENSE", label: "Expense" },
    { value: "TRANSFER", label: "Transfer" },
  ];

  const accountOptions = [
    { value: "", label: "Select Account" },
    ...accounts.map((acc) => ({ value: acc.id, label: acc.name })),
  ];

  const getCategoryOptions = (type: "INCOME" | "EXPENSE" | "TRANSFER") => [
    { value: "", label: "Select Category" },
    ...categories
      .filter((cat) => cat.category_type === type)
      .map((cat) => ({ value: cat.id, label: cat.name })),
  ];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Transaction Templates
        </h3>
        <Button onClick={() => setIsCreating(!isCreating)}>
          {isCreating ? "Cancel" : "New Template"}
        </Button>
      </div>

      {isCreating && (
        <div className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
          <h4 className="font-medium text-gray-900 dark:text-white mb-3">
            Create Template
          </h4>
          <div className="space-y-3">
            <Input
              label="Template Name"
              value={newTemplate.name}
              onChange={(e) =>
                setNewTemplate({ ...newTemplate, name: e.target.value })
              }
              placeholder="e.g., Daily Coffee"
            />
            <Select
              label="Type"
              value={newTemplate.transaction_type}
              onChange={(e) =>
                setNewTemplate({
                  ...newTemplate,
                  transaction_type: e.target.value as
                    | "INCOME"
                    | "EXPENSE"
                    | "TRANSFER",
                })
              }
              options={transactionTypeOptions}
            />
            {newTemplate.transaction_type !== "TRANSFER" && (
              <>
                <Select
                  label="Account"
                  value={newTemplate.account_id || ""}
                  onChange={(e) =>
                    setNewTemplate({
                      ...newTemplate,
                      account_id: Number(e.target.value),
                    })
                  }
                  options={accountOptions}
                />
                <Select
                  label="Category"
                  value={newTemplate.category_id || ""}
                  onChange={(e) =>
                    setNewTemplate({
                      ...newTemplate,
                      category_id: Number(e.target.value),
                    })
                  }
                  options={getCategoryOptions(newTemplate.transaction_type)}
                />
              </>
            )}
            <Input
              label="Amount"
              type="number"
              value={newTemplate.amount}
              onChange={(e) =>
                setNewTemplate({
                  ...newTemplate,
                  amount: Number(e.target.value),
                })
              }
            />
            <Input
              label="Memo"
              value={newTemplate.memo}
              onChange={(e) =>
                setNewTemplate({ ...newTemplate, memo: e.target.value })
              }
            />
            <Button onClick={handleCreateTemplate} fullWidth>
              Save Template
            </Button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {templates.map((template, index) => (
          <div
            key={index}
            className="bg-white dark:bg-gray-800 rounded-lg p-4 border border-gray-200 dark:border-gray-700 hover:shadow-md transition-shadow"
          >
            <div className="flex justify-between items-start mb-2">
              <h4 className="font-semibold text-gray-900 dark:text-white">
                {template.name}
              </h4>
              <span
                className={`text-xs px-2 py-1 rounded ${
                  template.transaction_type === "INCOME"
                    ? "bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"
                    : template.transaction_type === "EXPENSE"
                      ? "bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"
                      : "bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"
                }`}
              >
                {template.transaction_type}
              </span>
            </div>
            <div className="text-sm text-gray-600 dark:text-gray-400 space-y-1 mb-3">
              <p>Account: {getAccountName(template.account_id)}</p>
              <p>Category: {getCategoryName(template.category_id)}</p>
              <p>Memo: {template.memo}</p>
            </div>
            <div className="text-xl font-bold text-gray-900 dark:text-white mb-3">
              LKR {template.amount.toLocaleString()}
            </div>
            <div className="flex gap-2">
              <Button
                onClick={() => onUseTemplate(template)}
                fullWidth
                size="sm"
              >
                Use Template
              </Button>
              <Button
                variant="danger"
                size="sm"
                onClick={() => handleDeleteTemplate(index)}
              >
                Delete
              </Button>
            </div>
          </div>
        ))}
      </div>

      {templates.length === 0 && !isCreating && (
        <div className="text-center py-12 text-gray-500 dark:text-gray-400">
          <p className="text-lg mb-2">No templates yet</p>
          <p className="text-sm">
            Create templates for frequently used transactions
          </p>
        </div>
      )}
    </div>
  );
}
