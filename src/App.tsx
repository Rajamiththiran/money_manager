// File: src/App.tsx
import { useState, useEffect } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import Sidebar from "./components/Sidebar";
import DashboardView from "./views/DashboardView";
import AccountsView from "./views/AccountsView";
import CategoriesView from "./views/CategoriesView";
import TransactionsView from "./views/TransactionsView";
import BudgetView from "./views/BudgetView";
import AdvancedView from "./views/AdvancedView";
import ReportsView from "./views/ReportsView";
import type { View } from "./types/navigation";

function AppContent() {
  const [currentView, setCurrentView] = useState<View>("dashboard");

  useEffect(() => {
    // Listen for navigation events from templates
    const handleNavigate = () => {
      setCurrentView("transactions");
    };

    window.addEventListener("navigate-to-transactions", handleNavigate);
    return () => {
      window.removeEventListener("navigate-to-transactions", handleNavigate);
    };
  }, []);

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardView />;
      case "accounts":
        return <AccountsView />;
      case "categories":
        return <CategoriesView />;
      case "transactions":
        return <TransactionsView />;
      case "budgets":
        return <BudgetView />;
      case "advanced":
        return <AdvancedView />;
      case "reports":
        return <ReportsView />;
      case "settings":
        return (
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Settings
            </h1>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Coming soon...
            </p>
          </div>
        );
      default:
        return <DashboardView />;
    }
  };

  return (
    <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
      <Sidebar currentView={currentView} onViewChange={setCurrentView} />
      <main className="flex-1 overflow-y-auto">{renderView()}</main>
    </div>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AppContent />
    </ThemeProvider>
  );
}

export default App;
