// File: src/components/CategorySpendingChart.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";

interface CategorySpending {
  category_id: number;
  category_name: string;
  total_amount: number;
  transaction_count: number;
  percentage: number;
}

interface CategorySpendingChartProps {
  startDate: string;
  endDate: string;
  transactionType: "INCOME" | "EXPENSE";
}

const COLORS = [
  "#3b82f6", // blue
  "#ef4444", // red
  "#10b981", // green
  "#f59e0b", // amber
  "#8b5cf6", // violet
  "#ec4899", // pink
  "#06b6d4", // cyan
  "#f97316", // orange
  "#84cc16", // lime
  "#6366f1", // indigo
];

export default function CategorySpendingChart({
  startDate,
  endDate,
  transactionType,
}: CategorySpendingChartProps) {
  const [data, setData] = useState<CategorySpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [startDate, endDate, transactionType]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<CategorySpending[]>("get_category_spending", {
        startDate,
        endDate,
        transactionType,
      });
      setData(result);
    } catch (err) {
      setError(err as string);
      console.error("Failed to load category spending:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex items-center justify-center h-80">
        <p className="text-red-600 dark:text-red-400">{error}</p>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80">
        <p className="text-gray-600 dark:text-gray-400">
          No {transactionType.toLowerCase()} data for this period
        </p>
      </div>
    );
  }

  // Format data for recharts
  const chartData = data.map((item) => ({
    name: item.category_name,
    value: item.total_amount,
    percentage: item.percentage,
    count: item.transaction_count,
  }));

  // Custom label for the pie slices
  const renderLabel = (entry: any) => {
    return `${entry.percentage.toFixed(1)}%`;
  };

  // Custom tooltip
  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-white mb-2">
            {data.name}
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Amount:{" "}
            <span className="font-medium text-gray-900 dark:text-white">
              Rs{" "}
              {data.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
            </span>
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Percentage:{" "}
            <span className="font-medium text-gray-900 dark:text-white">
              {data.percentage.toFixed(1)}%
            </span>
          </p>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Transactions:{" "}
            <span className="font-medium text-gray-900 dark:text-white">
              {data.count}
            </span>
          </p>
        </div>
      );
    }
    return null;
  };

  return (
    <div className="space-y-6">
      {/* Chart */}
      <ResponsiveContainer width="100%" height={300}>
        <PieChart>
          <Pie
            data={chartData}
            cx="50%"
            cy="50%"
            labelLine={false}
            label={renderLabel}
            outerRadius={100}
            innerRadius={60}
            fill="#8884d8"
            dataKey="value"
            paddingAngle={2}
          >
            {chartData.map((_entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={COLORS[index % COLORS.length]}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend with amounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.map((item, index) => (
          <div
            key={item.category_id}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: COLORS[index % COLORS.length] }}
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {item.category_name}
                </p>
                <p className="text-xs text-gray-600 dark:text-gray-400">
                  {item.transaction_count}{" "}
                  {item.transaction_count === 1
                    ? "transaction"
                    : "transactions"}
                </p>
              </div>
            </div>
            <div className="text-right">
              <p className="text-sm font-semibold text-gray-900 dark:text-white">
                Rs{" "}
                {item.total_amount.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {item.percentage.toFixed(1)}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
