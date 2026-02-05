// File: src/views/TransactionsView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlusIcon } from "@heroicons/react/24/outline";
import Button from "../components/Button";
import TransactionForm from "../components/TransactionForm";
import TransactionList from "../components/TransactionList";
import TransactionModal from "../components/TransactionModal";
import type {
  TransactionWithDetails,
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
  const [prefillData, setPrefillData] = useState<any>(null);

  useEffect(() => {
    loadData();
  }, []);

  useEffect(() => {
    // Check if there's template data in sessionStorage
    const templateData = sessionStorage.getItem("templateData");
    if (templateData) {
      const parsedData = JSON.parse(templateData);
      setPrefillData(parsedData);
      setShowForm(true);
      sessionStorage.removeItem("templateData"); // Clear after use
    }
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [txns, accts, cats] = await Promise.all([
        invoke<TransactionWithDetails[]>("get_transactions_with_details"),
        invoke<AccountWithBalance[]>("get_accounts_with_balance"),
        invoke<CategoryWithChildren[]>("get_categories_with_children"),
      ]);
      setTransactions(txns);
      setAccounts(accts);
      setCategories(cats);
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleCreate = async (input: CreateTransactionInput) => {
    setError(null);
    try {
      await invoke("create_transaction", { input });
      await loadData();
      setShowForm(false);
      setPrefillData(null);
    } catch (err) {
      setError(err as string);
      throw err;
    }
  };

  const handleUpdate = async (input: UpdateTransactionInput) => {
    setError(null);
    try {
      await invoke("update_transaction", { input });
      await loadData();
      setEditingTransaction(null);
    } catch (err) {
      setError(err as string);
      throw err;
    }
  };

  const handleDelete = async (transactionId: number) => {
    if (!confirm("Are you sure you want to delete this transaction?")) return;

    setError(null);
    try {
      await invoke("delete_transaction", { transactionId });
      await loadData();
    } catch (err) {
      setError(err as string);
    }
  };

  const handleEdit = (transaction: TransactionWithDetails) => {
    setEditingTransaction(transaction);
  };

  const handleDuplicate = (transaction: TransactionWithDetails) => {
    // Create a new transaction with same details but new date
    const now = new Date().toISOString().split("T")[0];
    setShowForm(true);
    // This will be handled in TransactionForm component
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
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Transactions
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Track your income, expenses, and transfers
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
        <div className="mb-8">
          <TransactionForm
            accounts={accounts}
            categories={categories}
            onSubmit={handleCreate}
            onCancel={handleCancelForm}
            prefillData={prefillData}
          />
        </div>
      )}

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
          onDelete={handleDelete}
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
    </div>
  );
}
