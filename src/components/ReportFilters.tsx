// File: src/components/ReportFilters.tsx
import { useState } from "react";
import Input from "./Input";
import Select from "./Select";
import Button from "./Button";
import type { ReportFilters as ReportFiltersType } from "../types/report";

interface ReportFiltersProps {
  filters: ReportFiltersType;
  onFilterChange: (filters: ReportFiltersType) => void;
}

export default function ReportFilters({
  filters,
  onFilterChange,
}: ReportFiltersProps) {
  const [localFilters, setLocalFilters] = useState<ReportFiltersType>(filters);

  const handlePeriodChange = (period: ReportFiltersType["period"]) => {
    const now = new Date();
    let startDate: Date;
    let endDate: Date = now;

    switch (period) {
      case "daily":
        startDate = now;
        break;
      case "weekly":
        startDate = new Date(now);
        startDate.setDate(now.getDate() - 7);
        break;
      case "monthly":
        startDate = new Date(now.getFullYear(), now.getMonth(), 1);
        endDate = new Date(now.getFullYear(), now.getMonth() + 1, 0);
        break;
      case "yearly":
        startDate = new Date(now.getFullYear(), 0, 1);
        endDate = new Date(now.getFullYear(), 11, 31);
        break;
      case "custom":
      default:
        startDate = new Date(localFilters.startDate);
        endDate = new Date(localFilters.endDate);
    }

    const newFilters = {
      ...localFilters,
      period,
      startDate: startDate.toISOString().split("T")[0],
      endDate: endDate.toISOString().split("T")[0],
    };

    setLocalFilters(newFilters);
    onFilterChange(newFilters);
  };

  const handleDateChange = (field: "startDate" | "endDate", value: string) => {
    const newFilters = {
      ...localFilters,
      [field]: value,
      period: "custom" as const,
    };
    setLocalFilters(newFilters);
  };

  const handleApplyFilters = () => {
    onFilterChange(localFilters);
  };

  const periodOptions = [
    { value: "daily", label: "Today" },
    { value: "weekly", label: "Last 7 Days" },
    { value: "monthly", label: "This Month" },
    { value: "yearly", label: "This Year" },
    { value: "custom", label: "Custom Range" },
  ];

  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 p-4">
      <div className="flex flex-wrap items-end gap-4">
        {/* Period Selector */}
        <div className="min-w-[150px]">
          <Select
            label="Period"
            value={localFilters.period}
            onChange={(e) =>
              handlePeriodChange(e.target.value as ReportFiltersType["period"])
            }
            options={periodOptions}
          />
        </div>

        {/* Date Range */}
        <div className="min-w-[150px]">
          <Input
            label="Start Date"
            type="date"
            value={localFilters.startDate}
            onChange={(e) => handleDateChange("startDate", e.target.value)}
          />
        </div>

        <div className="min-w-[150px]">
          <Input
            label="End Date"
            type="date"
            value={localFilters.endDate}
            onChange={(e) => handleDateChange("endDate", e.target.value)}
          />
        </div>

        {/* Apply Button */}
        {localFilters.period === "custom" && (
          <Button onClick={handleApplyFilters}>Apply Filters</Button>
        )}
      </div>

      {/* Active Filter Summary */}
      <div className="mt-3 pt-3 border-t border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-600 dark:text-gray-400">
          Showing data from{" "}
          <span className="font-medium text-gray-900 dark:text-white">
            {new Date(localFilters.startDate).toLocaleDateString()}
          </span>{" "}
          to{" "}
          <span className="font-medium text-gray-900 dark:text-white">
            {new Date(localFilters.endDate).toLocaleDateString()}
          </span>
        </p>
      </div>
    </div>
  );
}
