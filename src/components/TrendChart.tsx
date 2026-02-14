// File: src/components/TrendChart.tsx
import {
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  Area,
  ComposedChart,
} from "recharts";
import type { MonthlyTrend } from "../types/report";

interface TrendChartProps {
  data: MonthlyTrend[];
}

export default function TrendChart({ data }: TrendChartProps) {
  if (data.length === 0) {
    return (
      <div className="flex items-center justify-center h-80">
        <p className="text-gray-500 dark:text-gray-400">
          No trend data available
        </p>
      </div>
    );
  }

  // Format data for the chart
  const chartData = data.map((item) => ({
    name: item.month_name.split(" ")[0].substring(0, 3), // "Jan", "Feb", etc.
    fullName: item.month_name,
    income: item.income,
    expense: item.expense,
    net: item.net,
  }));

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const data = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-white mb-2">
            {data.fullName}
          </p>
          <div className="space-y-1">
            <p className="text-sm">
              <span className="text-green-600 dark:text-green-400">
                Income:
              </span>{" "}
              <span className="font-medium">
                Rs{" "}
                {data.income.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </p>
            <p className="text-sm">
              <span className="text-red-600 dark:text-red-400">Expense:</span>{" "}
              <span className="font-medium">
                Rs{" "}
                {data.expense.toLocaleString("en-US", {
                  minimumFractionDigits: 2,
                })}
              </span>
            </p>
            <p className="text-sm border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
              <span
                className={
                  data.net >= 0
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-orange-600 dark:text-orange-400"
                }
              >
                Net:
              </span>{" "}
              <span className="font-medium">
                Rs{" "}
                {data.net.toLocaleString("en-US", { minimumFractionDigits: 2 })}
              </span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  return (
    <ResponsiveContainer width="100%" height={350}>
      <ComposedChart data={chartData}>
        <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
        <XAxis
          dataKey="name"
          tick={{ fill: "#6B7280", fontSize: 12 }}
          tickLine={false}
        />
        <YAxis
          tick={{ fill: "#6B7280", fontSize: 12 }}
          tickLine={false}
          tickFormatter={(value) => `${(value / 1000).toFixed(0)}k`}
        />
        <Tooltip content={<CustomTooltip />} />
        <Legend />
        <Area
          type="monotone"
          dataKey="net"
          fill="#3B82F6"
          fillOpacity={0.1}
          stroke="transparent"
          name="Net Savings"
        />
        <Line
          type="monotone"
          dataKey="income"
          stroke="#10B981"
          strokeWidth={2}
          dot={{ fill: "#10B981", strokeWidth: 2 }}
          activeDot={{ r: 6 }}
          name="Income"
        />
        <Line
          type="monotone"
          dataKey="expense"
          stroke="#EF4444"
          strokeWidth={2}
          dot={{ fill: "#EF4444", strokeWidth: 2 }}
          activeDot={{ r: 6 }}
          name="Expense"
        />
      </ComposedChart>
    </ResponsiveContainer>
  );
}
