// File: src/views/AccountsView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlusIcon } from "@heroicons/react/24/outline";
import Button from "../components/Button";
import Input from "../components/Input";
import Select from "../components/Select";
import AccountCard from "../components/AccountCard";
import type {
  AccountGroup,
  AccountWithBalance,
  CreateAccountInput,
} from "../types/account";

export default function AccountsView() {
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showForm, setShowForm] = useState(false);

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
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleCreateAccount = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    try {
      await invoke("create_account", { input: formData });
      setShowForm(false);
      setFormData({ group_id: 1, name: "", initial_balance: 0 });
      await loadData();
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteAccount = async (accountId: number) => {
    if (!confirm("Are you sure you want to delete this account?")) return;

    setLoading(true);
    setError(null);
    try {
      await invoke("delete_account", { accountId });
      await loadData();
    } catch (err) {
      setError(err as string);
    } finally {
      setLoading(false);
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

            <Button type="submit" disabled={loading} fullWidth>
              {loading ? "Creating..." : "Create Account"}
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
                      currentBalance={account.current_balance}
                      initialBalance={account.initial_balance}
                      currency={account.currency}
                      onDelete={handleDeleteAccount}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
