// File: src/components/Sidebar.tsx
import {
  ChartBarIcon,
  BuildingLibraryIcon,
  FolderIcon,
  BanknotesIcon,
  ChartPieIcon,
  WrenchScrewdriverIcon,
  DocumentChartBarIcon,
  Cog6ToothIcon,
} from "@heroicons/react/24/outline";
import ThemeToggle from "./ThemeToggle";
import type { View } from "../types/navigation";

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

const menuItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: ChartBarIcon },
  { id: "accounts", label: "Accounts", icon: BuildingLibraryIcon },
  { id: "categories", label: "Categories", icon: FolderIcon },
  { id: "transactions", label: "Transactions", icon: BanknotesIcon },
  { id: "budgets", label: "Budgets", icon: ChartPieIcon },
  { id: "advanced", label: "Advanced", icon: WrenchScrewdriverIcon },
  { id: "reports", label: "Reports", icon: DocumentChartBarIcon },
];

export default function Sidebar({ currentView, onViewChange }: SidebarProps) {
  return (
    <aside className="w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 flex flex-col">
      <div className="p-6 border-b border-gray-200 dark:border-gray-700">
        <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2">
          <BanknotesIcon className="h-7 w-7 text-accent-500" />
          Money Manager
        </h1>
      </div>

      <nav className="flex-1 p-4 overflow-y-auto">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onViewChange(item.id)}
                  className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
                    isActive
                      ? "bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 font-medium"
                      : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  }`}
                >
                  <Icon
                    className={`h-5 w-5 flex-shrink-0 ${
                      isActive
                        ? "text-accent-500"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  />
                  <span className="text-sm">{item.label}</span>
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Settings + Theme at bottom */}
      <div className="p-4 border-t border-gray-200 dark:border-gray-700 space-y-2">
        <button
          onClick={() => onViewChange("settings")}
          className={`w-full flex items-center gap-3 px-4 py-2.5 rounded-lg transition-colors ${
            currentView === "settings"
              ? "bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 font-medium"
              : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
          }`}
        >
          <Cog6ToothIcon
            className={`h-5 w-5 flex-shrink-0 ${
              currentView === "settings"
                ? "text-accent-500"
                : "text-gray-400 dark:text-gray-500"
            }`}
          />
          <span className="text-sm">Settings</span>
        </button>
        <ThemeToggle />
      </div>
    </aside>
  );
}
