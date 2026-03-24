// File: src/components/GoalForm.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface AccountWithBalance {
  id: number;
  name: string;
  current_balance: number;
}

interface GoalFormProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  editGoal?: {
    id: number;
    name: string;
    target_amount: number;
    target_date: string | null;
    linked_account_id: number | null;
    color: string;
    icon: string;
  } | null;
}

const COLOR_PRESETS = [
  "#3B82F6", "#8B5CF6", "#EC4899", "#EF4444", "#F59E0B",
  "#10B981", "#06B6D4", "#6366F1", "#F97316", "#6B7280",
];

const ICON_OPTIONS = [
  { value: "target", label: "🎯 Target" },
  { value: "vacation", label: "✈️ Vacation" },
  { value: "car", label: "🚗 Car" },
  { value: "home", label: "🏠 Home" },
  { value: "education", label: "🎓 Education" },
  { value: "emergency", label: "🛡️ Emergency" },
  { value: "gift", label: "🎁 Gift" },
  { value: "heart", label: "❤️ Health" },
  { value: "star", label: "⭐ Other" },
  { value: "piggy", label: "🐷 Savings" },
];

export default function GoalForm({
  isOpen,
  onClose,
  onSaved,
  editGoal,
}: GoalFormProps) {
  const [name, setName] = useState("");
  const [targetAmount, setTargetAmount] = useState("");
  const [targetDate, setTargetDate] = useState("");
  const [linkedAccountId, setLinkedAccountId] = useState<number | null>(null);
  const [color, setColor] = useState("#3B82F6");
  const [icon, setIcon] = useState("target");
  const [accounts, setAccounts] = useState<AccountWithBalance[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const isEditing = !!editGoal;

  useEffect(() => {
    if (isOpen) {
      loadAccounts();
      if (editGoal) {
        setName(editGoal.name);
        setTargetAmount(editGoal.target_amount.toString());
        setTargetDate(editGoal.target_date || "");
        setLinkedAccountId(editGoal.linked_account_id);
        setColor(editGoal.color);
        setIcon(editGoal.icon);
      } else {
        setName("");
        setTargetAmount("");
        setTargetDate("");
        setLinkedAccountId(null);
        setColor("#3B82F6");
        setIcon("target");
      }
      setError("");
    }
  }, [isOpen, editGoal]);

  const loadAccounts = async () => {
    try {
      const data = await invoke<AccountWithBalance[]>("get_accounts_with_balance");
      setAccounts(data);
    } catch (err) {
      console.error("Failed to load accounts:", err);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    if (!name.trim()) {
      setError("Name is required");
      return;
    }

    const amount = parseFloat(targetAmount);
    if (isNaN(amount) || amount <= 0) {
      setError("Enter a valid target amount");
      return;
    }

    setSaving(true);
    try {
      if (isEditing) {
        await invoke("update_goal", {
          input: {
            id: editGoal!.id,
            name: name.trim(),
            target_amount: amount,
            target_date: targetDate || null,
            color,
            icon,
          },
        });
      } else {
        await invoke("create_goal", {
          input: {
            name: name.trim(),
            target_amount: amount,
            target_date: targetDate || null,
            linked_account_id: linkedAccountId,
            color,
            icon,
          },
        });
      }
      onSaved();
      onClose();
    } catch (err) {
      setError(String(err));
    } finally {
      setSaving(false);
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-lg mx-4 overflow-hidden">
        {/* Header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700"
          style={{ borderTopColor: color, borderTopWidth: "3px" }}
        >
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {isEditing ? "Edit Goal" : "New Savings Goal"}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700"
          >
            <XMarkIcon className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 dark:bg-red-900/20 text-red-600 dark:text-red-400 text-sm">
              {error}
            </div>
          )}

          {/* Name */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Goal Name *
            </label>
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g., Vacation Fund"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              autoFocus
            />
          </div>

          {/* Target Amount + Date row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Amount *
              </label>
              <input
                type="number"
                value={targetAmount}
                onChange={(e) => setTargetAmount(e.target.value)}
                placeholder="50000"
                min="1"
                step="0.01"
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Target Date
              </label>
              <input
                type="date"
                value={targetDate}
                onChange={(e) => setTargetDate(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              />
            </div>
          </div>

          {/* Linked Account (only for new goals) */}
          {!isEditing && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Link to Account (optional)
              </label>
              <select
                value={linkedAccountId || ""}
                onChange={(e) =>
                  setLinkedAccountId(e.target.value ? parseInt(e.target.value) : null)
                }
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              >
                <option value="">No link — use manual contributions</option>
                {accounts.map((acc) => (
                  <option key={acc.id} value={acc.id}>
                    {acc.name} (Rs{" "}
                    {acc.current_balance.toLocaleString("en-US", {
                      minimumFractionDigits: 2,
                    })}
                    )
                  </option>
                ))}
              </select>
              <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                Linked goals track the account's balance automatically
              </p>
            </div>
          )}

          {/* Icon + Color row */}
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Icon
              </label>
              <select
                value={icon}
                onChange={(e) => setIcon(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent"
              >
                {ICON_OPTIONS.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Color
              </label>
              <div className="flex flex-wrap gap-1.5">
                {COLOR_PRESETS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setColor(c)}
                    className={`w-6 h-6 rounded-full transition-transform ${
                      color === c ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-gray-500 dark:ring-offset-gray-800 scale-110" : ""
                    }`}
                    style={{ backgroundColor: c }}
                  />
                ))}
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex justify-end gap-3 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-5 py-2 text-sm font-medium text-white rounded-lg transition-colors disabled:opacity-50"
              style={{ backgroundColor: color }}
            >
              {saving ? "Saving..." : isEditing ? "Save Changes" : "Create Goal"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
