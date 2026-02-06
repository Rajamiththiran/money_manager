// File: src/components/Sidebar.tsx
import ThemeToggle from "./ThemeToggle";
import type { View } from "../types/navigation";

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

export default function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const menuItems = [
    { id: "dashboard", label: "Dashboard", icon: "📊" },
    { id: "accounts", label: "Accounts", icon: "🏦" },
    { id: "categories", label: "Categories", icon: "📁" },
    { id: "transactions", label: "Transactions", icon: "💸" },
    { id: "budgets", label: "Budgets", icon: "🎯" },
    { id: "advanced", label: "Advanced", icon: "⚙️" },
    { id: "reports", label: "Reports", icon: "📈" },
  ];

  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
          💰 Money Manager
        </h1>
      </div>

      <nav className="flex-1 p-4">
        <ul className="space-y-2">
          {menuItems.map((item) => (
            <li key={item.id}>
              <button
                onClick={() => onViewChange(item.id as View)}
                className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-colors ${
                  currentView === item.id
                    ? "bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 font-medium"
                    : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }`}
              >
                <span className="text-xl">{item.icon}</span>
                <span>{item.label}</span>
              </button>
            </li>
          ))}
        </ul>
      </nav>

      {/* Settings + Theme at bottom */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <button
          onClick={() => onViewChange("settings" as View)}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
            currentView === "settings"
              ? "bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 font-medium"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          }`}
        >
          <span className="text-xl">⚙️</span>
          <span className="text-sm">Settings</span>
        </button>
        <ThemeToggle />
      </div>
    </aside>
  );
}
