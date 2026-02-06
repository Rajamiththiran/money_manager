// File: src/components/TemplateLibrary.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Plus,
  Zap,
  Trash2,
  BookmarkPlus,
  Coffee,
  Repeat,
  ArrowRightLeft,
  TrendingUp,
  TrendingDown,
} from "lucide-react";
import Button from "./Button";
import Input from "./Input";
import Select from "./Select";
import { useToast } from "./Toast";
import type {
  TransactionTemplateWithDetails,
  CreateTemplateInput,
} from "../types/template";
import type { Account } from "../types/account";
import type { Category } from "../types/category";

interface TemplateLibraryProps {
  accounts: Account[];
  categories: Category[];
  onUseTemplate: (template: TransactionTemplateWithDetails) => void;
}

const TYPE_CONFIG = {
  INCOME: {
    label: "Income",
    icon: TrendingUp,
    badgeBg:
      "bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-300",
    accentBorder: "border-l-emerald-500",
  },
  EXPENSE: {
    label: "Expense",
    icon: TrendingDown,
    badgeBg: "bg-red-100 text-red-800 dark:bg-red-900/40 dark:text-red-300",
    accentBorder: "border-l-red-500",
  },
  TRANSFER: {
    label: "Transfer",
    icon: ArrowRightLeft,
    badgeBg: "bg-blue-100 text-blue-800 dark:bg-blue-900/40 dark:text-blue-300",
    accentBorder: "border-l-blue-500",
  },
} as const;

const EMPTY_FORM: CreateTemplateInput = {
  name: "",
  transaction_type: "EXPENSE",
  amount: 0,
  account_id: null,
  to_account_id: null,
  category_id: null,
  memo: null,
};

export default function TemplateLibrary({
  accounts,
  categories,
  onUseTemplate,
}: TemplateLibraryProps) {
  const { success, error: showError } = useToast();
  const [templates, setTemplates] = useState<TransactionTemplateWithDetails[]>(
    [],
  );
  const [loading, setLoading] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [form, setForm] = useState<CreateTemplateInput>({ ...EMPTY_FORM });
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    loadTemplates();
  }, []);

  const loadTemplates = async () => {
    try {
      const data =
        await invoke<TransactionTemplateWithDetails[]>("get_templates");
      setTemplates(data);
    } catch (err) {
      console.error("Failed to load templates:", err);
      showError("Failed to load templates", String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async () => {
    if (!form.name.trim()) {
      showError("Validation Error", "Template name is required.");
      return;
    }
    if (form.amount <= 0) {
      showError("Validation Error", "Amount must be greater than zero.");
      return;
    }

    setSubmitting(true);
    try {
      await invoke("create_template", { input: form });
      success("Template Created", `"${form.name}" saved to your library.`);
      setForm({ ...EMPTY_FORM });
      setIsCreating(false);
      await loadTemplates();
    } catch (err) {
      showError("Failed to create template", String(err));
    } finally {
      setSubmitting(false);
    }
  };

  const handleUse = async (template: TransactionTemplateWithDetails) => {
    try {
      await invoke("use_template", { templateId: template.id });
      onUseTemplate(template);
      success(
        "Template Applied",
        `"${template.name}" loaded into transaction form.`,
      );
      await loadTemplates(); // Refresh to update use_count
    } catch (err) {
      showError("Failed to use template", String(err));
    }
  };

  const handleDelete = async (id: number, name: string) => {
    if (!confirm(`Delete template "${name}"?`)) return;

    try {
      await invoke("delete_template", { templateId: id });
      success("Template Deleted", `"${name}" has been removed.`);
      await loadTemplates();
    } catch (err) {
      showError("Failed to delete template", String(err));
    }
  };

  const updateForm = (partial: Partial<CreateTemplateInput>) => {
    setForm((prev) => ({ ...prev, ...partial }));
  };

  const accountOptions = [
    { value: "", label: "Select Account" },
    ...accounts.map((a) => ({ value: String(a.id), label: a.name })),
  ];

  const getCategoryOptions = (type: "INCOME" | "EXPENSE") => [
    { value: "", label: "Select Category" },
    ...categories
      .filter((c) => c.category_type === type)
      .map((c) => ({ value: String(c.id), label: c.name })),
  ];

  const transactionTypeOptions = [
    { value: "INCOME", label: "Income" },
    { value: "EXPENSE", label: "Expense" },
    { value: "TRANSFER", label: "Transfer" },
  ];

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-pulse text-gray-500 dark:text-gray-400">
          Loading templates...
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex justify-between items-center">
        <div>
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Transaction Templates
          </h2>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Save frequently used transactions for quick entry
          </p>
        </div>
        <Button
          onClick={() => {
            setIsCreating(!isCreating);
            if (!isCreating) setForm({ ...EMPTY_FORM });
          }}
          icon={isCreating ? undefined : <Plus className="w-4 h-4" />}
          variant={isCreating ? "secondary" : "primary"}
        >
          {isCreating ? "Cancel" : "New Template"}
        </Button>
      </div>

      {/* Create Form */}
      {isCreating && (
        <div className="bg-white dark:bg-gray-800 rounded-xl p-6 border border-gray-200 dark:border-gray-700 shadow-sm">
          <div className="flex items-center gap-2 mb-5">
            <BookmarkPlus className="w-5 h-5 text-blue-500" />
            <h3 className="font-semibold text-gray-900 dark:text-white">
              Create Template
            </h3>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Input
              label="Template Name"
              value={form.name}
              onChange={(e) => updateForm({ name: e.target.value })}
              placeholder="e.g., Daily Coffee, Monthly Rent"
            />
            <Select
              label="Transaction Type"
              value={form.transaction_type}
              onChange={(e) => {
                const type = e.target.value as
                  | "INCOME"
                  | "EXPENSE"
                  | "TRANSFER";
                updateForm({
                  transaction_type: type,
                  category_id: null,
                  to_account_id: null,
                });
              }}
              options={transactionTypeOptions}
            />

            {form.transaction_type !== "TRANSFER" ? (
              <>
                <Select
                  label="Account"
                  value={form.account_id ? String(form.account_id) : ""}
                  onChange={(e) =>
                    updateForm({
                      account_id: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  options={accountOptions}
                />
                <Select
                  label="Category"
                  value={form.category_id ? String(form.category_id) : ""}
                  onChange={(e) =>
                    updateForm({
                      category_id: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  options={getCategoryOptions(
                    form.transaction_type as "INCOME" | "EXPENSE",
                  )}
                />
              </>
            ) : (
              <>
                <Select
                  label="From Account"
                  value={form.account_id ? String(form.account_id) : ""}
                  onChange={(e) =>
                    updateForm({
                      account_id: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  options={accountOptions}
                />
                <Select
                  label="To Account"
                  value={form.to_account_id ? String(form.to_account_id) : ""}
                  onChange={(e) =>
                    updateForm({
                      to_account_id: e.target.value
                        ? Number(e.target.value)
                        : null,
                    })
                  }
                  options={accountOptions.filter(
                    (a) =>
                      a.value === "" ||
                      a.value !== String(form.account_id ?? ""),
                  )}
                />
              </>
            )}

            <Input
              label="Amount (LKR)"
              type="number"
              min="0"
              step="0.01"
              value={form.amount || ""}
              onChange={(e) => updateForm({ amount: Number(e.target.value) })}
              placeholder="0.00"
            />
            <Input
              label="Memo (Optional)"
              value={form.memo || ""}
              onChange={(e) => updateForm({ memo: e.target.value || null })}
              placeholder="e.g., Morning coffee at cafe"
            />
          </div>

          <div className="flex justify-end mt-5">
            <Button
              onClick={handleCreate}
              disabled={submitting}
              icon={<BookmarkPlus className="w-4 h-4" />}
            >
              {submitting ? "Saving..." : "Save Template"}
            </Button>
          </div>
        </div>
      )}

      {/* Template Grid */}
      {templates.length > 0 ? (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {templates.map((template) => {
            const config = TYPE_CONFIG[template.transaction_type];
            const Icon = config.icon;

            return (
              <div
                key={template.id}
                className={`
                  bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700
                  border-l-4 ${config.accentBorder}
                  hover:shadow-md transition-all duration-200 group
                `}
              >
                <div className="p-4">
                  {/* Header */}
                  <div className="flex items-start justify-between mb-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="p-1.5 rounded-lg bg-gray-100 dark:bg-gray-700/50">
                        <Icon className="w-4 h-4 text-gray-600 dark:text-gray-300" />
                      </div>
                      <div className="min-w-0">
                        <h4 className="font-semibold text-gray-900 dark:text-white truncate">
                          {template.name}
                        </h4>
                        <span
                          className={`text-xs px-1.5 py-0.5 rounded-md font-medium ${config.badgeBg}`}
                        >
                          {config.label}
                        </span>
                      </div>
                    </div>
                  </div>

                  {/* Details */}
                  <div className="text-sm text-gray-500 dark:text-gray-400 space-y-1 mb-3">
                    {template.transaction_type === "TRANSFER" ? (
                      <p className="truncate">
                        {template.account_name || "Any"} →{" "}
                        {template.to_account_name || "Any"}
                      </p>
                    ) : (
                      <>
                        <p className="truncate">
                          Account: {template.account_name || "Not set"}
                        </p>
                        <p className="truncate">
                          Category: {template.category_name || "Not set"}
                        </p>
                      </>
                    )}
                    {template.memo && (
                      <p className="truncate italic opacity-75">
                        {template.memo}
                      </p>
                    )}
                  </div>

                  {/* Amount */}
                  <div className="text-xl font-bold text-gray-900 dark:text-white mb-1">
                    LKR{" "}
                    {template.amount.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                  </div>

                  {/* Usage stats */}
                  {template.use_count > 0 && (
                    <p className="text-xs text-gray-400 dark:text-gray-500 mb-3">
                      Used {template.use_count} time
                      {template.use_count !== 1 ? "s" : ""}
                    </p>
                  )}

                  {/* Actions */}
                  <div className="flex gap-2 pt-2 border-t border-gray-100 dark:border-gray-700/50">
                    <Button
                      onClick={() => handleUse(template)}
                      size="sm"
                      fullWidth
                      icon={<Zap className="w-3.5 h-3.5" />}
                    >
                      Use Template
                    </Button>
                    <Button
                      variant="danger"
                      size="sm"
                      onClick={() => handleDelete(template.id, template.name)}
                      icon={<Trash2 className="w-3.5 h-3.5" />}
                    >
                      Delete
                    </Button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        !isCreating && (
          <div className="text-center py-16">
            <Coffee className="w-12 h-12 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
            <p className="text-lg font-medium text-gray-500 dark:text-gray-400 mb-1">
              No templates yet
            </p>
            <p className="text-sm text-gray-400 dark:text-gray-500 mb-4">
              Save your frequent transactions like daily coffee, monthly rent,
              or salary
            </p>
            <Button
              onClick={() => setIsCreating(true)}
              icon={<Plus className="w-4 h-4" />}
            >
              Create Your First Template
            </Button>
          </div>
        )
      )}
    </div>
  );
}
