// File: src/components/Sidebar.tsx
import { useState } from "react";
import {
  HomeIcon,
  ChartBarIcon,
  WalletIcon,
  Cog6ToothIcon,
  Bars3Icon,
  XMarkIcon,
  FolderIcon,
  CurrencyDollarIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import ThemeToggle from "./ThemeToggle";
import type { View } from "../types/navigation";

interface SidebarProps {
  currentView: View;
  onViewChange: (view: View) => void;
}

export default function Sidebar({ currentView, onViewChange }: SidebarProps) {
  const [isOpen, setIsOpen] = useState(true);

  const navigation = [
    { name: "Dashboard", icon: HomeIcon, view: "dashboard" as View },
    { name: "Accounts", icon: WalletIcon, view: "accounts" as View },
    { name: "Categories", icon: FolderIcon, view: "categories" as View },
    { name: "Transactions", icon: ChartBarIcon, view: "transactions" as View },
    { name: "Budgets", icon: CurrencyDollarIcon, view: "budgets" as View },
    { name: "Reports", icon: ChartBarIcon, view: "reports" as View },
    { name: "Settings", icon: Cog6ToothIcon, view: "settings" as View },
  ];

  return (
    <>
      {/* Mobile toggle */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="lg:hidden fixed top-4 left-4 z-50 p-2 rounded-lg bg-white dark:bg-gray-800 shadow-lg border border-gray-200 dark:border-gray-700"
      >
        {isOpen ? (
          <XMarkIcon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
        ) : (
          <Bars3Icon className="h-6 w-6 text-gray-700 dark:text-gray-300" />
        )}
      </button>

      {/* Sidebar */}
      <aside
        className={clsx(
          "fixed lg:static inset-y-0 left-0 z-40 w-64 bg-white dark:bg-gray-800 border-r border-gray-200 dark:border-gray-700 transition-transform duration-300 ease-in-out",
          {
            "-translate-x-full lg:translate-x-0": !isOpen,
            "translate-x-0": isOpen,
          },
        )}
      >
        <div className="flex flex-col h-full">
          {/* Logo */}
          <div className="flex items-center justify-between px-6 py-6 border-b border-gray-200 dark:border-gray-700">
            <h1 className="text-2xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Money Manager
            </h1>
          </div>

          {/* Navigation */}
          <nav className="flex-1 px-4 py-6 space-y-2 overflow-y-auto">
            {navigation.map((item) => {
              const Icon = item.icon;
              const isActive = currentView === item.view;

              return (
                <button
                  key={item.name}
                  onClick={() => {
                    onViewChange(item.view);
                    if (window.innerWidth < 1024) {
                      setIsOpen(false);
                    }
                  }}
                  className={clsx(
                    "w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all font-medium",
                    {
                      "bg-blue-50 dark:bg-blue-900/20 text-blue-600 dark:text-blue-400":
                        isActive,
                      "text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700":
                        !isActive,
                    },
                  )}
                >
                  <Icon className="h-5 w-5 flex-shrink-0" />
                  <span>{item.name}</span>
                </button>
              );
            })}
          </nav>

          {/* Theme Toggle */}
          <div className="px-6 py-4 border-t border-gray-200 dark:border-gray-700">
            <div className="flex items-center justify-between">
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300">
                Theme
              </span>
              <ThemeToggle />
            </div>
          </div>
        </div>
      </aside>

      {/* Overlay for mobile */}
      {isOpen && (
        <div
          className="lg:hidden fixed inset-0 bg-black/50 z-30"
          onClick={() => setIsOpen(false)}
        />
      )}
    </>
  );
}
