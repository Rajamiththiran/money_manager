// File: src/components/NetWorthChart.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  ComposedChart,
  Line,
} from "recharts";
import { useCurrency } from "../hooks/useCurrency";
import type { NetWorthSnapshot } from "../types/analytics";

type TimeRange = "3M" | "6M" | "1Y" | "ALL";

const RANGE_MONTHS: Record<TimeRange, number | null> = {
  "3M": 3,
  "6M": 6,
  "1Y": 12,
  ALL: null,
};

export default function NetWorthChart() {
  const { formatAmount } = useCurrency();
  const [snapshots, setSnapshots] = useState<NetWorthSnapshot[]>([]);
  const [range, setRange] = useState<TimeRange>("1Y");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadSnapshots();
  }, [range]);

  const loadSnapshots = async () => {
    setLoading(true);
    try {
      const months = RANGE_MONTHS[range];
      const data = await invoke<NetWorthSnapshot[]>("get_net_worth_snapshots", {
        months: months ?? 120, // 10 years max for "ALL"
      });
      setSnapshots(data);
    } catch (err) {
      console.error("Failed to load net worth snapshots:", err);
    } finally {
      setLoading(false);
    }
  };

  // Chart data
  const chartData = snapshots.map((s) => ({
    date: s.snapshot_date.substring(0, 7), // YYYY-MM
    label: formatMonthLabel(s.snapshot_date),
    assets: s.total_assets,
    liabilities: s.total_liabilities,
    netWorth: s.net_worth,
  }));

  // Summary stats
  const netWorths = snapshots.map((s) => s.net_worth);
  const current = netWorths.length > 0 ? netWorths[netWorths.length - 1] : 0;
  const peak = netWorths.length > 0 ? Math.max(...netWorths) : 0;
  const lowest = netWorths.length > 0 ? Math.min(...netWorths) : 0;
  const average =
    netWorths.length > 0
      ? netWorths.reduce((a, b) => a + b, 0) / netWorths.length
      : 0;

  const CustomTooltip = ({ active, payload }: any) => {
    if (active && payload && payload.length) {
      const d = payload[0].payload;
      return (
        <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700">
          <p className="font-semibold text-gray-900 dark:text-white mb-2">
            {d.label}
          </p>
          <div className="space-y-1 text-sm">
            <p>
              <span className="text-blue-600 dark:text-blue-400">Assets:</span>{" "}
              <span className="font-medium">{formatAmount(d.assets)}</span>
            </p>
            <p>
              <span className="text-red-600 dark:text-red-400">
                Liabilities:
              </span>{" "}
              <span className="font-medium">{formatAmount(d.liabilities)}</span>
            </p>
            <p className="border-t border-gray-200 dark:border-gray-700 pt-1 mt-1">
              <span className="text-purple-600 dark:text-purple-400">
                Net Worth:
              </span>{" "}
              <span className="font-bold">{formatAmount(d.netWorth)}</span>
            </p>
          </div>
        </div>
      );
    }
    return null;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-80">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
      </div>
    );
  }

  if (snapshots.length === 0) {
    return (
      <div className="flex items-center justify-center h-80">
        <p className="text-gray-500 dark:text-gray-400">
          No net worth history yet. Snapshots are generated monthly.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Time range selector */}
      <div className="flex items-center justify-between">
        <div className="flex gap-1">
          {(["3M", "6M", "1Y", "ALL"] as TimeRange[]).map((r) => (
            <button
              key={r}
              onClick={() => setRange(r)}
              className={`px-3 py-1.5 text-xs font-medium rounded-lg transition-colors ${
                range === r
                  ? "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-300"
                  : "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-600"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <SummaryCard label="Current" value={formatAmount(current)} />
        <SummaryCard label="Peak" value={formatAmount(peak)} />
        <SummaryCard label="Lowest" value={formatAmount(lowest)} />
        <SummaryCard label="Average" value={formatAmount(average)} />
      </div>

      {/* Chart */}
      <ResponsiveContainer width="100%" height={400}>
        <ComposedChart data={chartData}>
          <CartesianGrid strokeDasharray="3 3" className="opacity-30" />
          <XAxis
            dataKey="date"
            tick={{ fill: "#6B7280", fontSize: 12 }}
            tickLine={false}
            tickFormatter={(v) => {
              const parts = v.split("-");
              const monthNames = [
                "Jan",
                "Feb",
                "Mar",
                "Apr",
                "May",
                "Jun",
                "Jul",
                "Aug",
                "Sep",
                "Oct",
                "Nov",
                "Dec",
              ];
              return monthNames[parseInt(parts[1], 10) - 1] || v;
            }}
          />
          <YAxis
            tick={{ fill: "#6B7280", fontSize: 12 }}
            tickLine={false}
            tickFormatter={(value) => {
              if (Math.abs(value) >= 1000000)
                return `${(value / 1000000).toFixed(1)}M`;
              if (Math.abs(value) >= 1000)
                return `${(value / 1000).toFixed(0)}k`;
              return value.toString();
            }}
          />
          <Tooltip content={<CustomTooltip />} />
          <Legend />
          <Area
            type="monotone"
            dataKey="assets"
            fill="#3B82F6"
            fillOpacity={0.15}
            stroke="#3B82F6"
            strokeWidth={1.5}
            name="Assets"
          />
          <Area
            type="monotone"
            dataKey="liabilities"
            fill="#EF4444"
            fillOpacity={0.1}
            stroke="#EF4444"
            strokeWidth={1.5}
            name="Liabilities"
          />
          <Line
            type="monotone"
            dataKey="netWorth"
            stroke="#8B5CF6"
            strokeWidth={3}
            dot={{ fill: "#8B5CF6", strokeWidth: 2, r: 3 }}
            activeDot={{ r: 6 }}
            name="Net Worth"
          />
        </ComposedChart>
      </ResponsiveContainer>
    </div>
  );
}

function SummaryCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-gray-50 dark:bg-gray-700/50 rounded-lg p-4">
      <p className="text-xs font-medium text-gray-500 dark:text-gray-400">
        {label}
      </p>
      <p className="mt-1 text-lg font-bold text-gray-900 dark:text-white">
        {value}
      </p>
    </div>
  );
}

function formatMonthLabel(dateStr: string): string {
  const monthNames = [
    "January",
    "February",
    "March",
    "April",
    "May",
    "June",
    "July",
    "August",
    "September",
    "October",
    "November",
    "December",
  ];
  const parts = dateStr.split("-");
  const monthIdx = parseInt(parts[1], 10) - 1;
  return `${monthNames[monthIdx]} ${parts[0]}`;
}
