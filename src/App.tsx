// File: src/App.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  AccountGroup,
  AccountWithBalance,
  CreateAccountInput,
} from "./types/account";

function App() {
  const [accountGroups, setAccountGroups] = useState<AccountGroup[]>([]);
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [formData, setFormData] = useState<CreateAccountInput>({
    group_id: 1,
    name: "",
    initial_balance: 0,
  });

  // Load data on mount
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
      console.error("Failed to load data:", err);
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
      console.error("Failed to create account:", err);
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
      console.error("Failed to delete account:", err);
    } finally {
      setLoading(false);
    }
  };

  const getGroupName = (groupId: number) => {
    return accountGroups.find((g) => g.id === groupId)?.name || "Unknown";
  };

  return (
    <div className="min-h-screen bg-gray-100 p-8">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="flex items-center justify-between">
            <h1 className="text-3xl font-bold text-gray-800">Money Manager</h1>
            <button
              onClick={() => setShowForm(!showForm)}
              className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-lg transition"
            >
              {showForm ? "Cancel" : "+ New Account"}
            </button>
          </div>
        </div>

        {/* Error Message */}
        {error && (
          <div className="bg-red-100 border border-red-400 text-red-700 px-4 py-3 rounded mb-6">
            <strong>Error:</strong> {error}
          </div>
        )}

        {/* Create Account Form */}
        {showForm && (
          <div className="bg-white rounded-lg shadow-md p-6 mb-6">
            <h2 className="text-xl font-bold mb-4">Create New Account</h2>
            <form onSubmit={handleCreateAccount}>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Group
                  </label>
                  <select
                    value={formData.group_id}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        group_id: parseInt(e.target.value),
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    required
                  >
                    {accountGroups.map((group) => (
                      <option key={group.id} value={group.id}>
                        {group.name}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Account Name
                  </label>
                  <input
                    type="text"
                    value={formData.name}
                    onChange={(e) =>
                      setFormData({ ...formData, name: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="e.g., My Wallet, Citi Bank"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Initial Balance
                  </label>
                  <input
                    type="number"
                    step="0.01"
                    value={formData.initial_balance}
                    onChange={(e) =>
                      setFormData({
                        ...formData,
                        initial_balance: parseFloat(e.target.value),
                      })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="0.00"
                    required
                  />
                </div>

                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">
                    Currency
                  </label>
                  <input
                    type="text"
                    value={formData.currency || "LKR"}
                    onChange={(e) =>
                      setFormData({ ...formData, currency: e.target.value })
                    }
                    className="w-full border border-gray-300 rounded-lg px-3 py-2"
                    placeholder="LKR"
                  />
                </div>
              </div>

              <div className="mt-4">
                <button
                  type="submit"
                  disabled={loading}
                  className="bg-green-600 hover:bg-green-700 text-white px-6 py-2 rounded-lg transition disabled:opacity-50"
                >
                  {loading ? "Creating..." : "Create Account"}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* Accounts List */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-bold mb-4">Your Accounts</h2>

          {loading && accounts.length === 0 ? (
            <p className="text-gray-500">Loading accounts...</p>
          ) : accounts.length === 0 ? (
            <p className="text-gray-500">
              No accounts yet. Create your first one!
            </p>
          ) : (
            <div className="space-y-4">
              {accountGroups.map((group) => {
                const groupAccounts = accounts.filter(
                  (a) => a.group_id === group.id,
                );
                if (groupAccounts.length === 0) return null;

                return (
                  <div key={group.id}>
                    <h3 className="text-lg font-semibold text-gray-700 mb-2 border-b pb-2">
                      {group.name}
                    </h3>
                    <div className="space-y-2">
                      {groupAccounts.map((account) => (
                        <div
                          key={account.id}
                          className="flex items-center justify-between p-4 bg-gray-50 rounded-lg hover:bg-gray-100 transition"
                        >
                          <div>
                            <h4 className="font-medium text-gray-800">
                              {account.name}
                            </h4>
                            <p className="text-sm text-gray-600">
                              Initial: {account.initial_balance.toFixed(2)}{" "}
                              {account.currency}
                            </p>
                          </div>
                          <div className="flex items-center gap-4">
                            <div className="text-right">
                              <p className="text-lg font-bold text-gray-900">
                                {account.current_balance.toFixed(2)}{" "}
                                {account.currency}
                              </p>
                              <p className="text-xs text-gray-500">
                                Current Balance
                              </p>
                            </div>
                            <button
                              onClick={() => handleDeleteAccount(account.id)}
                              disabled={loading}
                              className="bg-red-500 hover:bg-red-600 text-white px-3 py-1 rounded text-sm transition disabled:opacity-50"
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export default App;
