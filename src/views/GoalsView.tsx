// File: src/views/GoalsView.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PlusIcon, TrophyIcon } from "@heroicons/react/24/outline";
import GoalCard from "../components/GoalCard";
import GoalForm from "../components/GoalForm";
import GoalContributionModal from "../components/GoalContributionModal";

interface GoalProgress {
  current_amount: number;
  target_amount: number;
  percentage: number;
  on_track: boolean;
  projected_completion_date: string | null;
  days_remaining: number | null;
}

interface GoalWithProgress {
  id: number;
  name: string;
  target_amount: number;
  target_date: string | null;
  linked_account_id: number | null;
  color: string;
  icon: string;
  status: string;
  created_at: string;
  updated_at: string;
  progress: GoalProgress;
  linked_account_name: string | null;
}

type StatusFilter = "ALL" | "ACTIVE" | "PAUSED" | "COMPLETED" | "ARCHIVED";

export default function GoalsView() {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("ACTIVE");
  const [showForm, setShowForm] = useState(false);
  const [editGoal, setEditGoal] = useState<GoalWithProgress | null>(null);
  const [contributionGoal, setContributionGoal] = useState<GoalWithProgress | null>(null);

  const loadGoals = useCallback(async () => {
    try {
      const filter = statusFilter === "ALL" ? null : statusFilter;
      const data = await invoke<GoalWithProgress[]>("get_goals", {
        statusFilter: filter,
      });
      setGoals(data);
    } catch (err) {
      console.error("Failed to load goals:", err);
    } finally {
      setLoading(false);
    }
  }, [statusFilter]);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  const handleEdit = (goal: GoalWithProgress) => {
    setEditGoal(goal);
    setShowForm(true);
  };

  const handleAddContribution = (goal: GoalWithProgress) => {
    setContributionGoal(goal);
  };

  const handleFormClose = () => {
    setShowForm(false);
    setEditGoal(null);
  };

  const filterTabs: { key: StatusFilter; label: string }[] = [
    { key: "ACTIVE", label: "Active" },
    { key: "PAUSED", label: "Paused" },
    { key: "COMPLETED", label: "Completed" },
    { key: "ARCHIVED", label: "Archived" },
    { key: "ALL", label: "All" },
  ];

  // Compute summary stats
  const activeGoals = goals.filter((g) => g.status === "ACTIVE");
  const totalTarget = activeGoals.reduce((s, g) => s + g.progress.target_amount, 0);
  const totalCurrent = activeGoals.reduce((s, g) => s + g.progress.current_amount, 0);
  const overallPercentage = totalTarget > 0 ? (totalCurrent / totalTarget) * 100 : 0;

  return (
    <div className="p-8">
      {/* Header */}
      <div className="flex flex-wrap items-center justify-between gap-4 mb-8">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <TrophyIcon className="h-8 w-8 text-accent-500" />
            Savings Goals
          </h1>
          <p className="mt-1 text-gray-600 dark:text-gray-400">
            Track your progress toward financial targets
          </p>
        </div>
        <button
          onClick={() => {
            setEditGoal(null);
            setShowForm(true);
          }}
          className="flex items-center gap-2 px-4 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-lg font-medium transition-colors shadow-sm"
        >
          <PlusIcon className="h-5 w-5" />
          New Goal
        </button>
      </div>

      {/* Summary bar (only for active goals) */}
      {activeGoals.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-5 mb-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Overall Progress ({activeGoals.length} active goal{activeGoals.length !== 1 ? "s" : ""})
              </p>
              <p className="text-2xl font-bold text-gray-900 dark:text-white mt-1">
                Rs{" "}
                {totalCurrent.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                  maximumFractionDigits: 2,
                })}{" "}
                <span className="text-base font-normal text-gray-400">
                  / Rs{" "}
                  {totalTarget.toLocaleString("en-US", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </span>
              </p>
            </div>
            <div className="text-right">
              <span className="text-3xl font-bold text-accent-600 dark:text-accent-400">
                {overallPercentage.toFixed(1)}%
              </span>
            </div>
          </div>
          <div className="w-full h-2.5 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden mt-3">
            <div
              className="h-full rounded-full bg-accent-500 transition-all duration-700"
              style={{ width: `${Math.min(overallPercentage, 100)}%` }}
            />
          </div>
        </div>
      )}

      {/* Filter tabs */}
      <div className="flex gap-2 mb-6 border-b border-gray-200 dark:border-gray-700">
        {filterTabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => setStatusFilter(tab.key)}
            className={`px-4 py-2.5 text-sm font-medium border-b-2 transition-colors ${
              statusFilter === tab.key
                ? "border-accent-500 text-accent-600 dark:text-accent-400"
                : "border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Goals grid */}
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-accent-500" />
        </div>
      ) : goals.length === 0 ? (
        <div className="text-center py-20">
          <TrophyIcon className="h-16 w-16 mx-auto text-gray-300 dark:text-gray-600 mb-4" />
          <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-2">
            {statusFilter === "ACTIVE"
              ? "No active goals yet"
              : `No ${statusFilter.toLowerCase()} goals`}
          </h3>
          <p className="text-gray-500 dark:text-gray-400 mb-6">
            {statusFilter === "ACTIVE"
              ? "Create your first savings goal to start tracking progress!"
              : "Goals with this status will appear here."}
          </p>
          {statusFilter === "ACTIVE" && (
            <button
              onClick={() => {
                setEditGoal(null);
                setShowForm(true);
              }}
              className="inline-flex items-center gap-2 px-5 py-2.5 bg-accent-600 hover:bg-accent-700 text-white rounded-lg font-medium transition-colors"
            >
              <PlusIcon className="h-5 w-5" />
              Create Goal
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6">
          {goals.map((goal) => (
            <GoalCard
              key={goal.id}
              goal={goal}
              onEdit={handleEdit}
              onAddContribution={handleAddContribution}
              onRefresh={loadGoals}
            />
          ))}
        </div>
      )}

      {/* Modals */}
      <GoalForm
        isOpen={showForm}
        onClose={handleFormClose}
        onSaved={loadGoals}
        editGoal={editGoal}
      />

      {contributionGoal && (
        <GoalContributionModal
          isOpen={true}
          onClose={() => setContributionGoal(null)}
          onSaved={loadGoals}
          goalId={contributionGoal.id}
          goalName={contributionGoal.name}
          goalColor={contributionGoal.color}
        />
      )}
    </div>
  );
}
