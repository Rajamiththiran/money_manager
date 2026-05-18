import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { save } from "@tauri-apps/plugin-dialog";
import { writeTextFile, writeFile } from "@tauri-apps/plugin-fs";
import { X, Download, Save, Trash2, Check, AlertTriangle } from "lucide-react";
import Button from "./Button";
import Input from "./Input";
import Select from "./Select";
import { useToast } from "./Toast";
import type { ExportTemplate } from "../types/advanced";

interface ExportFilter {
  start_date: string | null;
  end_date: string | null;
  transaction_type: string | null;
  account_id: number | null;
  category_id: number | null;
  columns: string[] | null;
  include_pie_chart: boolean | null;
  include_histogram: boolean | null;
}

const AVAILABLE_COLUMNS = [
  "Date",
  "Type",
  "Account",
  "To Account",
  "Category",
  "Amount",
  "Memo",
];

export default function ExportModal({ onClose }: { onClose: () => void }) {
  const { success, error } = useToast();
  
  const [isExporting, setIsExporting] = useState(false);
  const [format, setFormat] = useState<"csv" | "json" | "excel">("csv");
  
  // Filters
  const [period, setPeriod] = useState("this_month");
  
  const getInitialDates = () => {
    const today = new Date();
    const start = new Date(today.getFullYear(), today.getMonth(), 1);
    const end = new Date(today.getFullYear(), today.getMonth() + 1, 0);
    return {
      start: start.toISOString().split("T")[0],
      end: end.toISOString().split("T")[0]
    };
  };

  const initialDates = getInitialDates();
  const [startDate, setStartDate] = useState(initialDates.start);
  const [endDate, setEndDate] = useState(initialDates.end);
  const [transactionType, setTransactionType] = useState("ALL");
  const [accountId, setAccountId] = useState("");
  const [categoryId, setCategoryId] = useState("");
  
  // Charts
  const [includePieChart, setIncludePieChart] = useState(false);
  const [includeHistogram, setIncludeHistogram] = useState(false);
  
  // Columns
  const [selectedColumns, setSelectedColumns] = useState<string[]>(AVAILABLE_COLUMNS);
  
  // Templates
  const [templates, setTemplates] = useState<ExportTemplate[]>([]);
  const [selectedTemplateId, setSelectedTemplateId] = useState("");
  const [showSaveTemplate, setShowSaveTemplate] = useState(false);
  const [newTemplateName, setNewTemplateName] = useState("");

  // Options
  const [accounts, setAccounts] = useState<{ id: number; name: string }[]>([]);
  const [categories, setCategories] = useState<{ id: number; name: string }[]>([]);

  useEffect(() => {
    loadData();
  }, []);

  const loadData = async () => {
    try {
      const [accs, cats, tmpls] = await Promise.all([
        invoke<{ id: number; name: string }[]>("get_accounts"),
        invoke<{ id: number; name: string }[]>("get_categories"),
        invoke<ExportTemplate[]>("get_export_templates"),
      ]);
      setAccounts(accs);
      setCategories(cats);
      setTemplates(tmpls);
    } catch (err) {
      error(`Failed to load data: ${err}`);
    }
  };

  const handleToggleColumn = (col: string) => {
    setSelectedColumns(prev => 
      prev.includes(col) ? prev.filter(c => c !== col) : [...prev, col]
    );
  };

  const handleApplyTemplate = (id: string) => {
    setSelectedTemplateId(id);
    if (!id) return;
    
    const tmpl = templates.find(t => t.id === id);
    if (tmpl) {
      try {
        setFormat(tmpl.format as "csv" | "json" | "excel");
        setSelectedColumns(JSON.parse(tmpl.columns));
        
        const filters = JSON.parse(tmpl.filters || "{}");
        setStartDate(filters.start_date || "");
        setEndDate(filters.end_date || "");
        setTransactionType(filters.transaction_type || "ALL");
        setAccountId(filters.account_id ? filters.account_id.toString() : "");
        setCategoryId(filters.category_id ? filters.category_id.toString() : "");
        setIncludePieChart(filters.include_pie_chart || false);
        setIncludeHistogram(filters.include_histogram || false);
        
        // Custom dates means it's a custom period
        if (filters.start_date || filters.end_date) {
          setPeriod("custom");
        }
      } catch (e) {
        console.error("Failed to parse template settings", e);
      }
    }
  };

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
      return; // leave as is
    }

    setStartDate(start.toISOString().split("T")[0]);
    setEndDate(end.toISOString().split("T")[0]);
  };

  const handleSaveTemplate = async () => {
    if (!newTemplateName) {
      error("Please enter a template name");
      return;
    }
    
    try {
      const filters = {
        start_date: startDate || null,
        end_date: endDate || null,
        transaction_type: transactionType === "ALL" ? null : transactionType,
        account_id: accountId ? parseInt(accountId) : null,
        category_id: categoryId ? parseInt(categoryId) : null,
        include_pie_chart: includePieChart,
        include_histogram: includeHistogram,
      };
      
      const newTmpl = await invoke<ExportTemplate>("create_export_template", {
        input: {
          id: crypto.randomUUID(),
          name: newTemplateName,
          columns: JSON.stringify(selectedColumns),
          filters: JSON.stringify(filters),
          format: format,
        }
      });
      
      setTemplates([...templates, newTmpl]);
      setSelectedTemplateId(newTmpl.id);
      setShowSaveTemplate(false);
      setNewTemplateName("");
      success("Template saved!");
    } catch (err) {
      error(`Failed to save template: ${err}`);
    }
  };

  const handleDeleteTemplate = async () => {
    if (!selectedTemplateId) return;
    if (!confirm("Delete this template?")) return;
    
    try {
      await invoke("delete_export_template", { id: selectedTemplateId });
      setTemplates(templates.filter(t => t.id !== selectedTemplateId));
      setSelectedTemplateId("");
      success("Template deleted");
    } catch (err) {
      error(`Failed to delete template: ${err}`);
    }
  };

  const handleExport = async () => {
    if (selectedColumns.length === 0) {
      error("Please select at least one column to export");
      return;
    }
    
    setIsExporting(true);
    try {
      const filter: ExportFilter = {
        start_date: startDate || null,
        end_date: endDate || null,
        transaction_type: transactionType === "ALL" ? null : transactionType,
        account_id: accountId ? parseInt(accountId) : null,
        category_id: categoryId ? parseInt(categoryId) : null,
        columns: selectedColumns,
        include_pie_chart: format === "excel" ? includePieChart : false,
        include_histogram: format === "excel" ? includeHistogram : false,
      };

      const dateStr = new Date().toISOString().split("T")[0];
      const extension = format === "excel" ? "xlsx" : format;
      const defaultName = `money_manager_export_${dateStr}.${extension}`;

      const savePath = await save({
        defaultPath: defaultName,
        filters: [{ name: "Export File", extensions: [extension] }],
        title: "Save Export File",
      });

      if (!savePath) {
        setIsExporting(false);
        return;
      }

      if (format === "csv") {
        const content = await invoke<string>("export_transactions_csv", { filter });
        await writeTextFile(savePath, content);
      } else if (format === "json") {
        const content = await invoke<string>("export_transactions_json", { filter });
        await writeTextFile(savePath, content);
      } else if (format === "excel") {
        const content = await invoke<Uint8Array>("export_transactions_excel", { filter });
        await writeFile(savePath, content);
      }

      success("Export Complete", `Saved to ${savePath.split(/[/\\]/).pop()}`);
      onClose();
    } catch (err) {
      error(`Export failed: ${err}`);
    } finally {
      setIsExporting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-full max-w-3xl flex flex-col border border-gray-200 dark:border-gray-700 max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-blue-100 dark:bg-blue-900/30">
              <Download className="w-5 h-5 text-blue-600 dark:text-blue-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Advanced Export</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Export your transactions with custom filters and columns</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
            
            {/* Left Column: Filters */}
            <div className="space-y-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                1. Data Filters
              </h3>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Period</label>
                <Select
                  value={period}
                  onChange={e => handlePeriodChange(e.target.value)}
                  options={[
                    { value: "this_month", label: "This Month" },
                    { value: "last_month", label: "Last Month" },
                    { value: "this_year", label: "This Year" },
                    { value: "all_time", label: "All Time" },
                    { value: "custom", label: "Custom Range" },
                  ]}
                />
              </div>
              
              {period === "custom" && (
                <div className="grid grid-cols-2 gap-4">
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Start Date</label>
                    <Input type="date" value={startDate} onChange={e => setStartDate(e.target.value)} className="w-full" />
                  </div>
                  <div>
                    <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">End Date</label>
                    <Input type="date" value={endDate} onChange={e => setEndDate(e.target.value)} className="w-full" />
                  </div>
                </div>
              )}
              
              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Transaction Type</label>
                <Select
                  value={transactionType}
                  onChange={e => setTransactionType(e.target.value)}
                  options={[
                    { value: "ALL", label: "All Types" },
                    { value: "INCOME", label: "Income Only" },
                    { value: "EXPENSE", label: "Expenses Only" },
                    { value: "TRANSFER", label: "Transfers Only" },
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Account</label>
                <Select
                  value={accountId}
                  onChange={e => setAccountId(e.target.value)}
                  options={[
                    { value: "", label: "All Accounts" },
                    ...accounts.map(a => ({ value: a.id.toString(), label: a.name }))
                  ]}
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Category</label>
                <Select
                  value={categoryId}
                  onChange={e => setCategoryId(e.target.value)}
                  options={[
                    { value: "", label: "All Categories" },
                    ...categories.map(c => ({ value: c.id.toString(), label: c.name }))
                  ]}
                />
              </div>
            </div>
            
            {/* Right Column: Columns & Format */}
            <div className="space-y-5">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white border-b border-gray-200 dark:border-gray-700 pb-2">
                2. Columns & Format
              </h3>

              <div>
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Export Format</label>
                <div className="flex items-center gap-3">
                  {(["csv", "excel", "json"] as const).map(fmt => (
                    <button
                      key={fmt}
                      onClick={() => setFormat(fmt)}
                      className={`flex-1 py-2 text-sm font-medium rounded-lg border transition-colors ${
                        format === fmt 
                          ? "bg-blue-50 border-blue-200 text-blue-700 dark:bg-blue-900/30 dark:border-blue-800 dark:text-blue-300"
                          : "bg-white border-gray-200 text-gray-700 dark:bg-gray-800 dark:border-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700"
                      }`}
                    >
                      {fmt.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Included Columns</label>
                  <button 
                    onClick={() => setSelectedColumns(selectedColumns.length === AVAILABLE_COLUMNS.length ? [] : AVAILABLE_COLUMNS)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    {selectedColumns.length === AVAILABLE_COLUMNS.length ? "Deselect All" : "Select All"}
                  </button>
                </div>
                <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-200 dark:border-gray-700">
                  {AVAILABLE_COLUMNS.map(col => (
                    <label key={col} className="flex items-center gap-2 cursor-pointer">
                      <input
                        type="checkbox"
                        checked={selectedColumns.includes(col)}
                        onChange={() => handleToggleColumn(col)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">{col}</span>
                    </label>
                  ))}
                </div>
                {selectedColumns.length === 0 && (
                  <p className="text-xs text-red-500 mt-1 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3" /> Select at least one column
                  </p>
                )}
              </div>

              {format === "excel" && (
                <div>
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-2">Excel Charts (Optional)</label>
                  <div className="grid grid-cols-2 gap-2">
                    <label className="flex items-center gap-2 cursor-pointer p-2 bg-gray-50 dark:bg-gray-700/30 rounded border border-gray-200 dark:border-gray-700">
                      <input
                        type="checkbox"
                        checked={includePieChart}
                        onChange={e => setIncludePieChart(e.target.checked)}
                        className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                      />
                      <span className="text-sm text-gray-700 dark:text-gray-300">Pie Chart (Expenses)</span>
                    </label>
                    <label className="flex items-center gap-2 cursor-pointer p-2 bg-gray-50 dark:bg-gray-700/30 rounded border border-gray-200 dark:border-gray-700">
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

              {/* Templates */}
              <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
                <div className="flex items-center justify-between mb-2">
                  <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">Saved Templates</label>
                  <button 
                    onClick={() => setShowSaveTemplate(!showSaveTemplate)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline flex items-center gap-1"
                  >
                    <Save className="w-3 h-3" /> Save current
                  </button>
                </div>
                
                {showSaveTemplate && (
                  <div className="flex items-center gap-2 mb-3 p-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg border border-blue-100 dark:border-blue-800">
                    <Input 
                      value={newTemplateName} 
                      onChange={e => setNewTemplateName(e.target.value)} 
                      placeholder="Template name..." 
                      className="flex-1 text-sm h-8"
                    />
                    <Button size="sm" onClick={handleSaveTemplate} icon={<Check className="w-3 h-3" />}>Save</Button>
                  </div>
                )}
                
                <div className="flex items-center gap-2">
                  <Select
                    value={selectedTemplateId}
                    onChange={e => handleApplyTemplate(e.target.value)}
                    options={[
                      { value: "", label: "— Select a template —" },
                      ...templates.map(t => ({ value: t.id, label: t.name }))
                    ]}
                  />
                  {selectedTemplateId && (
                    <button 
                      onClick={handleDeleteTemplate}
                      className="p-2 text-gray-400 hover:text-red-500 transition-colors bg-gray-100 dark:bg-gray-700 rounded-lg"
                      title="Delete template"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  )}
                </div>
              </div>
              
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 px-6 py-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/80 rounded-b-2xl">
          <Button variant="ghost" onClick={onClose} disabled={isExporting}>
            Cancel
          </Button>
          <Button 
            onClick={handleExport} 
            disabled={isExporting || selectedColumns.length === 0}
            icon={isExporting ? undefined : <Download className="w-4 h-4" />}
          >
            {isExporting ? "Exporting..." : "Export Data"}
          </Button>
        </div>
      </div>
    </div>
  );
}
