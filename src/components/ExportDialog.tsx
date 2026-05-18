// File: src/components/ExportDialog.tsx
import { useState, useEffect } from "react";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { invoke } from "@tauri-apps/api/core";
import { XMarkIcon, FolderIcon, BookmarkIcon } from "@heroicons/react/24/outline";
import Button from "./Button";
import Input from "./Input";

export interface ExportTemplate {
  id: string;
  name: string;
  columns: string; // JSON array
  filters: string | null;
  format: string;
}

interface ExportFilter {
  start_date?: string;
  end_date?: string;
  transaction_type?: string;
  account_id?: number;
  category_id?: number;
  columns?: string[];
  include_pie_chart?: boolean;
  include_histogram?: boolean;
}

interface ExportDialogProps {
  isOpen: boolean;
  onClose: () => void;
  exportType: "csv" | "excel" | "json" | "backup";
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
  const [selectedCols, setSelectedCols] = useState<Record<string, boolean>>({
    Date: true,
    Type: true,
    Account: true,
    "To Account": true,
    Category: true,
    Amount: true,
    Memo: true,
  });
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState<string>("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  const [period, setPeriod] = useState("custom");
  const [startDate, setStartDate] = useState(filters?.start_date || "");
  const [endDate, setEndDate] = useState(filters?.end_date || "");
  const [includePieChart, setIncludePieChart] = useState(false);
  const [includeHistogram, setIncludeHistogram] = useState(false);

  // Update local state if props change
  useEffect(() => {
    if (isOpen) {
      setStartDate(filters?.start_date || "");
      setEndDate(filters?.end_date || "");
      setPeriod(filters?.start_date || filters?.end_date ? "custom" : "all_time");
    }
  }, [isOpen, filters]);

  const handlePeriodChange = (val: string) => {
    setPeriod(val);
    const today = new Date();
    let start = new Date();
    let end = new Date();

    if (val === "this_month") {
      start = new Date(today.getFullYear(), today.getMonth(), 1);
      end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    } else if (val === "last_month") {
      start = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      end = new Date(today.getFullYear(), today.getMonth(), 0);
    } else if (val === "this_year") {
      start = new Date(today.getFullYear(), 0, 1);
      end = new Date(today.getFullYear(), 11, 31);
    } else if (val === "all_time") {
      setStartDate("");
      setEndDate("");
      return;
    } else if (val === "custom") {
      return;
    }

    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  };

  const loadTemplates = async () => {
    try {
      const res = await invoke<ExportTemplate[]>("get_export_templates");
      setTemplates(res);
    } catch (err) {
      console.error("Failed to load templates:", err);
    }
  };

  useEffect(() => {
    loadTemplates();
  }, []);

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
        case "excel":
          defaultName = `transactions_${date}.xlsx`;
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
          : exportType === "excel"
            ? [{ name: "Excel Files", extensions: ["xlsx"] }]
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

      const colsToExport = Object.keys(selectedCols).filter(k => selectedCols[k]);
      const finalFilters = { 
        ...(filters || {}), 
        columns: colsToExport,
        start_date: startDate || undefined,
        end_date: endDate || undefined,
        include_pie_chart: exportType === "excel" ? includePieChart : undefined,
        include_histogram: exportType === "excel" ? includeHistogram : undefined,
      };

      switch (exportType) {
        case "csv":
          console.log("Calling backend export_transactions_csv...");
          content = await invoke<string>("export_transactions_csv", {
            filter: finalFilters,
          });
          break;

        case "excel": {
          console.log("Calling backend export_transactions_excel...");
          const bytes = await invoke<number[]>("export_transactions_excel", {
            filter: finalFilters,
          });
          const uint8Array = new Uint8Array(bytes);
          await writeFile(filePath, uint8Array);
          console.log("Excel file written successfully to:", filePath);
          
          onClose();
          alert(`Successfully exported to:\n${filePath}`);
          setIsExporting(false);
          return; // Skip the writeTextFile below
        }

        case "json":
          console.log("Calling backend export_transactions_json...");
          content = await invoke<string>("export_transactions_json", {
            filter: finalFilters,
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
      case "excel":
        return "Export Transactions as Excel";
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
      case "excel":
        return "Export a formatted Excel file with colored transaction types directly to your device.";
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

          {/* Export Templates & Column Selection */}
          {exportType !== "backup" && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Template
                </label>
                <div className="flex gap-2">
                  <select
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={selectedTemplateId}
                    onChange={(e) => {
                      setSelectedTemplateId(e.target.value);
                      const t = templates.find(x => x.id === e.target.value);
                      if (t) {
                        try {
                          const parsedFilters = t.filters ? JSON.parse(t.filters) : null;
                          const cols = JSON.parse(t.columns) as string[];
                          const newSelectedCols = { ...selectedCols };
                          Object.keys(newSelectedCols).forEach(k => newSelectedCols[k] = cols.includes(k));
                          setSelectedCols(newSelectedCols);
                          
                          if (parsedFilters) {
                            if (parsedFilters.start_date || parsedFilters.end_date) {
                              setStartDate(parsedFilters.start_date || "");
                              setEndDate(parsedFilters.end_date || "");
                              setPeriod("custom");
                            }
                            setIncludePieChart(parsedFilters.include_pie_chart || false);
                            setIncludeHistogram(parsedFilters.include_histogram || false);
                          }
                        } catch {}
                      }
                    }}
                  >
                    <option value="">-- Custom --</option>
                    {templates.filter(t => t.format === exportType).map(t => (
                      <option key={t.id} value={t.id}>{t.name}</option>
                    ))}
                  </select>
                  <Button variant="ghost" onClick={() => setShowSaveTemplate(!showSaveTemplate)}>
                    Save As
                  </Button>
                </div>
                {showSaveTemplate && (
                  <div className="flex gap-2 mt-2">
                    <Input
                      value={newTemplateName}
                      onChange={(e) => setNewTemplateName(e.target.value)}
                      placeholder="Template Name"
                      className="flex-1"
                    />
                    <Button
                      size="sm"
                      onClick={async () => {
                        if (!newTemplateName) return;
                        try {
                          await invoke("create_export_template", {
                            input: {
                              id: crypto.randomUUID(),
                              name: newTemplateName,
                              columns: JSON.stringify(Object.keys(selectedCols).filter(k => selectedCols[k])),
                              filters: JSON.stringify({
                                ...(filters || {}),
                                start_date: startDate || undefined,
                                end_date: endDate || undefined,
                                include_pie_chart: includePieChart,
                                include_histogram: includeHistogram
                              }),
                              format: exportType,
                            }
                          });
                          setShowSaveTemplate(false);
                          setNewTemplateName("");
                          loadTemplates();
                        } catch (err) {
                          setError(`Failed to save template: ${err}`);
                        }
                      }}
                    >
                      Save
                    </Button>
                  </div>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Columns to Export
                </label>
                <div className="grid grid-cols-2 gap-2 bg-gray-50 dark:bg-gray-800/50 p-3 rounded-lg border border-gray-200 dark:border-gray-700">
                  {Object.keys(selectedCols).map(col => (
                    <label key={col} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedCols[col]}
                        onChange={(e) => {
                          setSelectedCols({ ...selectedCols, [col]: e.target.checked });
                          setSelectedTemplateId(""); // Custom
                        }}
                        className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{col}</span>
                    </label>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  Period
                </label>
                <div className="flex gap-2 mb-2">
                  <select
                    className="flex-1 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    value={period}
                    onChange={(e) => handlePeriodChange(e.target.value)}
                  >
                    <option value="this_month">This Month</option>
                    <option value="last_month">Last Month</option>
                    <option value="this_year">This Year</option>
                    <option value="all_time">All Time</option>
                    <option value="custom">Custom Range</option>
                  </select>
                </div>
                
                {period === "custom" && (
                  <div className="grid grid-cols-2 gap-2 mt-2">
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">Start Date</label>
                      <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full text-sm" />
                    </div>
                    <div>
                      <label className="block text-xs text-gray-500 mb-1">End Date</label>
                      <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full text-sm" />
                    </div>
                  </div>
                )}
              </div>

              {exportType === "excel" && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">Excel Charts (Optional)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 cursor-pointer p-2 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-200 dark:border-gray-700">
                      <input
                        type="checkbox"
                        checked={includePieChart}
                        onChange={e => setIncludePieChart(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Pie Chart (Expenses)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer p-2 bg-gray-50 dark:bg-gray-800/50 rounded border border-gray-200 dark:border-gray-700">
                      <input
                        type="checkbox"
                        checked={includeHistogram}
                        onChange={e => setIncludeHistogram(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Histogram (Over time)</span>
                    </label>
                  </div>
                </div>
              )}
            </div>
          )}

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
