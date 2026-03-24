// File: src/components/GoalContributionModal.tsx
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import { XMarkIcon } from "@heroicons/react/24/outline";

interface GoalContributionModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSaved: () => void;
  goalId: number;
  goalName: string;
  goalColor: string;
}

export default function GoalContributionModal({
  isOpen,
  onClose,
  onSaved,
  goalId,
  goalName,
  goalColor,
}: GoalContributionModalProps) {
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(new Date().toISOString().split("T")[0]);
  const [note, setNote] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");

    const parsedAmount = parseFloat(amount);
    if (isNaN(parsedAmount) || parsedAmount === 0) {
      setError("Enter a valid amount");
      return;
    }

    setSaving(true);
    try {
      await invoke("add_goal_contribution", {
        input: {
          goal_id: goalId,
          amount: parsedAmount,
          date,
          note: note.trim() || null,
        },
      });
      setAmount("");
      setNote("");
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
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-sm mx-4 overflow-hidden">
        {/* Color header */}
        <div
          className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700"
          style={{ borderTopColor: goalColor, borderTopWidth: "3px" }}
        >
          <div>
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Add Contribution
            </h2>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
              {goalName}
            </p>
          </div>
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

          {/* Amount */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Amount *
            </label>
            <input
              type="number"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="1000"
              step="0.01"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent text-lg"
              autoFocus
            />
            <p className="text-xs text-gray-400 dark:text-gray-500 mt-1">
              Use positive amount to add, negative to withdraw
            </p>
          </div>

          {/* Date */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Date
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
          </div>

          {/* Note */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Note (optional)
            </label>
            <input
              type="text"
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Monthly savings"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent"
            />
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
              style={{ backgroundColor: goalColor }}
            >
              {saving ? "Saving..." : "Add Contribution"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
