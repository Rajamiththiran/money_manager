// File: src/components/Sidebar.tsx
import { useState } from "react";
import {
  ChartBarIcon,
  BuildingLibraryIcon,
  FolderIcon,
  BanknotesIcon,
  ChartPieIcon,
  WrenchScrewdriverIcon,
  DocumentChartBarIcon,
  Cog6ToothIcon,
  CreditCardIcon,
  CameraIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  TrophyIcon,
} from "@heroicons/react/24/outline";
import ThemeToggle from "./ThemeToggle";
import type { View } from "../types/navigation";

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
  overdueBillCount?: number;
}

const menuItems: { id: View; label: string; icon: React.ElementType }[] = [
  { id: "dashboard", label: "Dashboard", icon: ChartBarIcon },
  { id: "accounts", label: "Accounts", icon: BuildingLibraryIcon },
  { id: "categories", label: "Categories", icon: FolderIcon },
  { id: "transactions", label: "Transactions", icon: BanknotesIcon },
  { id: "receipts", label: "Receipts", icon: CameraIcon },
  { id: "budgets", label: "Budgets", icon: ChartPieIcon },
  { id: "goals", label: "Goals", icon: TrophyIcon },
  { id: "credit-cards", label: "Credit Cards", icon: CreditCardIcon },
  { id: "advanced", label: "Advanced", icon: WrenchScrewdriverIcon },
  { id: "reports", label: "Reports", icon: DocumentChartBarIcon },
];

export default function Sidebar({ currentView, onViewChange, overdueBillCount = 0 }: SidebarProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <aside
      className={`
        flex-shrink-0 bg-white dark:bg-gray-800
        border-r border-gray-200 dark:border-gray-700
        flex flex-col transition-all duration-200
        ${collapsed ? "w-16" : "w-64"}
      `}
    >
      {/* Header */}
      <div
        className={`
          flex items-center border-b border-gray-200 dark:border-gray-700
          ${collapsed ? "p-3 justify-center" : "p-6 justify-between"}
        `}
      >
        {!collapsed && (
          <h1 className="text-xl font-bold text-gray-900 dark:text-white flex items-center gap-2 truncate">
            <BanknotesIcon className="h-7 w-7 text-accent-500 flex-shrink-0" />
            <span className="truncate">Money Manager</span>
          </h1>
        )}
        {collapsed && <BanknotesIcon className="h-7 w-7 text-accent-500" />}
        <button
          onClick={() => setCollapsed((c) => !c)}
          className={`
            flex-shrink-0 p-1 rounded-md
            text-gray-400 hover:text-gray-600 dark:hover:text-gray-300
            hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors
            ${collapsed ? "mt-3" : ""}
          `}
          title={collapsed ? "Expand sidebar" : "Collapse sidebar"}
        >
          {collapsed ? (
            <ChevronRightIcon className="h-4 w-4" />
          ) : (
            <ChevronLeftIcon className="h-4 w-4" />
          )}
        </button>
      </div>

      {/* Nav */}
      <nav className="flex-1 p-2 overflow-y-auto overflow-x-hidden">
        <ul className="space-y-1">
          {menuItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            const showBadge = item.id === "dashboard" && overdueBillCount > 0;
            return (
              <li key={item.id}>
                <button
                  onClick={() => onViewChange(item.id)}
                  title={collapsed ? item.label : undefined}
                  className={`
                    w-full flex items-center rounded-lg transition-colors relative
                    ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5"}
                    ${
                      isActive
                        ? "bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 font-medium"
                        : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    }
                  `}
                >
                  <Icon
                    className={`h-5 w-5 flex-shrink-0 ${
                      isActive
                        ? "text-accent-500"
                        : "text-gray-400 dark:text-gray-500"
                    }`}
                  />
                  {!collapsed && (
                    <span className="text-sm truncate">{item.label}</span>
                  )}
                  {showBadge && (
                    <span className={`
                      flex items-center justify-center rounded-full bg-red-500 text-white text-[10px] font-bold
                      ${collapsed
                        ? "absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1"
                        : "ml-auto min-w-[18px] h-[18px] px-1"
                      }
                    `}>
                      {overdueBillCount > 9 ? "9+" : overdueBillCount}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* Bottom: Settings + Theme */}
      <div
        className={`
          border-t border-gray-200 dark:border-gray-700 space-y-2
          ${collapsed ? "p-2" : "p-4"}
        `}
      >
        <button
          onClick={() => onViewChange("settings")}
          title={collapsed ? "Settings" : undefined}
          className={`
            w-full flex items-center rounded-lg transition-colors
            ${collapsed ? "justify-center px-2 py-2.5" : "gap-3 px-4 py-2.5"}
            ${
              currentView === "settings"
                ? "bg-accent-50 dark:bg-accent-900/20 text-accent-600 dark:text-accent-400 font-medium"
                : "text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700/50"
            }
          `}
        >
          <Cog6ToothIcon
            className={`h-5 w-5 flex-shrink-0 ${
              currentView === "settings"
                ? "text-accent-500"
                : "text-gray-400 dark:text-gray-500"
            }`}
          />
          {!collapsed && <span className="text-sm">Settings</span>}
        </button>
        <div className={collapsed ? "flex justify-center" : ""}>
          <ThemeToggle />
        </div>
      </div>
    </aside>
  );
}
