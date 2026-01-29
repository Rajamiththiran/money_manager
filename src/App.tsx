// File: src/App.tsx
import { useState } from "react";
import { ThemeProvider } from "./contexts/ThemeContext";
import Sidebar from "./components/Sidebar";
import DashboardView from "./views/DashboardView";
import AccountsView from "./views/AccountsView";

type View = "dashboard" | "accounts" | "transactions" | "reports" | "settings";

function AppContent() {
  const [currentView, setCurrentView] = useState<View>("dashboard");

  const renderView = () => {
    switch (currentView) {
      case "dashboard":
        return <DashboardView />;
      case "accounts":
        return <AccountsView />;
      case "transactions":
        return (
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Transactions
            </h1>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Coming soon...
            </p>
          </div>
        );
      case "reports":
        return (
          <div className="p-8">
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
              Reports
            </h1>
            <p className="mt-4 text-gray-600 dark:text-gray-400">
              Coming soon...
            </p>
          </div>
        );
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
