// File: src/components/GoalsDashboardWidget.tsx
import { useState, useEffect, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { TrophyIcon, ArrowPathIcon } from "@heroicons/react/24/outline";
import GoalIcon from "./GoalIconMap";
import type { WidgetDisplayMode } from "../types/dashboard";

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
  color: string;
  icon: string;
  status: string;
  progress: GoalProgress;
  linked_account_name: string | null;
  linked_account_balance: number | null;
}

interface GoalsDashboardWidgetProps {
  onViewAll?: () => void;
  displayMode?: WidgetDisplayMode;
}

export default function GoalsDashboardWidget({ onViewAll, displayMode = "expanded" }: GoalsDashboardWidgetProps) {
  const [goals, setGoals] = useState<GoalWithProgress[]>([]);
  const [loading, setLoading] = useState(true);

  const loadGoals = useCallback(async () => {
    try {
      const data = await invoke<GoalWithProgress[]>("get_goals", {
        statusFilter: "ACTIVE",
      });
      setGoals(data.slice(0, 3)); // Top 3 only
    } catch (err) {
      console.error("Failed to load goals:", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadGoals();
  }, [loadGoals]);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
        <div className="flex items-center gap-3 mb-4">
          <TrophyIcon className="h-5 w-5 text-accent-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Savings Goals
          </h2>
        </div>
        <div className="flex items-center justify-center py-6">
          <ArrowPathIcon className="h-5 w-5 animate-spin text-gray-400" />
        </div>
      </div>
    );
  }

  if (goals.length === 0) return null;

  // Compact mode: horizontal row of progress circles
  if (displayMode === "compact") {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-4 mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <TrophyIcon className="h-4 w-4 text-accent-500" />
            <h2 className="text-sm font-semibold text-gray-900 dark:text-white">
              Goals
            </h2>
          </div>
          {onViewAll && (
            <button
              onClick={onViewAll}
              className="text-xs text-accent-600 dark:text-accent-400 hover:underline font-medium"
            >
              View All
            </button>
          )}
        </div>
        <div className="flex items-center gap-4">
          {goals.map((goal) => (
            <div key={goal.id} className="flex items-center gap-2">
              <div className="relative w-8 h-8">
                <svg className="w-8 h-8 -rotate-90" viewBox="0 0 36 36">
                  <circle
                    className="text-gray-100 dark:text-gray-700"
                    stroke="currentColor"
                    strokeWidth="3"
                    fill="none"
                    cx="18"
                    cy="18"
                    r="15.5"
                  />
                  <circle
                    stroke={goal.color}
                    strokeWidth="3"
                    strokeDasharray={`${Math.min(goal.progress.percentage, 100)} 100`}
                    strokeLinecap="round"
                    fill="none"
                    cx="18"
                    cy="18"
                    r="15.5"
                  />
                </svg>
                <span className="absolute inset-0 flex items-center justify-center text-[8px] font-bold text-gray-700 dark:text-gray-300">
                  {goal.progress.percentage.toFixed(0)}%
                </span>
              </div>
              <span className="text-xs text-gray-600 dark:text-gray-400 truncate max-w-[80px]">
                {goal.name}
              </span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Expanded mode (default — existing layout)
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-6 mb-8">
      {/* Header */}
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-3">
          <TrophyIcon className="h-5 w-5 text-accent-500" />
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            Savings Goals
          </h2>
        </div>
        {onViewAll && (
          <button
            onClick={onViewAll}
            className="text-xs text-accent-600 dark:text-accent-400 hover:underline font-medium"
          >
            View All
          </button>
        )}
      </div>

      {/* Goal mini cards */}
      <div className="space-y-3">
        {goals.map((goal) => (
          <div
            key={goal.id}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="w-8 h-8 rounded-lg flex items-center justify-center bg-gray-100 dark:bg-gray-700 flex-shrink-0">
              <GoalIcon icon={goal.icon} color={goal.color} className="h-4 w-4" />
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-center justify-between mb-1">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {goal.name}
                </p>
                <span
                  className="text-xs font-semibold flex-shrink-0 ml-2"
                  style={{ color: goal.color }}
                >
                  {goal.progress.percentage.toFixed(0)}%
                </span>
              </div>
              <div className="w-full h-2 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
                <div
                  className="h-full rounded-full transition-all duration-500"
                  style={{
                    width: `${Math.min(goal.progress.percentage, 100)}%`,
                    backgroundColor: goal.color,
                  }}
                />
              </div>
              <div className="flex justify-between mt-1">
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  Rs{" "}
                  {goal.progress.current_amount.toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </span>
                <span className="text-[10px] text-gray-400 dark:text-gray-500">
                  Rs{" "}
                  {goal.progress.target_amount.toLocaleString("en-US", {
                    minimumFractionDigits: 0,
                    maximumFractionDigits: 0,
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
