import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from "recharts";
import type { TagSpending } from "../types/tag";

interface TagSpendingChartProps {
  startDate: string;
  endDate: string;
}

export default function TagSpendingChart({
  startDate,
  endDate,
}: TagSpendingChartProps) {
  const [data, setData] = useState<TagSpending[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    loadData();
  }, [startDate, endDate]);

  const loadData = async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await invoke<TagSpending[]>("get_spending_by_tag", {
        startDate,
        endDate,
      });
      // We'll calculate percentage client-side based on the sum of expenses
      // If we want to show income too, we could have a toggle, but usually "spending" implies expense.
      // For now, let's just focus on total_expense since tags are mostly for trips/projects.
      const totalExpenseSum = result.reduce((sum, item) => sum + item.total_expense, 0);
      
      const enrichedData = result
        .filter(item => item.total_expense > 0)
        .map(item => ({
          ...item,
          percentage: totalExpenseSum > 0 ? (item.total_expense / totalExpenseSum) * 100 : 0
        }))
        .sort((a, b) => b.total_expense - a.total_expense); // Sort by highest expense

      setData(enrichedData);
    } catch (err) {
      setError(err as string);
      console.error("Failed to load tag spending:", err);
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
      <div className="flex items-center justify-center p-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700 h-80">
        <div className="text-center">
          <p className="text-gray-900 dark:text-gray-100 font-medium mb-1">
            No tag spending found
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            You don't have any expense transactions with tags for this period.
          </p>
        </div>
      </div>
    );
  }

  const chartData = data.map((item) => ({
    name: item.tag_name,
    value: item.total_expense,
    percentage: item.percentage,
    count: item.transaction_count,
    color: item.tag_color,
  }));

  const renderLabel = (entry: any) => {
    return `${entry.percentage.toFixed(1)}%`;
  };

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
             <span className="w-3 h-3 rounded-full" style={{ backgroundColor: data.color }} />
             <p className="font-semibold text-gray-900 dark:text-white">
               {data.name}
             </p>
          </div>
          <p className="text-sm text-gray-600 dark:text-gray-400">
            Amount:{" "}
            <span className="font-medium text-gray-900 dark:text-white">
              Rs {data.value.toLocaleString("en-US", { minimumFractionDigits: 2 })}
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
            {chartData.map((entry, index) => (
              <Cell
                key={`cell-${index}`}
                fill={entry.color || "#8884d8"}
              />
            ))}
          </Pie>
          <Tooltip content={<CustomTooltip />} />
        </PieChart>
      </ResponsiveContainer>

      {/* Legend with amounts */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        {data.map((item) => (
          <div
            key={item.tag_id}
            className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <div className="flex items-center gap-3">
              <div
                className="w-4 h-4 rounded-full flex-shrink-0"
                style={{ backgroundColor: item.tag_color }}
              />
              <div>
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  {item.tag_name}
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
                {item.total_expense.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </p>
              <p className="text-xs text-gray-600 dark:text-gray-400">
                {item.percentage?.toFixed(1) || "0.0"}%
              </p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
