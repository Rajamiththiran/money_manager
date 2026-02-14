// File: src/views/TransactionsView.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlusIcon } from "@heroicons/react/24/outline";
import Button from "../components/Button";
import TransactionForm from "../components/TransactionForm";
import TransactionList from "../components/TransactionList";
import TransactionModal from "../components/TransactionModal";
import TransactionFilterBar from "../components/TransactionFilterBar";
import ConfirmDialog from "../components/ConfirmDialog";
import type {
  TransactionWithDetails,
  TransactionFilter,
  CreateTransactionInput,
  UpdateTransactionInput,
} from "../types/transaction";
import type { AccountWithBalance } from "../types/account";
import type { CategoryWithChildren } from "../types/category";

export default function TransactionsView() {
  const [transactions, setTransactions] = useState<TransactionWithDetails[]>(
    [],
  );
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [categories, setCategories] = useState<CategoryWithChildren[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);
  const [editingTransaction, setEditingTransaction] =
    useState<TransactionWithDetails | null>(null);
  const [prefillData, setPrefillData] = useState<{
    transaction_type?: "INCOME" | "EXPENSE" | "TRANSFER";
    account_id?: number;
    category_id?: number;
    from_account_id?: number;
    to_account_id?: number;
    amount?: number;
    memo?: string;
  } | null>(null);

  // Filter state — default to current month
  const [activeFilter, setActiveFilter] = useState<TransactionFilter>(() => {
    const now = new Date();
    const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
    const lastDay = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return {
      start_date: firstDay.toISOString().split("T")[0],
      end_date: lastDay.toISOString().split("T")[0],
    };
  });

  // Confirm dialog state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    transactionId: number | null;
  }>({ open: false, transactionId: null });

  useEffect(() => {
    loadReferenceData();
  }, []);

  // Reload transactions whenever filter changes
  useEffect(() => {
    loadTransactions();
  }, [activeFilter]);

  useEffect(() => {
    const templateData = sessionStorage.getItem("templateData");
    if (templateData) {
      try {
        const parsedData = JSON.parse(templateData);
        setPrefillData(parsedData);
        setShowForm(true);
      } catch {
        console.error("Failed to parse template data");
      }
      sessionStorage.removeItem("templateData");
    }
  }, []);

  // Load accounts + categories (reference data)
  const loadReferenceData = async () => {
    try {
      const [accts, cats] = await Promise.all([
        invoke<AccountWithBalance[]>("get_accounts_with_balance"),
        invoke<CategoryWithChildren[]>("get_categories_with_children"),
      ]);
      setAccounts(accts);
      setCategories(cats);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  // Load transactions with current filter
  const loadTransactions = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const txns = await invoke<TransactionWithDetails[]>(
        "get_transactions_filtered",
        { filter: activeFilter },
      );
      setTransactions(txns);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, [activeFilter]);

  const handleFilterChange = (filter: TransactionFilter) => {
    setActiveFilter(filter);
  };

  const handleCreate = async (
    input: CreateTransactionInput,
    pendingPhotoPath?: string | null,
  ) => {
    setError(null);
    try {
      // create_transaction returns the new transaction ID
      const transactionId = await invoke<number>("create_transaction", {
        input,
      });

      // If a photo was selected, attach it to the newly created transaction
      if (pendingPhotoPath) {
        try {
          await invoke("attach_photo", {
            transactionId,
            sourcePath: pendingPhotoPath,
          });
        } catch (photoErr) {
          // Transaction was created successfully, but photo failed — don't roll back
          console.error("Failed to attach photo:", photoErr);
        }
      }

      await loadTransactions();
      await loadReferenceData();
      setShowForm(false);
      setPrefillData(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const handleUpdate = async (input: UpdateTransactionInput) => {
    setError(null);
    try {
      await invoke("update_transaction", { input });
      await loadTransactions();
      await loadReferenceData();
      setEditingTransaction(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      throw err;
    }
  };

  const handleDeleteRequest = (transactionId: number) => {
    setDeleteConfirm({ open: true, transactionId });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.transactionId) return;
    setError(null);
    try {
      await invoke("delete_transaction", {
        transactionId: deleteConfirm.transactionId,
      });
      await loadTransactions();
      await loadReferenceData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteConfirm({ open: false, transactionId: null });
    }
  };

  const handleEdit = (transaction: TransactionWithDetails) => {
    setEditingTransaction(transaction);
  };

  const handleDuplicate = (transaction: TransactionWithDetails) => {
    setPrefillData({
      transaction_type: transaction.transaction_type as
        | "INCOME"
        | "EXPENSE"
        | "TRANSFER",
      account_id: transaction.account_id,
      category_id: transaction.category_id ?? undefined,
      to_account_id: transaction.to_account_id ?? undefined,
      amount: transaction.amount,
      memo: transaction.memo ?? undefined,
    });
    setShowForm(true);
  };

  const handleNewTransaction = () => {
    setPrefillData(null);
    setShowForm(!showForm);
  };

  const handleCancelForm = () => {
    setShowForm(false);
    setPrefillData(null);
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Transactions
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Track your income, expenses, and transfers
            {transactions.length > 0 && (
              <span className="ml-2 text-sm font-medium text-gray-500">
                ({transactions.length} result
                {transactions.length !== 1 ? "s" : ""})
              </span>
            )}
          </p>
        </div>
        <Button
          onClick={handleNewTransaction}
          icon={<PlusIcon className="h-5 w-5" />}
          variant={showForm ? "secondary" : "primary"}
        >
          {showForm ? "Cancel" : "New Transaction"}
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

      {/* Transaction Form */}
      {showForm && (
        <div className="mb-6">
          <TransactionForm
            accounts={accounts}
            categories={categories}
            onSubmit={handleCreate}
            onCancel={handleCancelForm}
            prefillData={prefillData}
          />
        </div>
      )}

      {/* Filter Bar */}
      <TransactionFilterBar
        accounts={accounts}
        categories={categories}
        onFilterChange={handleFilterChange}
      />

      {/* Transaction List */}
      {loading && transactions.length === 0 ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading transactions...
          </p>
        </div>
      ) : (
        <TransactionList
          transactions={transactions}
          onEdit={handleEdit}
          onDelete={handleDeleteRequest}
          onDuplicate={handleDuplicate}
        />
      )}

      {/* Edit Modal */}
      {editingTransaction && (
        <TransactionModal
          transaction={editingTransaction}
          accounts={accounts}
          categories={categories}
          onSave={handleUpdate}
          onClose={() => setEditingTransaction(null)}
        />
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Transaction"
        message="This will permanently delete this transaction and reverse its journal entries. This action cannot be undone."
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() => setDeleteConfirm({ open: false, transactionId: null })}
      />
    </div>
  );
}
