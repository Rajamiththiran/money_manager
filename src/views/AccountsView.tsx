// File: src/views/AccountsView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import Button from "../components/Button";
import Input from "../components/Input";
import Select from "../components/Select";
import AccountCard from "../components/AccountCard";
import ConfirmDialog from "../components/ConfirmDialog";
import type {
  AccountGroup,
  AccountWithBalance,
  CreateAccountInput,
  UpdateAccountInput,
} from "../types/account";

export default function AccountsView() {
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [creating, setCreating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

  // Edit modal state
  const [editingAccount, setEditingAccount] =
    useState<AccountWithBalance | null>(null);
  const [editForm, setEditForm] = useState<UpdateAccountInput>({
    id: 0,
    name: "",
    group_id: 0,
    currency: "",
  });
  const [editSaving, setEditSaving] = useState(false);

  // Delete confirm state
  const [deleteConfirm, setDeleteConfirm] = useState<{
    open: boolean;
    accountId: number | null;
    accountName: string;
  }>({ open: false, accountId: null, accountName: "" });

  const [formData, setFormData] = useState<CreateAccountInput>({
    group_id: 1,
    name: "",
    initial_balance: 0,
  });

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const [groups, accts] = await Promise.all([
        invoke<AccountGroup[]>("get_account_groups"),
        invoke<AccountWithBalance[]>("get_accounts_with_balance"),
      ]);
      setAccountGroups(groups);
      setAccounts(accts);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setError(null);
    try {
      await invoke("create_account", { input: formData });
      setShowForm(false);
      setFormData({ group_id: 1, name: "", initial_balance: 0 });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setCreating(false);
    }
  };

  // ─── Edit ───
  const handleEditOpen = (accountId: number) => {
    const account = accounts.find((a) => a.id === accountId);
    if (!account) return;
    setEditingAccount(account);
    setEditForm({
      id: account.id,
      name: account.name,
      group_id: account.group_id,
      currency: account.currency,
    });
  };

  const handleEditSave = async () => {
    if (!editForm.name?.trim()) {
      setError("Account name cannot be empty");
      return;
    }
    setEditSaving(true);
    setError(null);
    try {
      await invoke("update_account", { input: editForm });
      setEditingAccount(null);
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setEditSaving(false);
    }
  };

  // ─── Delete ───
  const handleDeleteRequest = (accountId: number) => {
    const account = accounts.find((a) => a.id === accountId);
    setDeleteConfirm({
      open: true,
      accountId,
      accountName: account?.name || "",
    });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm.accountId) return;
    setError(null);
    try {
      await invoke("delete_account", {
        accountId: deleteConfirm.accountId,
      });
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setDeleteConfirm({ open: false, accountId: null, accountName: "" });
    }
  };

  const getGroupName = (groupId: number) => {
    return accountGroups.find((g) => g.id === groupId)?.name || "Unknown";
  };

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
            Accounts
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Manage your bank accounts, cash, and credit cards
          </p>
        </div>
        <Button
          onClick={() => setShowForm(!showForm)}
          icon={<PlusIcon className="h-5 w-5" />}
          variant={showForm ? "secondary" : "primary"}
        >
          {showForm ? "Cancel" : "New Account"}
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

      {/* Create Account Form */}
      {showForm && (
        <div className="mb-8 bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Create New Account
          </h2>
          <form onSubmit={handleCreateAccount} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <Select
                label="Account Group"
                value={formData.group_id}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    group_id: parseInt(e.target.value),
                  })
                }
                options={accountGroups.map((group) => ({
                  value: group.id,
                  label: group.name,
                }))}
                required
              />
              <Input
                label="Account Name"
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., My Wallet, Citi Bank"
                required
              />
              <Input
                label="Initial Balance"
                type="number"
                step="0.01"
                value={formData.initial_balance}
                onChange={(e) =>
                  setFormData({
                    ...formData,
                    initial_balance: parseFloat(e.target.value),
                  })
                }
                placeholder="0.00"
                required
              />
              <Input
                label="Currency"
                type="text"
                value={formData.currency || "LKR"}
                onChange={(e) =>
                  setFormData({ ...formData, currency: e.target.value })
                }
                placeholder="LKR"
              />
            </div>
            <Button type="submit" disabled={creating} fullWidth>
              {creating ? "Creating..." : "Create Account"}
            </Button>
          </form>
        </div>
      )}

      {/* Accounts List */}
      {loading && accounts.length === 0 ? (
        <div className="text-center py-12">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            Loading accounts...
          </p>
        </div>
      ) : accounts.length === 0 ? (
        <div className="text-center py-12 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-gray-600 dark:text-gray-400">
            No accounts yet. Create your first one!
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {accountGroups.map((group) => {
            const groupAccounts = accounts.filter(
              (a) => a.group_id === group.id,
            );
            if (groupAccounts.length === 0) return null;

            return (
              <div key={group.id}>
                <h2 className="text-lg font-semibold text-gray-900 dark:text-white mb-4">
                  {group.name}
                </h2>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
                  {groupAccounts.map((account) => (
                    <AccountCard
                      key={account.id}
                      id={account.id}
                      name={account.name}
                      groupName={getGroupName(account.group_id)}
                      groupId={account.group_id}
                      currentBalance={account.current_balance}
                      initialBalance={account.initial_balance}
                      currency={account.currency}
                      onEdit={handleEditOpen}
                      onDelete={handleDeleteRequest}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* ─── Edit Account Modal ─── */}
      {editingAccount && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-xl shadow-xl max-w-md w-full">
            <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Edit Account
              </h2>
              <button
                onClick={() => setEditingAccount(null)}
                className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              >
                <XMarkIcon className="h-5 w-5 text-gray-500" />
              </button>
            </div>
            <div className="p-6 space-y-4">
              <Input
                label="Account Name"
                value={editForm.name || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, name: e.target.value })
                }
                required
              />
              <Select
                label="Account Group"
                value={editForm.group_id || 0}
                onChange={(e) =>
                  setEditForm({
                    ...editForm,
                    group_id: parseInt(e.target.value),
                  })
                }
                options={accountGroups.map((g) => ({
                  value: g.id,
                  label: g.name,
                }))}
              />
              <Input
                label="Currency"
                value={editForm.currency || ""}
                onChange={(e) =>
                  setEditForm({ ...editForm, currency: e.target.value })
                }
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Initial balance cannot be changed after creation.
              </p>
              <div className="flex gap-3 pt-2">
                <Button
                  variant="secondary"
                  onClick={() => setEditingAccount(null)}
                  fullWidth
                >
                  Cancel
                </Button>
                <Button
                  onClick={handleEditSave}
                  disabled={editSaving}
                  fullWidth
                >
                  {editSaving ? "Saving..." : "Save Changes"}
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      <ConfirmDialog
        open={deleteConfirm.open}
        title="Delete Account"
        message={`Are you sure you want to delete "${deleteConfirm.accountName}"? This cannot be undone. Accounts with existing transactions cannot be deleted.`}
        confirmLabel="Delete"
        variant="danger"
        onConfirm={handleDeleteConfirm}
        onCancel={() =>
          setDeleteConfirm({ open: false, accountId: null, accountName: "" })
        }
      />
    </div>
  );
}
