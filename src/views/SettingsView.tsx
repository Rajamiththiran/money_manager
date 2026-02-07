// File: src/views/SettingsView.tsx
import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save, open, ask } from "@tauri-apps/plugin-dialog";
import { writeTextFile, readTextFile } from "@tauri-apps/plugin-fs";
import {
  Settings,
  Palette,
  Database,
  Download,
  Upload,
  Trash2,
  Info,
  Sun,
  Moon,
  Check,
  AlertTriangle,
  HardDrive,
  Calendar,
  Hash,
  Clock,
  Shield,
  ChevronRight,
  RefreshCw,
  Lock,
  Eye,
  EyeOff,
} from "lucide-react";
import { useTheme } from "../contexts/ThemeContext";
import { useAccentColor } from "../contexts/AccentColorContext";
import { useToast } from "../components/Toast";
import Button from "../components/Button";
import Select from "../components/Select";

// ——— Settings Types ———————————————————————————————
interface AppSettings {
  currency: string;
  currencySymbol: string;
  dateFormat: string;
  numberFormat: string;
  startOfMonth: number;
  accentColor: string;
  fontSize: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  currency: "LKR",
  currencySymbol: "Rs.",
  dateFormat: "YYYY-MM-DD",
  numberFormat: "1,000.00",
  startOfMonth: 1,
  accentColor: "blue",
  fontSize: "medium",
};

const CURRENCY_OPTIONS = [
  { value: "LKR", label: "LKR - Sri Lankan Rupee (Rs.)" },
  { value: "USD", label: "USD - US Dollar ($)" },
  { value: "EUR", label: "EUR - Euro (€)" },
  { value: "GBP", label: "GBP - British Pound (£)" },
  { value: "INR", label: "INR - Indian Rupee (₹)" },
  { value: "AUD", label: "AUD - Australian Dollar (A$)" },
  { value: "CAD", label: "CAD - Canadian Dollar (C$)" },
  { value: "JPY", label: "JPY - Japanese Yen (¥)" },
  { value: "SGD", label: "SGD - Singapore Dollar (S$)" },
  { value: "AED", label: "AED - UAE Dirham (د.إ)" },
];

const CURRENCY_SYMBOLS: Record<string, string> = {
  LKR: "Rs.",
  USD: "$",
  EUR: "€",
  GBP: "£",
  INR: "₹",
  AUD: "A$",
  CAD: "C$",
  JPY: "¥",
  SGD: "S$",
  AED: "د.إ",
};

const DATE_FORMAT_OPTIONS = [
  { value: "YYYY-MM-DD", label: "2025-01-15 (ISO)" },
  { value: "DD/MM/YYYY", label: "15/01/2025 (Day first)" },
  { value: "MM/DD/YYYY", label: "01/15/2025 (Month first)" },
  { value: "DD-MMM-YYYY", label: "15-Jan-2025 (Short month)" },
  { value: "MMMM DD, YYYY", label: "January 15, 2025 (Full month)" },
];

const NUMBER_FORMAT_OPTIONS = [
  { value: "1,000.00", label: "1,000.00 (Comma thousands, dot decimal)" },
  { value: "1.000,00", label: "1.000,00 (Dot thousands, comma decimal)" },
  { value: "1 000.00", label: "1 000.00 (Space thousands, dot decimal)" },
  { value: "1000.00", label: "1000.00 (No separator)" },
];

const START_OF_MONTH_OPTIONS = Array.from({ length: 28 }, (_, i) => ({
  value: String(i + 1),
  label: `${i + 1}${getOrdinalSuffix(i + 1)} of each month`,
}));

const ACCENT_COLORS = [
  { value: "blue", label: "Blue", class: "bg-blue-500" },
  { value: "indigo", label: "Indigo", class: "bg-indigo-500" },
  { value: "violet", label: "Violet", class: "bg-violet-500" },
  { value: "emerald", label: "Emerald", class: "bg-emerald-500" },
  { value: "amber", label: "Amber", class: "bg-amber-500" },
  { value: "rose", label: "Rose", class: "bg-rose-500" },
  { value: "cyan", label: "Cyan", class: "bg-cyan-500" },
  { value: "orange", label: "Orange", class: "bg-orange-500" },
];

const FONT_SIZE_OPTIONS = [
  { value: "small", label: "Small (14px)" },
  { value: "medium", label: "Medium (16px — Default)" },
  { value: "large", label: "Large (18px)" },
];

function getOrdinalSuffix(n: number): string {
  const s = ["th", "st", "nd", "rd"];
  const v = n % 100;
  return s[(v - 20) % 10] || s[v] || s[0];
}

// ——— Section Wrapper ————————————————————————————————
function SettingSection({
  icon,
  title,
  description,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
      <div className="px-6 py-4 border-b border-gray-100 dark:border-gray-700/50">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-gray-100 dark:bg-gray-700/50">
            {icon}
          </div>
          <div>
            <h3 className="text-base font-semibold text-gray-900 dark:text-white">
              {title}
            </h3>
            {description && (
              <p className="text-sm text-gray-500 dark:text-gray-400 mt-0.5">
                {description}
              </p>
            )}
          </div>
        </div>
      </div>
      <div className="px-6 py-5 space-y-5">{children}</div>
    </div>
  );
}

// ——— Setting Row ——————————————————————————————————————
function SettingRow({
  label,
  description,
  children,
}: {
  label: string;
  description?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-8">
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-gray-900 dark:text-white">
          {label}
        </p>
        {description && (
          <p className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
            {description}
          </p>
        )}
      </div>
      <div className="flex-shrink-0 w-64">{children}</div>
    </div>
  );
}

// ——— Database Stats ———————————————————————————————————
interface DbStats {
  accounts: number;
  categories: number;
  transactions: number;
  budgets: number;
}

// ——— Main Component ———————————————————————————————————
export default function SettingsView() {
  const { theme, toggleTheme } = useTheme();
  const { accentColor: activeAccent, setAccentColor } = useAccentColor();
  const { success, error: showError, info, warning } = useToast();

  const [settings, setSettings] = useState<AppSettings>(() => {
    const stored = localStorage.getItem("appSettings");
    if (stored) {
      try {
        return { ...DEFAULT_SETTINGS, ...JSON.parse(stored) };
      } catch {
        return DEFAULT_SETTINGS;
      }
    }
    return DEFAULT_SETTINGS;
  });

  const [dbStats, setDbStats] = useState<DbStats | null>(null);
  const [isBackingUp, setIsBackingUp] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [lastBackupDate, setLastBackupDate] = useState<string | null>(() => {
    return localStorage.getItem("lastBackupDate");
  });

  // Security state
  const [pinEnabled, setPinEnabled] = useState(false);
  const [showSetPin, setShowSetPin] = useState(false);
  const [showChangePin, setShowChangePin] = useState(false);
  const [showRemovePin, setShowRemovePin] = useState(false);
  const [currentPinInput, setCurrentPinInput] = useState("");
  const [newPinInput, setNewPinInput] = useState("");
  const [confirmPinInput, setConfirmPinInput] = useState("");
  const [pinError, setPinError] = useState<string | null>(null);
  const [pinSuccess, setPinSuccess] = useState<string | null>(null);
  const [showPin, setShowPin] = useState(false);
  const [securityTimeout, setSecurityTimeout] = useState(5);

  useEffect(() => {
    loadDbStats();
  }, []);

  // Load security status on mount
  useEffect(() => {
    const loadSecurityStatus = async () => {
      try {
        const status = await invoke<{
          pin_enabled: boolean;
          lock_timeout_minutes: number;
          failed_attempts: number;
          is_locked_out: boolean;
        }>("get_security_status");
        setPinEnabled(status.pin_enabled);
        setSecurityTimeout(status.lock_timeout_minutes);
      } catch (err) {
        console.error("Failed to load security status:", err);
      }
    };
    loadSecurityStatus();
  }, []);

  // —— Persist settings on change ——————————————————————
  const updateSetting = <K extends keyof AppSettings>(
    key: K,
    value: AppSettings[K],
  ) => {
    setSettings((prev) => {
      const updated = { ...prev, [key]: value };

      // Auto-update currency symbol when currency changes
      if (key === "currency" && typeof value === "string") {
        updated.currencySymbol = CURRENCY_SYMBOLS[value] || value;
      }

      return updated;
    });
    setHasUnsavedChanges(true);
  };

  const saveSettings = () => {
    localStorage.setItem("appSettings", JSON.stringify(settings));
    setHasUnsavedChanges(false);
    success("Settings Saved", "Your preferences have been updated.");
  };

  const resetSettings = () => {
    setSettings(DEFAULT_SETTINGS);
    localStorage.setItem("appSettings", JSON.stringify(DEFAULT_SETTINGS));
    setHasUnsavedChanges(false);
    info("Settings Reset", "All preferences restored to defaults.");
  };

  // —— Database stats ————————————————————————————————
  const loadDbStats = async () => {
    try {
      const [accounts, categories, transactions, budgets] = await Promise.all([
        invoke<unknown[]>("get_accounts"),
        invoke<unknown[]>("get_categories"),
        invoke<unknown[]>("get_transactions"),
        invoke<unknown[]>("get_budgets"),
      ]);
      setDbStats({
        accounts: accounts.length,
        categories: categories.length,
        transactions: transactions.length,
        budgets: budgets.length,
      });
    } catch (err) {
      console.error("Failed to load DB stats:", err);
    }
  };

  // —— Backup ——————————————————————————————————————————
  const handleBackup = async () => {
    setIsBackingUp(true);
    try {
      const date = new Date().toISOString().split("T")[0];
      const defaultName = `money_manager_backup_${date}.json`;

      const filePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        title: "Save Backup File",
      });

      if (!filePath) {
        setIsBackingUp(false);
        return;
      }

      const content = await invoke<string>("export_full_backup");
      await writeTextFile(filePath, content);

      const now = new Date().toISOString();
      setLastBackupDate(now);
      localStorage.setItem("lastBackupDate", now);

      success(
        "Backup Created",
        `Your data has been saved to ${filePath.split(/[/\\]/).pop()}`,
      );
    } catch (err) {
      showError("Backup Failed", String(err));
    } finally {
      setIsBackingUp(false);
    }
  };

  // —— Restore ————————————————————————————————————————
  const handleRestore = async () => {
    const confirmed = await ask(
      "Restoring from a backup will replace ALL current data. This action cannot be undone.\n\nAre you sure you want to continue?",
      {
        title: "Restore from Backup",
        kind: "warning",
        okLabel: "Yes, Restore",
        cancelLabel: "Cancel",
      },
    );

    if (!confirmed) return;

    setIsRestoring(true);
    try {
      const filePath = await open({
        filters: [{ name: "JSON Files", extensions: ["json"] }],
        title: "Select Backup File",
        multiple: false,
      });

      if (!filePath) {
        setIsRestoring(false);
        return;
      }

      const content = await readTextFile(filePath as string);

      // Validate JSON structure
      let backup;
      try {
        backup = JSON.parse(content);
      } catch {
        showError(
          "Invalid File",
          "The selected file is not a valid JSON backup.",
        );
        setIsRestoring(false);
        return;
      }

      if (!backup.version || !backup.data) {
        showError(
          "Invalid Backup",
          "This file does not appear to be a Money Manager backup.",
        );
        setIsRestoring(false);
        return;
      }

      // Validate expected data keys
      const requiredKeys = [
        "accounts",
        "categories",
        "transactions",
        "budgets",
      ];
      const missingKeys = requiredKeys.filter((key) => !(key in backup.data));
      if (missingKeys.length > 0) {
        showError(
          "Incomplete Backup",
          `Missing data sections: ${missingKeys.join(", ")}`,
        );
        setIsRestoring(false);
        return;
      }

      // Show what's in the backup
      const stats = {
        accounts: Array.isArray(backup.data.accounts)
          ? backup.data.accounts.length
          : 0,
        categories: Array.isArray(backup.data.categories)
          ? backup.data.categories.length
          : 0,
        transactions: Array.isArray(backup.data.transactions)
          ? backup.data.transactions.length
          : 0,
        budgets: Array.isArray(backup.data.budgets)
          ? backup.data.budgets.length
          : 0,
      };

      const proceedWithRestore = await ask(
        `This backup contains:\n• ${stats.accounts} accounts\n• ${stats.categories} categories\n• ${stats.transactions} transactions\n• ${stats.budgets} budgets\n\nBackup date: ${backup.exported_at ? new Date(backup.exported_at).toLocaleString() : "Unknown"}\n\nProceed with restore?`,
        {
          title: "Confirm Restore",
          kind: "info",
          okLabel: "Restore Now",
          cancelLabel: "Cancel",
        },
      );

      if (!proceedWithRestore) {
        setIsRestoring(false);
        return;
      }

      const result = await invoke<{
        success: boolean;
        accounts_restored: number;
        categories_restored: number;
        transactions_restored: number;
        budgets_restored: number;
      }>("restore_from_backup", { backupJson: content });

      if (result.success) {
        success(
          "Restore Complete",
          `Restored ${result.accounts_restored} accounts, ${result.categories_restored} categories, ${result.transactions_restored} transactions, and ${result.budgets_restored} budgets.`,
        );
      }

      await loadDbStats();
    } catch (err) {
      showError("Restore Failed", String(err));
    } finally {
      setIsRestoring(false);
    }
  };

  // —— Clear All Data ————————————————————————————————
  const handleClearData = async () => {
    const firstConfirm = await ask(
      "This will permanently delete ALL your financial data including accounts, transactions, categories, and budgets.\n\nThis action CANNOT be undone.",
      {
        title: "⚠️ Clear All Data",
        kind: "warning",
        okLabel: "I understand, continue",
        cancelLabel: "Cancel",
      },
    );

    if (!firstConfirm) return;

    const secondConfirm = await ask(
      "Are you absolutely sure? Type-to-confirm is not available, but please be certain.\n\nAll data will be permanently lost.",
      {
        title: "Final Confirmation",
        kind: "warning",
        okLabel: "Yes, Delete Everything",
        cancelLabel: "No, Keep My Data",
      },
    );

    if (!secondConfirm) return;

    setIsClearing(true);
    try {
      const result = await invoke<{
        success: boolean;
        accounts_deleted: number;
        categories_deleted: number;
        transactions_deleted: number;
        budgets_deleted: number;
      }>("clear_all_data");

      if (result.success) {
        success(
          "Data Cleared",
          `Deleted ${result.accounts_deleted} accounts, ${result.categories_deleted} categories, ${result.transactions_deleted} transactions, and ${result.budgets_deleted} budgets.`,
        );
      }

      await loadDbStats();
    } catch (err) {
      showError("Failed to Clear Data", String(err));
    } finally {
      setIsClearing(false);
    }
  };

  // —— Security handlers ————————————————————————————
  const resetPinForms = () => {
    setShowSetPin(false);
    setShowChangePin(false);
    setShowRemovePin(false);
    setCurrentPinInput("");
    setNewPinInput("");
    setConfirmPinInput("");
    setPinError(null);
    setPinSuccess(null);
    setShowPin(false);
  };

  const handleSetPin = async () => {
    setPinError(null);
    setPinSuccess(null);
    if (newPinInput.length < 4 || newPinInput.length > 8) {
      setPinError("PIN must be 4-8 digits");
      return;
    }
    if (!/^\d+$/.test(newPinInput)) {
      setPinError("PIN must contain only numbers");
      return;
    }
    if (newPinInput !== confirmPinInput) {
      setPinError("PINs do not match");
      return;
    }
    try {
      await invoke("set_pin", {
        newPin: newPinInput,
        currentPin: pinEnabled ? currentPinInput : null,
      });
      setPinEnabled(true);
      setShowSetPin(false);
      setShowChangePin(false);
      setNewPinInput("");
      setConfirmPinInput("");
      setCurrentPinInput("");
      setPinSuccess("PIN has been set successfully");
      success("PIN Enabled", "Your app is now protected with a PIN lock.");
    } catch (err) {
      setPinError(String(err));
    }
  };

  const handleRemovePin = async () => {
    setPinError(null);
    if (!currentPinInput) {
      setPinError("Enter your current PIN to remove it");
      return;
    }
    try {
      await invoke("remove_pin", { currentPin: currentPinInput });
      setPinEnabled(false);
      setShowRemovePin(false);
      setCurrentPinInput("");
      window.dispatchEvent(new Event("pin-removed"));
      success("PIN Removed", "App lock has been disabled.");
    } catch (err) {
      setPinError(String(err));
    }
  };

  const handleTimeoutChange = async (minutes: number) => {
    try {
      await invoke("set_lock_timeout", { minutes });
      setSecurityTimeout(minutes);
      window.dispatchEvent(
        new CustomEvent("lock-timeout-changed", { detail: minutes }),
      );
    } catch (err) {
      showError("Failed to update timeout", String(err));
    }
  };

  // —— Format helpers ————————————————————————————————
  const formatLastBackup = () => {
    if (!lastBackupDate) return "Never";
    try {
      const date = new Date(lastBackupDate);
      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffDays = Math.floor(diffMs / (1000 * 60 * 60 * 24));

      if (diffDays === 0) return "Today";
      if (diffDays === 1) return "Yesterday";
      if (diffDays < 7) return `${diffDays} days ago`;
      if (diffDays < 30) return `${Math.floor(diffDays / 7)} weeks ago`;
      return date.toLocaleDateString();
    } catch {
      return "Unknown";
    }
  };

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white flex items-center gap-3">
            <Settings className="w-7 h-7 text-gray-400" />
            Settings
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 mt-1">
            Customize your Money Manager experience
          </p>
        </div>
        {hasUnsavedChanges && (
          <div className="flex items-center gap-3">
            <span className="text-sm text-amber-600 dark:text-amber-400 flex items-center gap-1.5">
              <AlertTriangle className="w-4 h-4" />
              Unsaved changes
            </span>
            <Button onClick={saveSettings} size="sm">
              Save Changes
            </Button>
          </div>
        )}
      </div>

      {/* ═══ General Preferences ═══ */}
      <SettingSection
        icon={<Settings className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
        title="General Preferences"
        description="Configure currency, date, and number display formats"
      >
        <SettingRow
          label="Default Currency"
          description="Used for all transactions and reports"
        >
          <Select
            value={settings.currency}
            onChange={(e) => updateSetting("currency", e.target.value)}
            options={CURRENCY_OPTIONS}
          />
        </SettingRow>

        <SettingRow
          label="Date Format"
          description="How dates are displayed throughout the app"
        >
          <Select
            value={settings.dateFormat}
            onChange={(e) => updateSetting("dateFormat", e.target.value)}
            options={DATE_FORMAT_OPTIONS}
          />
        </SettingRow>

        <SettingRow
          label="Number Format"
          description="Thousand separator and decimal format"
        >
          <Select
            value={settings.numberFormat}
            onChange={(e) => updateSetting("numberFormat", e.target.value)}
            options={NUMBER_FORMAT_OPTIONS}
          />
        </SettingRow>

        <SettingRow
          label="Start of Month"
          description="When your monthly budget cycle begins (useful for salary-based budgeting)"
        >
          <Select
            value={String(settings.startOfMonth)}
            onChange={(e) =>
              updateSetting("startOfMonth", Number(e.target.value))
            }
            options={START_OF_MONTH_OPTIONS}
          />
        </SettingRow>
      </SettingSection>

      {/* ═══ Appearance ═══ */}
      <SettingSection
        icon={<Palette className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
        title="Appearance"
        description="Customize the look and feel"
      >
        <SettingRow
          label="Theme"
          description="Switch between light and dark mode"
        >
          <button
            onClick={toggleTheme}
            className="w-full flex items-center justify-between px-4 py-2.5 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
          >
            <div className="flex items-center gap-2">
              {theme === "light" ? (
                <Sun className="w-4 h-4 text-amber-500" />
              ) : (
                <Moon className="w-4 h-4 text-blue-400" />
              )}
              <span className="text-sm text-gray-900 dark:text-white">
                {theme === "light" ? "Light Mode" : "Dark Mode"}
              </span>
            </div>
            <ChevronRight className="w-4 h-4 text-gray-400" />
          </button>
        </SettingRow>

        <SettingRow
          label="Accent Color"
          description="Primary color used for buttons and highlights"
        >
          <div className="flex gap-2 flex-wrap">
            {ACCENT_COLORS.map((color) => (
              <button
                key={color.value}
                onClick={() => {
                  updateSetting("accentColor", color.value);
                  setAccentColor(
                    color.value as
                      | "blue"
                      | "indigo"
                      | "violet"
                      | "emerald"
                      | "amber"
                      | "rose"
                      | "cyan"
                      | "orange",
                  );
                }}
                className={`w-8 h-8 rounded-full ${color.class} flex items-center justify-center transition-transform hover:scale-110 ${
                  activeAccent === color.value
                    ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800"
                    : ""
                }`}
                title={color.label}
              >
                {activeAccent === color.value && (
                  <Check className="w-4 h-4 text-white" />
                )}
              </button>
            ))}
          </div>
        </SettingRow>

        <SettingRow
          label="Font Size"
          description="Adjust the base text size across the app"
        >
          <Select
            value={settings.fontSize}
            onChange={(e) => updateSetting("fontSize", e.target.value)}
            options={FONT_SIZE_OPTIONS}
          />
        </SettingRow>
      </SettingSection>

      {/* ═══ Data Management ═══ */}
      <SettingSection
        icon={<Database className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
        title="Data Management"
        description="Backup, restore, and manage your financial data"
      >
        {/* Database Stats */}
        {dbStats && (
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
            {[
              {
                label: "Accounts",
                count: dbStats.accounts,
                icon: <HardDrive className="w-4 h-4" />,
              },
              {
                label: "Categories",
                count: dbStats.categories,
                icon: <Hash className="w-4 h-4" />,
              },
              {
                label: "Transactions",
                count: dbStats.transactions,
                icon: <Calendar className="w-4 h-4" />,
              },
              {
                label: "Budgets",
                count: dbStats.budgets,
                icon: <Shield className="w-4 h-4" />,
              },
            ].map((stat) => (
              <div
                key={stat.label}
                className="p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700"
              >
                <div className="flex items-center gap-2 text-gray-500 dark:text-gray-400 mb-1">
                  {stat.icon}
                  <span className="text-xs font-medium">{stat.label}</span>
                </div>
                <p className="text-lg font-bold text-gray-900 dark:text-white">
                  {stat.count.toLocaleString()}
                </p>
              </div>
            ))}
          </div>
        )}

        {/* Last Backup */}
        <div className="flex items-center justify-between p-3 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Clock className="w-4 h-4 text-gray-400" />
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Last Backup
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {formatLastBackup()}
              </p>
            </div>
          </div>
          <Button
            variant="primary"
            size="sm"
            onClick={handleBackup}
            disabled={isBackingUp}
            icon={
              isBackingUp ? (
                <RefreshCw className="w-4 h-4 animate-spin" />
              ) : (
                <Download className="w-4 h-4" />
              )
            }
          >
            {isBackingUp ? "Backing up..." : "Backup Now"}
          </Button>
        </div>

        {/* Action Buttons */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <button
            onClick={handleBackup}
            disabled={isBackingUp}
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Create Backup
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Export all data to JSON
              </p>
            </div>
          </button>

          <button
            onClick={handleRestore}
            disabled={isRestoring}
            className="flex items-center gap-3 p-4 rounded-lg border border-gray-200 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors text-left disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-emerald-100 dark:bg-emerald-900/30">
              <Upload className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                Restore Backup
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                Import data from file
              </p>
            </div>
          </button>

          <button
            onClick={handleClearData}
            disabled={isClearing}
            className="flex items-center gap-3 p-4 rounded-lg border border-red-200 dark:border-red-800/50 hover:bg-red-50 dark:hover:bg-red-900/10 transition-colors text-left disabled:opacity-50"
          >
            <div className="p-2 rounded-lg bg-red-100 dark:bg-red-900/30">
              <Trash2 className="w-5 h-5 text-red-600 dark:text-red-400" />
            </div>
            <div>
              <p className="text-sm font-medium text-red-700 dark:text-red-300">
                Clear All Data
              </p>
              <p className="text-xs text-red-500 dark:text-red-400">
                Permanently delete everything
              </p>
            </div>
          </button>
        </div>
      </SettingSection>

      {/* ═══ Security ═══ */}
      <SettingSection
        icon={<Lock className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
        title="Security"
        description="Protect your financial data with a PIN lock"
      >
        {/* PIN Status */}
        <div className="flex items-center justify-between p-4 rounded-lg bg-gray-50 dark:bg-gray-700/30 border border-gray-100 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div
              className={`p-2 rounded-lg ${pinEnabled ? "bg-emerald-100 dark:bg-emerald-900/30" : "bg-gray-100 dark:bg-gray-700"}`}
            >
              <Shield
                className={`w-5 h-5 ${pinEnabled ? "text-emerald-600 dark:text-emerald-400" : "text-gray-400"}`}
              />
            </div>
            <div>
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                PIN Lock
              </p>
              <p className="text-xs text-gray-500 dark:text-gray-400">
                {pinEnabled
                  ? "Enabled — App requires PIN to unlock"
                  : "Disabled — Anyone can open the app"}
              </p>
            </div>
          </div>
          <div
            className={`px-3 py-1 rounded-full text-xs font-medium ${
              pinEnabled
                ? "bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300"
                : "bg-gray-100 dark:bg-gray-700 text-gray-500 dark:text-gray-400"
            }`}
          >
            {pinEnabled ? "ON" : "OFF"}
          </div>
        </div>

        {/* PIN Success Message */}
        {pinSuccess && (
          <div className="p-3 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800/30">
            <p className="text-sm text-emerald-700 dark:text-emerald-300">
              {pinSuccess}
            </p>
          </div>
        )}

        {/* PIN Actions */}
        {!showSetPin && !showChangePin && !showRemovePin && (
          <div className="flex gap-3">
            {!pinEnabled ? (
              <Button
                onClick={() => {
                  resetPinForms();
                  setShowSetPin(true);
                }}
                icon={<Lock className="w-4 h-4" />}
              >
                Set PIN
              </Button>
            ) : (
              <>
                <Button
                  variant="secondary"
                  onClick={() => {
                    resetPinForms();
                    setShowChangePin(true);
                  }}
                  size="sm"
                >
                  Change PIN
                </Button>
                <Button
                  variant="danger"
                  onClick={() => {
                    resetPinForms();
                    setShowRemovePin(true);
                  }}
                  size="sm"
                >
                  Remove PIN
                </Button>
              </>
            )}
          </div>
        )}

        {/* Set PIN Form */}
        {showSetPin && (
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 space-y-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              Set a new PIN
            </h4>
            <div className="space-y-3">
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={newPinInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setNewPinInput(val);
                    setPinError(null);
                  }}
                  placeholder="Enter 4-8 digit PIN"
                  className="w-full px-3 py-2 pr-10 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg"
                  inputMode="numeric"
                  maxLength={8}
                  autoFocus
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPin ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <input
                type={showPin ? "text" : "password"}
                value={confirmPinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                  setConfirmPinInput(val);
                  setPinError(null);
                }}
                placeholder="Confirm PIN"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg"
                inputMode="numeric"
                maxLength={8}
              />
            </div>
            {pinError && <p className="text-sm text-red-500">{pinError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSetPin} size="sm">
                Save PIN
              </Button>
              <Button variant="ghost" onClick={resetPinForms} size="sm">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Change PIN Form */}
        {showChangePin && (
          <div className="p-4 rounded-lg border border-gray-200 dark:border-gray-600 space-y-4">
            <h4 className="text-sm font-medium text-gray-900 dark:text-white">
              Change your PIN
            </h4>
            <div className="space-y-3">
              <input
                type={showPin ? "text" : "password"}
                value={currentPinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                  setCurrentPinInput(val);
                  setPinError(null);
                }}
                placeholder="Current PIN"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg"
                inputMode="numeric"
                maxLength={8}
                autoFocus
              />
              <div className="relative">
                <input
                  type={showPin ? "text" : "password"}
                  value={newPinInput}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                    setNewPinInput(val);
                    setPinError(null);
                  }}
                  placeholder="New PIN (4-8 digits)"
                  className="w-full px-3 py-2 pr-10 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg"
                  inputMode="numeric"
                  maxLength={8}
                />
                <button
                  type="button"
                  onClick={() => setShowPin(!showPin)}
                  className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                >
                  {showPin ? (
                    <EyeOff className="w-4 h-4" />
                  ) : (
                    <Eye className="w-4 h-4" />
                  )}
                </button>
              </div>
              <input
                type={showPin ? "text" : "password"}
                value={confirmPinInput}
                onChange={(e) => {
                  const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                  setConfirmPinInput(val);
                  setPinError(null);
                }}
                placeholder="Confirm new PIN"
                className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-blue-500 tracking-widest text-center text-lg"
                inputMode="numeric"
                maxLength={8}
              />
            </div>
            {pinError && <p className="text-sm text-red-500">{pinError}</p>}
            <div className="flex gap-2">
              <Button onClick={handleSetPin} size="sm">
                Update PIN
              </Button>
              <Button variant="ghost" onClick={resetPinForms} size="sm">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Remove PIN Form */}
        {showRemovePin && (
          <div className="p-4 rounded-lg border border-red-200 dark:border-red-800/50 space-y-4">
            <h4 className="text-sm font-medium text-red-700 dark:text-red-300">
              Remove PIN lock
            </h4>
            <p className="text-xs text-gray-500 dark:text-gray-400">
              Enter your current PIN to confirm removal. Your app will no longer
              require a PIN to open.
            </p>
            <input
              type={showPin ? "text" : "password"}
              value={currentPinInput}
              onChange={(e) => {
                const val = e.target.value.replace(/\D/g, "").slice(0, 8);
                setCurrentPinInput(val);
                setPinError(null);
              }}
              placeholder="Enter current PIN"
              className="w-full px-3 py-2 border rounded-lg bg-white dark:bg-gray-800 border-gray-300 dark:border-gray-600 text-gray-900 dark:text-white placeholder-gray-400 dark:placeholder-gray-500 focus:outline-none focus:ring-2 focus:ring-red-500 tracking-widest text-center text-lg"
              inputMode="numeric"
              maxLength={8}
              autoFocus
            />
            {pinError && <p className="text-sm text-red-500">{pinError}</p>}
            <div className="flex gap-2">
              <Button variant="danger" onClick={handleRemovePin} size="sm">
                Remove PIN
              </Button>
              <Button variant="ghost" onClick={resetPinForms} size="sm">
                Cancel
              </Button>
            </div>
          </div>
        )}

        {/* Auto-Lock Timeout */}
        {pinEnabled && (
          <SettingRow
            label="Auto-Lock Timeout"
            description="Lock app after this period of inactivity"
          >
            <Select
              value={String(securityTimeout)}
              onChange={(e) => handleTimeoutChange(Number(e.target.value))}
              options={[
                { value: "1", label: "1 minute" },
                { value: "5", label: "5 minutes" },
                { value: "15", label: "15 minutes" },
                { value: "30", label: "30 minutes" },
                { value: "0", label: "Never (manual only)" },
              ]}
            />
          </SettingRow>
        )}
      </SettingSection>

      {/* ═══ About ═══ */}
      <SettingSection
        icon={<Info className="w-5 h-5 text-gray-600 dark:text-gray-300" />}
        title="About"
        description="Application information"
      >
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Application
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Money Manager
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Version
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              0.1.0
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Framework
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Tauri v2 + React
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Database
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              SQLite (Local)
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Architecture
            </span>
            <span className="text-sm font-medium text-gray-900 dark:text-white">
              Local-first, Privacy-focused
            </span>
          </div>
        </div>

        <div className="mt-4 p-3 rounded-lg bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30">
          <p className="text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
            💡 Money Manager keeps all your financial data stored locally on
            your device. No cloud, no tracking, no third-party access. Your
            money, your data, your privacy.
          </p>
        </div>
      </SettingSection>

      {/* ═══ Save / Reset Bar ═══ */}
      <div className="flex items-center justify-between py-4">
        <Button variant="ghost" onClick={resetSettings} size="sm">
          Reset to Defaults
        </Button>
        <div className="flex items-center gap-3">
          {hasUnsavedChanges && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              You have unsaved changes
            </span>
          )}
          <Button
            onClick={saveSettings}
            disabled={!hasUnsavedChanges}
            icon={<Check className="w-4 h-4" />}
          >
            Save Settings
          </Button>
        </div>
      </div>
    </div>
  );
}
