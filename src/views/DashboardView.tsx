// File: src/views/DashboardView.tsx
import {
  BanknotesIcon,
  ArrowTrendingUpIcon,
  ArrowTrendingDownIcon,
  WalletIcon,
} from "@heroicons/react/24/outline";
import StatCard from "../components/StatCard";

export default function DashboardView() {
  return (
    <div className="p-8">
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Dashboard
        </h1>
        <p className="mt-1 text-gray-600 dark:text-gray-400">
          Welcome back! Here's your financial overview
        </p>
      </div>

      {/* Stats Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <StatCard
          title="Total Balance"
          value="₨ 125,430"
          icon={<WalletIcon className="h-6 w-6" />}
          color="blue"
          trend={{ value: "12.5%", isPositive: true }}
        />
        <StatCard
          title="Income (Month)"
          value="₨ 85,000"
          icon={<ArrowTrendingUpIcon className="h-6 w-6" />}
          color="green"
          trend={{ value: "8.2%", isPositive: true }}
        />
        <StatCard
          title="Expenses (Month)"
          value="₨ 42,500"
          icon={<ArrowTrendingDownIcon className="h-6 w-6" />}
          color="red"
          trend={{ value: "3.1%", isPositive: false }}
        />
        <StatCard
          title="Net Savings"
          value="₨ 42,500"
          icon={<BanknotesIcon className="h-6 w-6" />}
          color="purple"
          trend={{ value: "15.8%", isPositive: true }}
        />
      </div>

      {/* Placeholder for future components */}
      <div className="bg-white dark:bg-gray-800 rounded-xl shadow-sm border border-gray-200 dark:border-gray-700 p-8">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Recent Transactions
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          Transaction list coming soon...
        </p>
      </div>
    </div>
  );
}
