// File: src/components/ProgressBar.tsx
import clsx from "clsx";

interface ProgressBarProps {
  percentage: number;
  variant?: "default" | "success" | "warning" | "danger" | "critical";
  showLabel?: boolean;
  height?: "sm" | "md" | "lg";
}

export default function ProgressBar({
  percentage,
  variant = "default",
  showLabel = true,
  height = "md",
}: ProgressBarProps) {
  // Clamp percentage between 0 and 100 for display
  const displayPercentage = Math.min(Math.max(percentage, 0), 100);

  const heightClasses = {
    sm: "h-2",
    md: "h-4",
    lg: "h-6",
  };

  const variantClasses = {
    default: "bg-blue-500",
    success: "bg-green-500",
    warning: "bg-yellow-500",
    danger: "bg-red-500",
    critical: "bg-red-700",
  };

  // Auto-determine variant based on percentage if default
  const autoVariant =
    variant === "default"
      ? percentage >= 120
        ? "critical"
        : percentage >= 100
          ? "danger"
          : percentage >= 80
            ? "warning"
            : "success"
      : variant;

  return (
    <div className="w-full">
      <div
        className={clsx(
          "w-full bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden",
          heightClasses[height],
        )}
      >
        <div
          className={clsx(
            "h-full transition-all duration-300 rounded-full",
            variantClasses[autoVariant],
          )}
          style={{ width: `${displayPercentage}%` }}
        />
      </div>
      {showLabel && (
        <div className="flex items-center justify-between mt-1">
          <span
            className={clsx("text-sm font-medium", {
              "text-green-600 dark:text-green-400": percentage < 80,
              "text-yellow-600 dark:text-yellow-400":
                percentage >= 80 && percentage < 100,
              "text-red-600 dark:text-red-400": percentage >= 100,
            })}
          >
            {percentage.toFixed(1)}% used
          </span>
          {percentage >= 100 && (
            <span className="text-xs font-medium text-red-600 dark:text-red-400">
              Over Budget
            </span>
          )}
        </div>
      )}
    </div>
  );
}
