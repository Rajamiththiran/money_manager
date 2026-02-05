// File: src/components/ExportDialog.tsx
import { useState, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, BaseDirectory } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { XMarkIcon, FolderIcon } from "@heroicons/react/24/outline";
import Button from "./Button";

interface ExportFilter {
  start_date?: string;
  end_date?: string;
  transaction_type?: string;
  account_id?: number;
  category_id?: number;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exportType: "csv" | "json" | "backup";
  filters?: ExportFilter;
}

export default function ExportDialog({
  isOpen,
  onClose,
  exportType,
  filters,
}: ExportDialogProps) {
  const [filePath, setFilePath] = useState<string | null>(null);
  const [fileName, setFileName] = useState("");
  const [isExporting, setIsExporting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isOpen) {
      setError(null);
      // Set default filename based on export type
      const date = new Date().toISOString().split("T")[0];
      let defaultName = "";

      switch (exportType) {
        case "csv":
          defaultName = `transactions_${date}.csv`;
          break;
        case "json":
          defaultName = `transactions_${date}.json`;
          break;
        case "backup":
          defaultName = `money_manager_backup_${date}.json`;
          break;
      }

      setFileName(defaultName);
      setFilePath(null);
    }
  }, [isOpen, exportType]);

  const handleBrowse = async () => {
    try {
      setError(null);

      // Determine file filter based on export type
      const filters =
        exportType === "csv"
          ? [{ name: "CSV Files", extensions: ["csv"] }]
          : [{ name: "JSON Files", extensions: ["json"] }];

      // Open native Windows "Save As" dialog
      const selectedPath = await save({
        defaultPath: fileName,
        filters: filters,
        title: getTitle(),
      });

      if (selectedPath) {
        setFilePath(selectedPath);
        // Extract filename from path
        const pathParts = selectedPath.split(/[/\\]/);
        setFileName(pathParts[pathParts.length - 1]);
      }
    } catch (err) {
      console.error("Browse error:", err);
      setError(`Failed to open file dialog: ${err}`);
    }
  };

  const handleExport = async () => {
    if (!filePath) {
      setError("Please select a save location first");
      return;
    }

    setIsExporting(true);
    setError(null);

    try {
      let content: string;

      switch (exportType) {
        case "csv":
          console.log("Calling backend export_transactions_csv...");
          content = await invoke<string>("export_transactions_csv", {
            filter: filters || null,
          });
          break;

        case "json":
          console.log("Calling backend export_transactions_json...");
          content = await invoke<string>("export_transactions_json", {
            filter: filters || null,
          });
          break;

        case "backup":
          console.log("Calling backend export_full_backup...");
          content = await invoke<string>("export_full_backup");
          break;

        default:
          throw new Error("Unknown export type");
      }

      console.log("Backend returned data, length:", content.length);

      // Write file to selected path
      await writeTextFile(filePath, content);

      console.log("File written successfully to:", filePath);

      // Show success and close dialog
      onClose();
      alert(`Successfully exported to:\n${filePath}`);
    } catch (err) {
      console.error(`Failed to export ${exportType}:`, err);
      setError(`Export failed: ${err}`);
    } finally {
      setIsExporting(false);
    }
  };

  const getTitle = () => {
    switch (exportType) {
      case "csv":
        return "Export Transactions as CSV";
      case "json":
        return "Export Transactions as JSON";
      case "backup":
        return "Create Full Backup";
      default:
        return "Export";
    }
  };

  const getDescription = () => {
    switch (exportType) {
      case "csv":
        return "Export your transactions to a CSV file that can be opened in Excel or Google Sheets.";
      case "json":
        return "Export your transactions to a JSON file for data portability.";
      case "backup":
        return "Create a complete backup of all your data including accounts, categories, transactions, and budgets.";
      default:
        return "";
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-xl shadow-2xl w-full max-w-md mx-4 overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
            {getTitle()}
          </h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            <XMarkIcon className="h-5 w-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          <p className="text-sm text-gray-600 dark:text-gray-400">
            {getDescription()}
          </p>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
            </div>
          )}

          {/* Save Location */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Save Location
            </label>
            <div className="flex gap-2">
              <div className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-gray-50 dark:bg-gray-700/50 text-gray-700 dark:text-gray-300 truncate">
                {filePath || "No location selected"}
              </div>
              <Button
                variant="primary"
                onClick={handleBrowse}
                icon={<FolderIcon className="h-4 w-4" />}
              >
                Browse
              </Button>
            </div>
          </div>

          {/* Selected File Info */}
          {filePath && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-sm text-green-700 dark:text-green-300">
                <strong>File:</strong> {fileName}
              </p>
            </div>
          )}

          {/* Export Info */}
          <div className="p-3 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
            <p className="text-sm text-blue-700 dark:text-blue-300">
              {exportType === "backup" ? (
                <>
                  <strong>Included in backup:</strong> Accounts, Categories,
                  Transactions, Budgets
                </>
              ) : (
                <>
                  <strong>Tip:</strong> Click "Browse" to open the save dialog
                  and choose where to save your file.
                </>
              )}
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
          <Button variant="ghost" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button onClick={handleExport} disabled={isExporting || !filePath}>
            {isExporting ? (
              <>
                <svg className="animate-spin h-4 w-4 mr-2" viewBox="0 0 24 24">
                  <circle
                    className="opacity-25"
                    cx="12"
                    cy="12"
                    r="10"
                    stroke="currentColor"
                    strokeWidth="4"
                    fill="none"
                  />
                  <path
                    className="opacity-75"
                    fill="currentColor"
                    d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                  />
                </svg>
                Exporting...
              </>
            ) : (
              "Export"
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}
