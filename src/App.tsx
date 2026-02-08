// File: src/App.tsx
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import { ThemeProvider } from "./contexts/ThemeContext";
import { AccentColorProvider } from "./contexts/AccentColorContext";
import { ToastProvider } from "./components/Toast";
import LockScreen from "./components/LockScreen";
import Sidebar from "./components/Sidebar";
import DashboardView from "./views/DashboardView";
import AccountsView from "./views/AccountsView";
import CategoriesView from "./views/CategoriesView";
import TransactionsView from "./views/TransactionsView";
import BudgetView from "./views/BudgetView";
import AdvancedView from "./views/AdvancedView";
import ReportsView from "./views/ReportsView";
import SettingsView from "./views/SettingsView";
import type { View } from "./types/navigation";

function AppContent() {
  const [currentView, setCurrentView] = useState<View>("dashboard");
  const [isLocked, setIsLocked] = useState(false);
  const [pinEnabled, setPinEnabled] = useState(false);
  const [lockTimeout, setLockTimeout] = useState(5);
  const [isCheckingLock, setIsCheckingLock] = useState(true);
  const lastActivityRef = useRef(Date.now());
  const lockTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // Check if PIN is enabled on mount
  useEffect(() => {
    const checkPinStatus = async () => {
      try {
        const enabled = await invoke<boolean>("is_pin_enabled");
        setPinEnabled(enabled);
        if (enabled) {
          setIsLocked(true);
          const timeout = await invoke<number>("get_lock_timeout");
          setLockTimeout(timeout);
        }
      } catch (err) {
        console.error("Failed to check PIN status:", err);
      } finally {
        setIsCheckingLock(false);
      }
    };
    checkPinStatus();
  }, []);

  // Track user activity
  const resetActivityTimer = useCallback(() => {
    lastActivityRef.current = Date.now();
  }, []);

  // Listen for user activity events
  useEffect(() => {
    if (!pinEnabled || lockTimeout === 0) return;

    const events = ["mousedown", "keydown", "scroll", "touchstart"];
    events.forEach((event) => {
      window.addEventListener(event, resetActivityTimer);
    });

    return () => {
      events.forEach((event) => {
        window.removeEventListener(event, resetActivityTimer);
      });
    };
  }, [pinEnabled, lockTimeout, resetActivityTimer]);

  // Auto-lock timer
  useEffect(() => {
    if (!pinEnabled || lockTimeout === 0 || isLocked) {
      if (lockTimerRef.current) {
        clearInterval(lockTimerRef.current);
        lockTimerRef.current = null;
      }
      return;
    }

    lockTimerRef.current = setInterval(() => {
      const elapsed = Date.now() - lastActivityRef.current;
      const timeoutMs = lockTimeout * 60 * 1000;
      if (elapsed >= timeoutMs) {
        setIsLocked(true);
      }
    }, 5000); // Check every 5 seconds

    return () => {
      if (lockTimerRef.current) {
        clearInterval(lockTimerRef.current);
      }
    };
  }, [pinEnabled, lockTimeout, isLocked]);

  // Lock on window blur (user switches app)
  useEffect(() => {
    if (!pinEnabled || lockTimeout === 0) return;

    const handleBlur = () => {
      // Only lock on blur if timeout is short (1 min or less)
      if (lockTimeout <= 1) {
        setIsLocked(true);
      }
    };

    window.addEventListener("blur", handleBlur);
    return () => window.removeEventListener("blur", handleBlur);
  }, [pinEnabled, lockTimeout]);

  // Listen for lock-app event (from settings when PIN is changed)
  useEffect(() => {
    const handleLockApp = () => {
      setIsLocked(true);
      setPinEnabled(true);
    };

    const handlePinRemoved = () => {
      setIsLocked(false);
      setPinEnabled(false);
    };

    const handleTimeoutChanged = (e: Event) => {
      const customEvent = e as CustomEvent<number>;
      setLockTimeout(customEvent.detail);
    };

    window.addEventListener("lock-app", handleLockApp);
    window.addEventListener("pin-removed", handlePinRemoved);
    window.addEventListener("lock-timeout-changed", handleTimeoutChanged);

    return () => {
      window.removeEventListener("lock-app", handleLockApp);
      window.removeEventListener("pin-removed", handlePinRemoved);
      window.removeEventListener("lock-timeout-changed", handleTimeoutChanged);
    };
  }, []);

  useEffect(() => {
    const handleNavigate = () => {
      setCurrentView("transactions");
    };
    window.addEventListener("navigate-to-transactions", handleNavigate);
    return () => {
      window.removeEventListener("navigate-to-transactions", handleNavigate);
    };
  }, []);

  const handleUnlock = useCallback(() => {
    setIsLocked(false);
    lastActivityRef.current = Date.now();
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
        return <SettingsView />;
      default:
        return <DashboardView />;
    }
  };

  // Show nothing while checking lock status
  if (isCheckingLock) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-900">
        <div className="w-8 h-8 border-2 border-gray-600 border-t-white rounded-full animate-spin" />
      </div>
    );
  }

  return (
    <>
      {isLocked && pinEnabled && <LockScreen onUnlock={handleUnlock} />}
      <div className="flex h-screen bg-gray-50 dark:bg-gray-900">
        <Sidebar currentView={currentView} onViewChange={setCurrentView} />
        <main className="flex-1 overflow-y-auto">{renderView()}</main>
      </div>
    </>
  );
}

function App() {
  return (
    <ThemeProvider>
      <AccentColorProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </AccentColorProvider>
    </ThemeProvider>
  );
}

export default App;
