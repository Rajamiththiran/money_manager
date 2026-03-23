// File: src/components/GoalCard.tsx
import { useState } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  PencilIcon,
  TrashIcon,
  PauseIcon,
  PlayIcon,
  CheckCircleIcon,
  ArchiveBoxIcon,
  PlusIcon,
  ArrowPathIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/24/outline";

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

interface GoalCardProps {
  goal: GoalWithProgress;
  onEdit: (goal: GoalWithProgress) => void;
  onAddContribution: (goal: GoalWithProgress) => void;
  onRefresh: () => void;
}

const ICON_MAP: Record<string, string> = {
  target: "🎯",
  vacation: "✈️",
  car: "🚗",
  home: "🏠",
  education: "🎓",
  emergency: "🛡️",
  gift: "🎁",
  heart: "❤️",
  star: "⭐",
  piggy: "🐷",
};

export default function GoalCard({
  goal,
  onEdit,
  onAddContribution,
  onRefresh,
}: GoalCardProps) {
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  const handleAction = async (
    action: string,
    command: string,
    confirmMsg?: string,
  ) => {
    if (confirmMsg && !window.confirm(confirmMsg)) return;
    setActionLoading(action);
    try {
      await invoke(command, { goalId: goal.id });
      onRefresh();
    } catch (err) {
      console.error(`Failed to ${action} goal:`, err);
    } finally {
      setActionLoading(null);
    }
  };

  const { progress } = goal;
  const iconEmoji = ICON_MAP[goal.icon] || "🎯";
  const isCompleted = goal.status === "COMPLETED";
  const isPaused = goal.status === "PAUSED";
  const isArchived = goal.status === "ARCHIVED";

  return (
    <div
      className={`bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 overflow-hidden transition-all hover:shadow-md ${
        isPaused ? "opacity-75" : ""
      } ${isArchived ? "opacity-60" : ""}`}
    >
      {/* Color bar */}
      <div className="h-1.5" style={{ backgroundColor: goal.color }} />

      <div className="p-5">
        {/* Header */}
        <div className="flex items-start justify-between mb-4">
          <div className="flex items-center gap-3">
            <span className="text-2xl">{iconEmoji}</span>
            <div>
              <h3 className="font-semibold text-gray-900 dark:text-white">
                {goal.name}
              </h3>
              <div className="flex items-center gap-2 mt-0.5">
                <span
                  className={`px-1.5 py-0.5 rounded text-[10px] font-medium ${
                    isCompleted
                      ? "bg-green-100 dark:bg-green-900/30 text-green-600 dark:text-green-400"
                      : isPaused
                        ? "bg-yellow-100 dark:bg-yellow-900/30 text-yellow-600 dark:text-yellow-400"
                        : isArchived
                          ? "bg-gray-100 dark:bg-gray-700 text-gray-500"
                          : "bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400"
                  }`}
                >
                  {goal.status}
                </span>
                {goal.linked_account_name && (
                  <span className="text-[10px] text-gray-400 dark:text-gray-500">
                    Linked: {goal.linked_account_name}
                  </span>
                )}
              </div>
            </div>
          </div>

          {/* On-track indicator */}
          {goal.status === "ACTIVE" && (
            <div
              title={progress.on_track ? "On track" : "Behind schedule"}
            >
              {progress.on_track ? (
                <CheckCircleIcon className="h-5 w-5 text-green-500" />
              ) : (
                <ExclamationTriangleIcon className="h-5 w-5 text-amber-500" />
              )}
            </div>
          )}
        </div>

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex justify-between text-sm mb-1.5">
            <span className="font-medium text-gray-700 dark:text-gray-300">
              Rs{" "}
              {progress.current_amount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
            <span className="text-gray-400 dark:text-gray-500">
              Rs{" "}
              {progress.target_amount.toLocaleString("en-US", {
                minimumFractionDigits: 2,
                maximumFractionDigits: 2,
              })}
            </span>
          </div>
          <div className="w-full h-3 bg-gray-100 dark:bg-gray-700 rounded-full overflow-hidden">
            <div
              className="h-full rounded-full transition-all duration-700 ease-out"
              style={{
                width: `${Math.min(progress.percentage, 100)}%`,
                backgroundColor: goal.color,
              }}
            />
          </div>
          <div className="flex justify-between mt-1.5">
            <span className="text-xs font-semibold" style={{ color: goal.color }}>
              {progress.percentage.toFixed(1)}%
            </span>
            <span className="text-xs text-gray-400 dark:text-gray-500">
              Rs{" "}
              {Math.max(progress.target_amount - progress.current_amount, 0).toLocaleString(
                "en-US",
                { minimumFractionDigits: 2, maximumFractionDigits: 2 },
              )}{" "}
              remaining
            </span>
          </div>
        </div>

        {/* Info row */}
        <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400 mb-4">
          <div>
            {goal.target_date && (
              <span>
                Target:{" "}
                {new Date(goal.target_date).toLocaleDateString("en-US", {
                  month: "short",
                  day: "numeric",
                  year: "numeric",
                })}
                {progress.days_remaining !== null && (
                  <span className={progress.days_remaining < 0 ? "text-red-500" : ""}>
                    {" "}
                    ({progress.days_remaining >= 0
                      ? `${progress.days_remaining}d left`
                      : `${Math.abs(progress.days_remaining)}d overdue`})
                  </span>
                )}
              </span>
            )}
          </div>
          {progress.projected_completion_date && (
            <span>
              Projected:{" "}
              {new Date(progress.projected_completion_date).toLocaleDateString(
                "en-US",
                { month: "short", day: "numeric", year: "numeric" },
              )}
            </span>
          )}
        </div>

        {/* Action buttons */}
        <div className="flex items-center gap-1.5 pt-3 border-t border-gray-100 dark:border-gray-700">
          {goal.status === "ACTIVE" && !goal.linked_account_id && (
            <button
              onClick={() => onAddContribution(goal)}
              className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-medium rounded-lg bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 hover:bg-accent-100 dark:hover:bg-accent-900/30 transition-colors"
            >
              <PlusIcon className="h-3.5 w-3.5" />
              Add
            </button>
          )}

          <button
            onClick={() => onEdit(goal)}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Edit"
          >
            <PencilIcon className="h-4 w-4" />
          </button>

          {goal.status === "ACTIVE" && (
            <>
              <button
                onClick={() => handleAction("pause", "pause_goal")}
                disabled={actionLoading !== null}
                className="p-1.5 rounded-lg text-yellow-500 hover:bg-yellow-50 dark:hover:bg-yellow-900/20 transition-colors"
                title="Pause"
              >
                {actionLoading === "pause" ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <PauseIcon className="h-4 w-4" />
                )}
              </button>
              <button
                onClick={() => handleAction("complete", "complete_goal")}
                disabled={actionLoading !== null}
                className="p-1.5 rounded-lg text-green-500 hover:bg-green-50 dark:hover:bg-green-900/20 transition-colors"
                title="Mark Complete"
              >
                {actionLoading === "complete" ? (
                  <ArrowPathIcon className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircleIcon className="h-4 w-4" />
                )}
              </button>
            </>
          )}

          {goal.status === "PAUSED" && (
            <button
              onClick={() => handleAction("resume", "resume_goal")}
              disabled={actionLoading !== null}
              className="p-1.5 rounded-lg text-blue-500 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              title="Resume"
            >
              {actionLoading === "resume" ? (
                <ArrowPathIcon className="h-4 w-4 animate-spin" />
              ) : (
                <PlayIcon className="h-4 w-4" />
              )}
            </button>
          )}

          <button
            onClick={() => handleAction("archive", "archive_goal")}
            disabled={actionLoading !== null}
            className="p-1.5 rounded-lg text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            title="Archive"
          >
            <ArchiveBoxIcon className="h-4 w-4" />
          </button>

          <button
            onClick={() =>
              handleAction("delete", "delete_goal", "Delete this goal permanently?")
            }
            disabled={actionLoading !== null}
            className="p-1.5 rounded-lg text-red-400 hover:text-red-600 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors ml-auto"
            title="Delete"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Completed celebration overlay */}
      {isCompleted && (
        <div className="absolute inset-0 bg-green-500/5 pointer-events-none rounded-xl" />
      )}
    </div>
  );
}
