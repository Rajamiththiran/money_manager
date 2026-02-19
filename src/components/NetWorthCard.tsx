// File: src/components/NetWorthCard.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import {
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
} from "@heroicons/react/24/outline";
import { useCurrency } from "../hooks/useCurrency";
import type { NetWorthSummary } from "../types/analytics";

export default function NetWorthCard() {
  const { formatAmount } = useCurrency();
  const [data, setData] = useState<NetWorthSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNetWorth();
  }, []);

  // Listen for refreshes after quick-add
  useEffect(() => {
    const handle = () => loadNetWorth();
    window.addEventListener("refresh-net-worth", handle);
    return () => window.removeEventListener("refresh-net-worth", handle);
  }, []);

  const loadNetWorth = async () => {
    try {
      const result = await invoke<NetWorthSummary>("get_current_net_worth");
      setData(result);
    } catch (err) {
      console.error("Failed to load net worth:", err);
    } finally {
      setLoading(false);
    }
  };

  if (loading) {
    return (
      <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm border border-indigo-400/20 p-6 mb-6 animate-pulse">
        <div className="h-6 bg-white/20 rounded w-32 mb-3" />
        <div className="h-10 bg-white/20 rounded w-48 mb-2" />
        <div className="h-4 bg-white/20 rounded w-64" />
      </div>
    );
  }

  if (!data) return null;

  const isPositive = data.change_amount >= 0;

  return (
    <div className="bg-gradient-to-br from-indigo-500 to-purple-600 rounded-xl shadow-sm p-6 mb-6 text-white">
      <div className="flex items-start justify-between">
        <div>
          <p className="text-sm font-medium text-indigo-100">Net Worth</p>
          <p className="mt-1 text-3xl font-bold">
            {formatAmount(data.net_worth)}
          </p>
          <div className="mt-2 flex items-center gap-4 text-sm text-indigo-100">
            <span>Assets: {formatAmount(data.assets)}</span>
            <span className="text-indigo-300">|</span>
            <span>Liabilities: {formatAmount(data.liabilities)}</span>
          </div>
        </div>

        {/* Change indicator */}
        <div
          className={`flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm font-medium ${
            isPositive
              ? "bg-green-500/20 text-green-100"
              : "bg-red-500/20 text-red-100"
          }`}
        >
          {isPositive ? (
            <ArrowTrendingUpIcon className="h-4 w-4" />
          ) : (
            <ArrowTrendingDownIcon className="h-4 w-4" />
          )}
          <span>
            {formatAmount(Math.abs(data.change_amount))} (
            {data.change_percentage >= 0 ? "+" : ""}
            {data.change_percentage.toFixed(1)}%)
          </span>
        </div>
      </div>
    </div>
  );
}
