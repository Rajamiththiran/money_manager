// File: src/components/TransactionForm.tsx
import { useState, useEffect } from "react";
import Input from "./Input";
import Select from "./Select";
import CascadingCategorySelect from "./CascadingCategorySelect";
import QuickCategoryModal from "./QuickCategoryModal";
import Button from "./Button";
import Calculator from "./Calculator";
import { PhotoPicker } from "./PhotoAttachment";
import TagPicker from "./TagPicker";
import { invoke } from "@tauri-apps/api/core";
import type { CreateTransactionInput } from "../types/transaction";
import type { AccountWithBalance } from "../types/account";
import type { CategoryWithChildren } from "../types/category";
import type { Tag } from "../types/tag";

interface GoalAllocationSummary {
  goal_id: number;
  goal_name: string;
  allocated_amount: number;
  color: string;
  target_amount: number;
}

interface AccountGoalSummary {
  account_id: number;
  total_balance: number;
  allocated_balance: number;
  unallocated_balance: number;
  goals: GoalAllocationSummary[];
}

interface TransactionFormProps {
  accounts: AccountWithBalance[];
  categories: CategoryWithChildren[];
  onSubmit: (
    input: CreateTransactionInput,
    pendingPhotoPaths?: string[],
  ) => Promise<void>;
  onCancel: () => void;
  onCategoryCreated?: () => Promise<void>;
  prefillData?: {
    transaction_type?: "INCOME" | "EXPENSE" | "TRANSFER";
    account_id?: number;
    category_id?: number;
    from_account_id?: number;
    to_account_id?: number;
    amount?: number;
    memo?: string;
  } | null;
}

type TransactionType = "INCOME" | "EXPENSE" | "TRANSFER";

export default function TransactionForm({
  accounts,
  categories,
  onSubmit,
  onCancel,
  onCategoryCreated,
  prefillData,
}: TransactionFormProps) {
  const [type, setType] = useState<TransactionType>("EXPENSE");
  const [formData, setFormData] = useState({
    date: new Date().toISOString().split("T")[0],
    amount: "",
    account_id: accounts[0]?.id || 0,
    to_account_id: accounts[1]?.id || 0,
    category_id: 0,
    memo: "",
  });
  const [pendingPhotoPaths, setPendingPhotoPaths] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showCalculator, setShowCalculator] = useState(false);
  const [showQuickCategory, setShowQuickCategory] = useState(false);
  const [allTags, setAllTags] = useState<Tag[]>([]);
  const [selectedTagIds, setSelectedTagIds] = useState<number[]>([]);

  // Virtual Envelope state
  const [accountGoalSummary, setAccountGoalSummary] = useState<AccountGoalSummary | null>(null);
  const [showGoalAllocation, setShowGoalAllocation] = useState(false);
  const [goalAllocations, setGoalAllocations] = useState<Record<number, string>>({});
  const [goalWithdrawals, setGoalWithdrawals] = useState<Record<number, string>>({});
  const [showExpenseGoalReduction, setShowExpenseGoalReduction] = useState(false);

  // Load tags on mount
  useEffect(() => {
    invoke<Tag[]>("get_tags").then(setAllTags).catch(console.error);
  }, []);

  // React to prefillData changes (template usage or initial load)
  useEffect(() => {
    if (prefillData) {
      if (prefillData.transaction_type) {
        setType(prefillData.transaction_type);
      }
      setFormData((prev) => ({
        ...prev,
        date: new Date().toISOString().split("T")[0],
        amount: prefillData.amount?.toString() || "",
        account_id:
          prefillData.account_id ||
          prefillData.from_account_id ||
          accounts[0]?.id ||
          0,
        to_account_id: prefillData.to_account_id || accounts[1]?.id || 0,
        category_id: prefillData.category_id || 0,
        memo: prefillData.memo || "",
      }));
    } else {
      // Only set these if they aren't set yet (initial load)
      setFormData((prev) => {
        if (prev.account_id !== 0) return prev; // Already initialized
        return {
          ...prev,
          account_id: accounts[0]?.id || 0,
          to_account_id: accounts[1]?.id || 0,
        };
      });
    }
  }, [prefillData]); // Only re-run when prefillData changes

  // Fetch goal summary when account or type changes
  useEffect(() => {
    const fetchGoalSummary = async () => {
      if (!formData.account_id || type === "TRANSFER") {
        setAccountGoalSummary(null);
        return;
      }
      try {
        const summary = await invoke<AccountGoalSummary>("get_account_goal_summary", {
          accountId: formData.account_id,
        });
        if (summary.goals.length > 0) {
          setAccountGoalSummary(summary);
        } else {
          setAccountGoalSummary(null);
        }
      } catch {
        setAccountGoalSummary(null);
      }
    };
    fetchGoalSummary();
    // Reset allocations/withdrawals when account changes
    setGoalAllocations({});
    setGoalWithdrawals({});
    setShowGoalAllocation(false);
    setShowExpenseGoalReduction(false);
  }, [formData.account_id, type]);

  // Check if expense exceeds unallocated balance
  const parsedAmount = parseFloat(formData.amount) || 0;
  const expenseExceedsUnallocated =
    type === "EXPENSE" &&
    accountGoalSummary &&
    parsedAmount > 0 &&
    parsedAmount > accountGoalSummary.unallocated_balance;

  const deficit = expenseExceedsUnallocated
    ? parsedAmount - accountGoalSummary!.unallocated_balance
    : 0;

  // Calculate total withdrawals
  const totalWithdrawals = Object.values(goalWithdrawals).reduce(
    (sum, val) => sum + (parseFloat(val) || 0),
    0,
  );
  const deficitCovered = totalWithdrawals >= deficit;

  // Calculate total allocations
  const totalAllocations = Object.values(goalAllocations).reduce(
    (sum, val) => sum + (parseFloat(val) || 0),
    0,
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);

    try {
      const amount = parseFloat(formData.amount);
      if (isNaN(amount) || amount <= 0) {
        throw new Error("Please enter a valid amount greater than 0");
      }

      // Check mandatory goal reduction for expense
      if (expenseExceedsUnallocated && !deficitCovered) {
        throw new Error(
          `This expense exceeds your unallocated balance. You must reduce goals by Rs ${deficit.toFixed(2)} to proceed.`,
        );
      }

      const input: CreateTransactionInput = {
        date: formData.date,
        transaction_type: type,
        amount,
        account_id: formData.account_id,
        to_account_id: type === "TRANSFER" ? formData.to_account_id : null,
        category_id:
          type !== "TRANSFER" && formData.category_id
            ? formData.category_id
            : null,
        memo: formData.memo || null,
        tag_ids: selectedTagIds.length > 0 ? selectedTagIds : undefined,
      };

      // Add goal allocations for INCOME
      if (type === "INCOME" && totalAllocations > 0) {
        const allocations = Object.entries(goalAllocations)
          .filter(([, val]) => parseFloat(val) > 0)
          .map(([goalId, val]) => ({
            goal_id: parseInt(goalId),
            amount: parseFloat(val),
          }));
        if (allocations.length > 0) {
          input.goal_allocations = allocations;
        }
      }

      // Add goal withdrawals for EXPENSE
      if (type === "EXPENSE" && totalWithdrawals > 0) {
        const withdrawals = Object.entries(goalWithdrawals)
          .filter(([, val]) => parseFloat(val) > 0)
          .map(([goalId, val]) => ({
            goal_id: parseInt(goalId),
            amount: parseFloat(val),
          }));
        if (withdrawals.length > 0) {
          input.goal_withdrawals = withdrawals;
        }
      }

      // Validation
      if (type === "TRANSFER" && input.account_id === input.to_account_id) {
        throw new Error("Cannot transfer to the same account");
      }

      if (type !== "TRANSFER" && !input.category_id) {
        throw new Error("Please select a category");
      }

      if (input.goal_allocations) {
        const totalAlloc = input.goal_allocations.reduce((s, a) => s + a.amount, 0);
        if (totalAlloc > amount) {
          throw new Error("Total goal allocations exceed the transaction amount");
        }
      }

      await onSubmit(input, pendingPhotoPaths.length > 0 ? pendingPhotoPaths : undefined);

      // Reset form
      setFormData({
        date: new Date().toISOString().split("T")[0],
        amount: "",
        account_id: accounts[0]?.id || 0,
        to_account_id: accounts[1]?.id || 0,
        category_id: 0,
        memo: "",
      });
      setPendingPhotoPaths([]);
      setSelectedTagIds([]);
      setGoalAllocations({});
      setGoalWithdrawals({});
      setShowGoalAllocation(false);
      setShowExpenseGoalReduction(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleAmountChange = (value: string) => {
    setFormData({ ...formData, amount: value });
  };

  // Filter categories by type
  const filteredCategories =
    type !== "TRANSFER"
      ? categories.filter((cat) => cat.category_type === type)
      : [];

  const accountOptions = accounts.map((acc) => ({
    value: acc.id.toString(),
    label: `${acc.name} (${acc.current_balance.toFixed(2)} ${acc.currency})`,
  }));

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
      <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-6">
        {prefillData ? "New Transaction from Template" : "New Transaction"}
      </h2>

      {/* Transaction Type Tabs */}
      <div className="flex gap-2 mb-6">
        <button
          type="button"
          onClick={() => setType("INCOME")}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            type === "INCOME"
              ? "bg-green-500 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          Income
        </button>
        <button
          type="button"
          onClick={() => setType("EXPENSE")}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            type === "EXPENSE"
              ? "bg-red-500 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          Expense
        </button>
        <button
          type="button"
          onClick={() => setType("TRANSFER")}
          className={`flex-1 py-3 px-4 rounded-lg font-medium transition-colors ${
            type === "TRANSFER"
              ? "bg-blue-500 text-white"
              : "bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600"
          }`}
        >
          Transfer
        </button>
      </div>

      <form onSubmit={handleSubmit} className="space-y-4">
        {error && (
          <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800">
            <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Date */}
          <Input
            label="Date"
            type="date"
            value={formData.date}
            onChange={(e) => setFormData({ ...formData, date: e.target.value })}
            required
          />

          {/* Amount with Calculator */}
          <div className="relative">
            <Input
              label="Amount"
              type="text"
              value={formData.amount}
              onChange={(e) => handleAmountChange(e.target.value)}
              placeholder="Enter amount or calculation (e.g., 50+20+10)"
              required
            />
            <button
              type="button"
              onClick={() => setShowCalculator(!showCalculator)}
              className="absolute right-3 top-9 text-sm text-blue-600 dark:text-blue-400 hover:underline"
            >
              {showCalculator ? "Hide" : "Calculator"}
            </button>
            {showCalculator && (
              <Calculator
                value={formData.amount}
                onChange={handleAmountChange}
              />
            )}
          </div>

          {/* Account Selection */}
          {type === "TRANSFER" ? (
            <>
              <Select
                label="From Account"
                value={formData.account_id.toString()}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    account_id: parseInt(e.target.value),
                  })
                }
                options={accountOptions}
                required
              />
              <Select
                label="To Account"
                value={formData.to_account_id.toString()}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    to_account_id: parseInt(e.target.value),
                  })
                }
                options={accountOptions}
                required
              />
            </>
          ) : (
            <>
              <Select
                label="Account"
                value={formData.account_id.toString()}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    account_id: parseInt(e.target.value),
                  })
                }
                options={accountOptions}
                required
              />
              <div className="min-w-0">
                <CascadingCategorySelect
                  label="Category"
                  categories={filteredCategories}
                  selectedId={formData.category_id}
                  onChange={(categoryId) =>
                    setFormData({ ...formData, category_id: categoryId })
                  }
                  required
                  showAddButton={true}
                  onAddCategory={() => setShowQuickCategory(true)}
                />
              </div>
            </>
          )}
        </div>

        {/* ─── INCOME: Goal Allocation Section ─── */}
        {type === "INCOME" && accountGoalSummary && accountGoalSummary.goals.length > 0 && (
          <div className="border border-accent-200 dark:border-accent-800 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setShowGoalAllocation(!showGoalAllocation)}
              className="w-full flex items-center justify-between px-4 py-3 bg-accent-50 dark:bg-accent-900/20 hover:bg-accent-100 dark:hover:bg-accent-900/30 transition-colors"
            >
              <div className="flex items-center gap-2">
                <svg className="h-4 w-4 text-accent-600 dark:text-accent-400" viewBox="0 0 20 20" fill="currentColor">
                  <path d="M2.5 4A1.5 1.5 0 001 5.5V6h18v-.5A1.5 1.5 0 0017.5 4h-15zM19 8H1v6.5A1.5 1.5 0 002.5 16h15a1.5 1.5 0 001.5-1.5V8z" />
                </svg>
                <span className="text-sm font-medium text-accent-700 dark:text-accent-300">
                  Contribute to Goals?
                </span>
              </div>
              <div className="flex items-center gap-2">
                {totalAllocations > 0 && (
                  <span className="text-xs font-medium text-accent-600 dark:text-accent-400 bg-accent-100 dark:bg-accent-900/40 px-2 py-0.5 rounded-full">
                    Rs {totalAllocations.toFixed(2)} allocated
                  </span>
                )}
                <svg
                  className={`h-4 w-4 text-accent-500 transition-transform ${showGoalAllocation ? "rotate-180" : ""}`}
                  viewBox="0 0 20 20"
                  fill="currentColor"
                >
                  <path fillRule="evenodd" d="M5.23 7.21a.75.75 0 011.06.02L10 11.168l3.71-3.938a.75.75 0 111.08 1.04l-4.25 4.5a.75.75 0 01-1.08 0l-4.25-4.5a.75.75 0 01.02-1.06z" clipRule="evenodd" />
                </svg>
              </div>
            </button>

            {showGoalAllocation && (
              <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Allocate portions of this income to your savings goals.
                  {parsedAmount > 0 && (
                    <span className="ml-1 font-medium">
                      Remaining: Rs {Math.max(parsedAmount - totalAllocations, 0).toFixed(2)}
                    </span>
                  )}
                </p>
                {accountGoalSummary.goals.map((goal) => (
                  <div key={goal.goal_id} className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: goal.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {goal.goal_name}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Allocated: Rs {goal.allocated_amount.toFixed(2)} / Rs {goal.target_amount.toFixed(2)}
                      </p>
                    </div>
                    <input
                      type="number"
                      value={goalAllocations[goal.goal_id] || ""}
                      onChange={(e) =>
                        setGoalAllocations({
                          ...goalAllocations,
                          [goal.goal_id]: e.target.value,
                        })
                      }
                      placeholder="0.00"
                      min="0"
                      step="0.01"
                      className="w-28 px-2 py-1.5 text-sm border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent text-right"
                    />
                  </div>
                ))}
                {totalAllocations > parsedAmount && parsedAmount > 0 && (
                  <p className="text-xs text-red-500 font-medium">
                    ⚠ Total allocations exceed the transaction amount
                  </p>
                )}
              </div>
            )}
          </div>
        )}

        {/* ─── EXPENSE: Mandatory Goal Reduction Warning ─── */}
        {expenseExceedsUnallocated && (
          <div className="border border-amber-300 dark:border-amber-700 rounded-lg overflow-hidden">
            <div className="px-4 py-3 bg-amber-50 dark:bg-amber-900/20">
              <div className="flex items-start gap-2">
                <svg className="h-5 w-5 text-amber-500 flex-shrink-0 mt-0.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M8.485 2.495c.673-1.167 2.357-1.167 3.03 0l6.28 10.875c.673 1.167-.17 2.625-1.516 2.625H3.72c-1.347 0-2.189-1.458-1.515-2.625L8.485 2.495zM10 6a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0v-3.5A.75.75 0 0110 6zm0 9a1 1 0 100-2 1 1 0 000 2z" clipRule="evenodd" />
                </svg>
                <div>
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    This expense exceeds your unallocated balance
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400 mt-1">
                    Unallocated: Rs {accountGoalSummary!.unallocated_balance.toFixed(2)} •
                    Deficit: Rs {deficit.toFixed(2)}
                  </p>
                  <p className="text-xs text-amber-700 dark:text-amber-300 mt-1 font-medium">
                    You must reduce goal allocations by Rs {deficit.toFixed(2)} to proceed, or cancel this expense.
                  </p>
                </div>
              </div>
            </div>

            <div className="p-4 space-y-3 bg-white dark:bg-gray-800">
              <p className="text-xs text-gray-500 dark:text-gray-400 font-medium">
                Select which goals to reduce:
                {totalWithdrawals > 0 && (
                  <span className={`ml-2 ${deficitCovered ? "text-green-600" : "text-amber-600"}`}>
                    (Rs {totalWithdrawals.toFixed(2)} / Rs {deficit.toFixed(2)} covered)
                  </span>
                )}
              </p>
              {accountGoalSummary!.goals
                .filter((g) => g.allocated_amount > 0)
                .map((goal) => (
                  <div key={goal.goal_id} className="flex items-center gap-3">
                    <div
                      className="w-3 h-3 rounded-full flex-shrink-0"
                      style={{ backgroundColor: goal.color }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                        {goal.goal_name}
                      </p>
                      <p className="text-[10px] text-gray-400">
                        Allocated: Rs {goal.allocated_amount.toFixed(2)}
                      </p>
                    </div>
                    <input
                      type="number"
                      value={goalWithdrawals[goal.goal_id] || ""}
                      onChange={(e) => {
                        const val = parseFloat(e.target.value) || 0;
                        if (val > goal.allocated_amount) {
                          setGoalWithdrawals({
                            ...goalWithdrawals,
                            [goal.goal_id]: goal.allocated_amount.toString(),
                          });
                        } else {
                          setGoalWithdrawals({
                            ...goalWithdrawals,
                            [goal.goal_id]: e.target.value,
                          });
                        }
                      }}
                      placeholder="0.00"
                      min="0"
                      max={goal.allocated_amount}
                      step="0.01"
                      className="w-28 px-2 py-1.5 text-sm border border-amber-300 dark:border-amber-700 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-amber-500 focus:border-transparent text-right"
                    />
                  </div>
                ))}
              {deficitCovered && (
                <p className="text-xs text-green-600 dark:text-green-400 font-medium flex items-center gap-1">
                  <svg className="h-3.5 w-3.5" viewBox="0 0 20 20" fill="currentColor">
                    <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z" clipRule="evenodd" />
                  </svg>
                  Deficit covered — you can proceed
                </p>
              )}
            </div>
          </div>
        )}

        {/* Memo */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Memo (Optional)
          </label>
          <textarea
            value={formData.memo}
            onChange={(e) => setFormData({ ...formData, memo: e.target.value })}
            rows={3}
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500"
            placeholder="Add a note about this transaction..."
          />
        </div>

        {/* Receipt Photos */}
        <PhotoPicker
          selectedPaths={pendingPhotoPaths}
          onSelect={setPendingPhotoPaths}
        />

        {/* Tags */}
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
            Tags (Optional)
          </label>
          <TagPicker
            tags={allTags}
            selectedIds={selectedTagIds}
            onChange={setSelectedTagIds}
          />
        </div>

        {/* Actions */}
        <div className="flex gap-3 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={onCancel}
            fullWidth
          >
            Cancel
          </Button>
          <Button
            type="submit"
            disabled={loading || !!(expenseExceedsUnallocated && !deficitCovered)}
            fullWidth
          >
            {loading
              ? "Saving..."
              : expenseExceedsUnallocated && !deficitCovered
                ? "Reduce Goals to Save"
                : "Save Transaction"}
          </Button>
        </div>
      </form>

      {/* Quick Category Creation Modal */}
      {showQuickCategory && type !== "TRANSFER" && (
        <QuickCategoryModal
          categoryType={type}
          parentCategories={filteredCategories}
          onCreated={async (newCategoryId) => {
            setShowQuickCategory(false);
            if (onCategoryCreated) {
              await onCategoryCreated();
            }
            setFormData((prev) => ({ ...prev, category_id: newCategoryId }));
          }}
          onClose={() => setShowQuickCategory(false)}
        />
      )}
    </div>
  );
}
