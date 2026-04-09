// File: src/components/ImportWizard.tsx
import { useState, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { open } from "@tauri-apps/plugin-dialog";
import { X, ChevronRight, ChevronLeft, FileSpreadsheet, Play, Check, AlertTriangle, XCircle, Upload, Undo2 } from "lucide-react";
import type { CsvPreview, ColumnMapping, ImportValidationResult, ImportOptions, ImportResult, RowValidation } from "../types/import";

// ===== STEP LABELS =====
const STEPS = ["Select File", "Map Columns", "Preview", "Import"] as const;

// Common auto-detect header names
const DATE_HEADERS = ["date", "transaction date", "trans date", "posting date", "value date", "txn date"];
const AMOUNT_HEADERS = ["amount", "debit", "credit", "value", "sum", "total"];
const TYPE_HEADERS = ["type", "transaction type", "kind", "category type"];
const CATEGORY_HEADERS = ["category", "group", "class", "tag"];
const MEMO_HEADERS = ["memo", "description", "note", "notes", "details", "narration", "reference", "particulars"];
const ACCOUNT_HEADERS = ["account", "account name", "bank", "source"];

function autoDetectColumn(headers: string[], knownNames: string[]): number | null {
  for (let i = 0; i < headers.length; i++) {
    const h = headers[i].toLowerCase().trim();
    if (knownNames.includes(h)) return i;
  }
  return null;
}

interface Account { id: number; name: string; }
interface Category { id: number; name: string; }

export default function ImportWizard({ onClose, onComplete }: { onClose: () => void; onComplete: () => void }) {
  const [step, setStep] = useState(0);

  // Step 1 state
  const [filePath, setFilePath] = useState("");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [isLoadingFile, setIsLoadingFile] = useState(false);

  // Step 2 state
  const [mapping, setMapping] = useState<ColumnMapping>({
    date_col: 0,
    amount_col: 1,
    type_col: null,
    account_col: null,
    category_col: null,
    memo_col: null,
    date_format: "YYYY-MM-DD",
    negative_as_expense: true,
  });

  // Step 3 state
  const [validation, setValidation] = useState<ImportValidationResult | null>(null);
  const [isValidating, setIsValidating] = useState(false);
  const [accounts, setAccounts] = useState<Account[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [accountMapping, setAccountMapping] = useState<Record<string, number>>({});
  const [categoryMapping, setCategoryMapping] = useState<Record<string, number>>({});

  // Step 4 state
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  const [createMissingCategories, setCreateMissingCategories] = useState(false);
  const [defaultAccountId, setDefaultAccountId] = useState<number>(0);
  const [isImporting, setIsImporting] = useState(false);
  const [importResult, setImportResult] = useState<ImportResult | null>(null);
  const [importProgress, setImportProgress] = useState(0);

  // ===== STEP 1: File Selection =====
  const handleChooseFile = useCallback(async () => {
    const selected = await open({
      filters: [{ name: "CSV Files", extensions: ["csv", "tsv", "txt"] }],
      title: "Select CSV File",
      multiple: false,
    });
    if (!selected) return;

    setIsLoadingFile(true);
    try {
      const result = await invoke<CsvPreview>("parse_csv_preview", { filePath: selected as string });
      setFilePath(selected as string);
      setPreview(result);

      // Auto-detect column mapping
      const headers = result.headers;
      const detectedDate = autoDetectColumn(headers, DATE_HEADERS);
      const detectedAmount = autoDetectColumn(headers, AMOUNT_HEADERS);
      const detectedType = autoDetectColumn(headers, TYPE_HEADERS);
      const detectedCategory = autoDetectColumn(headers, CATEGORY_HEADERS);
      const detectedMemo = autoDetectColumn(headers, MEMO_HEADERS);
      const detectedAccount = autoDetectColumn(headers, ACCOUNT_HEADERS);

      setMapping(prev => ({
        ...prev,
        date_col: detectedDate ?? 0,
        amount_col: detectedAmount ?? (headers.length > 1 ? 1 : 0),
        type_col: detectedType ?? null,
        category_col: detectedCategory ?? null,
        memo_col: detectedMemo ?? null,
        account_col: detectedAccount ?? null,
      }));
    } catch (err) {
      console.error("Failed to parse CSV:", err);
    } finally {
      setIsLoadingFile(false);
    }
  }, []);

  // ===== STEP 2 → 3: Validate =====
  const handleValidate = useCallback(async () => {
    setIsValidating(true);
    try {
      const [validationResult, accs, cats] = await Promise.all([
        invoke<ImportValidationResult>("validate_import_mapping", { filePath, mapping }),
        invoke<Account[]>("get_accounts"),
        invoke<{ id: number; name: string; type: string }[]>("get_categories"),
      ]);
      setValidation(validationResult);
      setAccounts(accs);
      setCategories(cats.map(c => ({ id: c.id, name: c.name })));
      if (accs.length > 0 && defaultAccountId === 0) {
        setDefaultAccountId(accs[0].id);
      }
      setStep(2);
    } catch (err) {
      console.error("Validation failed:", err);
    } finally {
      setIsValidating(false);
    }
  }, [filePath, mapping, defaultAccountId]);

  // ===== STEP 4: Execute =====
  const handleImport = useCallback(async () => {
    setIsImporting(true);
    setImportProgress(0);

    // Simulate progress
    const interval = setInterval(() => {
      setImportProgress(prev => Math.min(prev + 5, 90));
    }, 200);

    try {
      const options: ImportOptions = {
        skip_duplicates: skipDuplicates,
        create_missing_categories: createMissingCategories,
        default_account_id: defaultAccountId,
        account_mapping: accountMapping,
        category_mapping: categoryMapping,
      };
      const result = await invoke<ImportResult>("execute_import", { filePath, mapping, options });
      setImportResult(result);
      setImportProgress(100);
    } catch (err) {
      console.error("Import failed:", err);
    } finally {
      clearInterval(interval);
      setIsImporting(false);
    }
  }, [filePath, mapping, skipDuplicates, createMissingCategories, defaultAccountId, accountMapping, categoryMapping]);

  const handleUndo = useCallback(async () => {
    if (!importResult) return;
    try {
      const deleted = await invoke<number>("undo_import", { batchId: importResult.batch_id });
      setImportResult(prev => prev ? { ...prev, imported: 0, errors: 0, skipped: 0 } : null);
      console.log(`Undone: ${deleted} transactions deleted`);
      onComplete();
    } catch (err) {
      console.error("Undo failed:", err);
    }
  }, [importResult, onComplete]);

  // ===== RENDER =====
  const canGoNext = () => {
    if (step === 0) return preview !== null;
    if (step === 1) return true;
    if (step === 2) return validation !== null && validation.valid_count > 0;
    return false;
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-2xl w-[90vw] max-w-4xl max-h-[85vh] flex flex-col border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-900/30">
              <FileSpreadsheet className="w-5 h-5 text-amber-600 dark:text-amber-400" />
            </div>
            <div>
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Import CSV</h2>
              <p className="text-xs text-gray-500 dark:text-gray-400">Migrate transactions from other apps</p>
            </div>
          </div>
          <button onClick={onClose} className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors">
            <X className="w-5 h-5 text-gray-500" />
          </button>
        </div>

        {/* Progress Bar */}
        <div className="px-6 pt-4" id="import-wizard-progress">
          <div className="flex items-center gap-1">
            {STEPS.map((label, i) => (
              <div key={label} className="flex items-center flex-1">
                <div className={`flex items-center gap-2 ${i <= step ? 'text-amber-600 dark:text-amber-400' : 'text-gray-400'}`}>
                  <div className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold border-2 transition-all ${
                    i < step ? 'bg-amber-500 border-amber-500 text-white' :
                    i === step ? 'border-amber-500 text-amber-600 dark:text-amber-400' :
                    'border-gray-300 dark:border-gray-600 text-gray-400'
                  }`}>
                    {i < step ? <Check className="w-3.5 h-3.5" /> : i + 1}
                  </div>
                  <span className="text-xs font-medium hidden sm:inline">{label}</span>
                </div>
                {i < STEPS.length - 1 && (
                  <div className={`flex-1 h-0.5 mx-2 rounded ${i < step ? 'bg-amber-500' : 'bg-gray-200 dark:bg-gray-700'}`} />
                )}
              </div>
            ))}
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5" id="import-wizard-content">
          {step === 0 && (
            <StepFile
              preview={preview}
              isLoading={isLoadingFile}
              filePath={filePath}
              onChooseFile={handleChooseFile}
            />
          )}
          {step === 1 && preview && (
            <StepMapping
              headers={preview.headers}
              sampleRows={preview.rows.slice(0, 5)}
              mapping={mapping}
              onMappingChange={setMapping}
            />
          )}
          {step === 2 && validation && (
            <StepPreview
              validation={validation}
              accounts={accounts}
              categories={categories}
              accountMapping={accountMapping}
              categoryMapping={categoryMapping}
              onAccountMappingChange={setAccountMapping}
              onCategoryMappingChange={setCategoryMapping}
            />
          )}
          {step === 3 && (
            <StepConfirm
              validation={validation}
              skipDuplicates={skipDuplicates}
              createMissingCategories={createMissingCategories}
              defaultAccountId={defaultAccountId}
              accounts={accounts}
              isImporting={isImporting}
              importProgress={importProgress}
              importResult={importResult}
              onSkipDuplicatesChange={setSkipDuplicates}
              onCreateMissingCategoriesChange={setCreateMissingCategories}
              onDefaultAccountChange={setDefaultAccountId}
              onImport={handleImport}
              onUndo={handleUndo}
            />
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between px-6 py-4 border-t border-gray-200 dark:border-gray-700">
          <button
            onClick={() => step > 0 ? setStep(step - 1) : onClose()}
            disabled={isImporting}
            className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white transition-colors disabled:opacity-50"
          >
            <ChevronLeft className="w-4 h-4" />
            {step === 0 ? "Cancel" : "Back"}
          </button>

          <div className="flex items-center gap-3">
            {importResult ? (
              <button
                onClick={() => { onComplete(); onClose(); }}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-emerald-600 hover:bg-emerald-700 rounded-lg transition-colors"
              >
                <Check className="w-4 h-4" />
                Done
              </button>
            ) : step < 3 ? (
              <button
                onClick={() => {
                  if (step === 1) {
                    handleValidate();
                  } else {
                    setStep(step + 1);
                  }
                }}
                disabled={!canGoNext() || isValidating}
                className="flex items-center gap-2 px-5 py-2.5 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {isValidating ? "Validating..." : "Next"}
                <ChevronRight className="w-4 h-4" />
              </button>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// STEP 1: FILE SELECTION
// ═══════════════════════════════════════════════════
function StepFile({ preview, isLoading, filePath, onChooseFile }: {
  preview: CsvPreview | null;
  isLoading: boolean;
  filePath: string;
  onChooseFile: () => void;
}) {
  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <button
        onClick={onChooseFile}
        disabled={isLoading}
        id="import-choose-file-btn"
        className="w-full p-10 border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-xl hover:border-amber-400 dark:hover:border-amber-500 hover:bg-amber-50/50 dark:hover:bg-amber-900/10 transition-all text-center group"
      >
        <Upload className="w-10 h-10 mx-auto text-gray-400 group-hover:text-amber-500 transition-colors mb-3" />
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {isLoading ? "Reading file..." : "Click to choose a CSV file"}
        </p>
        <p className="text-xs text-gray-400 mt-1">Supports CSV, TSV, and TXT files</p>
      </button>

      {/* File info */}
      {preview && (
        <div className="p-4 bg-emerald-50 dark:bg-emerald-900/20 rounded-xl border border-emerald-200 dark:border-emerald-800">
          <div className="flex items-center gap-3 mb-3">
            <FileSpreadsheet className="w-5 h-5 text-emerald-600 dark:text-emerald-400" />
            <div>
              <p className="text-sm font-medium text-emerald-800 dark:text-emerald-300">
                {filePath.split(/[/\\]/).pop()}
              </p>
              <p className="text-xs text-emerald-600 dark:text-emerald-400">
                {preview.total_rows.toLocaleString()} rows · {preview.headers.length} columns · delimiter: {preview.detected_delimiter === "tab" ? "Tab" : `"${preview.detected_delimiter}"`}
              </p>
            </div>
          </div>

          {/* Preview table */}
          <div className="overflow-x-auto rounded-lg border border-emerald-200 dark:border-emerald-800">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-emerald-100 dark:bg-emerald-900/40">
                  {preview.headers.map((h, i) => (
                    <th key={i} className="px-3 py-2 text-left font-semibold text-emerald-800 dark:text-emerald-300 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {preview.rows.slice(0, 5).map((row, ri) => (
                  <tr key={ri} className="border-t border-emerald-100 dark:border-emerald-800/50">
                    {row.map((cell, ci) => (
                      <td key={ci} className="px-3 py-1.5 text-gray-700 dark:text-gray-300 whitespace-nowrap max-w-[200px] truncate">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// STEP 2: COLUMN MAPPING
// ═══════════════════════════════════════════════════
function StepMapping({ headers, sampleRows, mapping, onMappingChange }: {
  headers: string[];
  sampleRows: string[][];
  mapping: ColumnMapping;
  onMappingChange: (m: ColumnMapping) => void;
}) {
  const colOptions = [
    { value: -1, label: "— Skip —" },
    ...headers.map((h, i) => ({ value: i, label: `${h} (col ${i + 1})` })),
  ];

  const setCol = (field: keyof ColumnMapping, value: number) => {
    const v = value === -1 ? null : value;
    onMappingChange({ ...mapping, [field]: v } as ColumnMapping);
  };

  const fields: { key: keyof ColumnMapping; label: string; required: boolean; icon: React.ReactNode }[] = [
    { key: "date_col", label: "Date", required: true, icon: "📅" },
    { key: "amount_col", label: "Amount", required: true, icon: "💰" },
    { key: "type_col", label: "Type (Income/Expense)", required: false, icon: "🏷️" },
    { key: "account_col", label: "Account", required: false, icon: "🏦" },
    { key: "category_col", label: "Category", required: false, icon: "📂" },
    { key: "memo_col", label: "Memo / Description", required: false, icon: "📝" },
  ];

  return (
    <div className="space-y-6">
      <p className="text-sm text-gray-500 dark:text-gray-400">
        Map your CSV columns to Money Manager fields. Required fields are marked with *.
      </p>

      <div className="space-y-3">
        {fields.map(({ key, label, required, icon }) => (
          <div key={key} className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
            <span className="text-lg">{icon}</span>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-medium text-gray-900 dark:text-white">
                {label} {required && <span className="text-red-500">*</span>}
              </p>
            </div>
            <select
              value={typeof mapping[key] === "number" ? (mapping[key] as number) : -1}
              onChange={e => setCol(key, parseInt(e.target.value))}
              className="w-52 px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
            >
              {key === "date_col" || key === "amount_col" ? (
                headers.map((h, i) => (
                  <option key={i} value={i}>{h} (col {i + 1})</option>
                ))
              ) : (
                colOptions.map(opt => (
                  <option key={opt.value} value={opt.value}>{opt.label}</option>
                ))
              )}
            </select>
          </div>
        ))}
      </div>

      {/* Date format and negative toggle */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Date Format</p>
          <select
            value={mapping.date_format}
            onChange={e => onMappingChange({ ...mapping, date_format: e.target.value })}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            <option value="YYYY-MM-DD">YYYY-MM-DD (2025-01-15)</option>
            <option value="MM/DD/YYYY">MM/DD/YYYY (01/15/2025)</option>
            <option value="DD/MM/YYYY">DD/MM/YYYY (15/01/2025)</option>
          </select>
        </div>

        {mapping.type_col === null && (
          <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
            <p className="text-sm font-medium text-gray-900 dark:text-white mb-2">Negative Amounts</p>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={mapping.negative_as_expense}
                onChange={e => onMappingChange({ ...mapping, negative_as_expense: e.target.checked })}
                className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
              />
              <span className="text-sm text-gray-700 dark:text-gray-300">Treat negative amounts as expenses</span>
            </label>
          </div>
        )}
      </div>

      {/* Sample preview with mapping applied */}
      {sampleRows.length > 0 && (
        <div>
          <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">Preview with mapping applied:</p>
          <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700">
            <table className="w-full text-xs">
              <thead>
                <tr className="bg-gray-100 dark:bg-gray-700/50">
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Date</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Amount</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Type</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Category</th>
                  <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Memo</th>
                </tr>
              </thead>
              <tbody>
                {sampleRows.map((row, ri) => (
                  <tr key={ri} className="border-t border-gray-100 dark:border-gray-700/50">
                    <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{row[mapping.date_col] ?? "—"}</td>
                    <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{row[mapping.amount_col] ?? "—"}</td>
                    <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{mapping.type_col !== null ? (row[mapping.type_col] ?? "—") : "auto"}</td>
                    <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{mapping.category_col !== null ? (row[mapping.category_col] ?? "—") : "—"}</td>
                    <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 max-w-[200px] truncate">{mapping.memo_col !== null ? (row[mapping.memo_col] ?? "—") : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════
// STEP 3: PREVIEW & VALIDATE
// ═══════════════════════════════════════════════════
function StepPreview({ validation, accounts, categories, accountMapping, categoryMapping, onAccountMappingChange, onCategoryMappingChange }: {
  validation: ImportValidationResult;
  accounts: Account[];
  categories: Category[];
  accountMapping: Record<string, number>;
  categoryMapping: Record<string, number>;
  onAccountMappingChange: (m: Record<string, number>) => void;
  onCategoryMappingChange: (m: Record<string, number>) => void;
}) {
  const totalRows = validation.valid_count + validation.warning_count + validation.error_count;

  return (
    <div className="space-y-5">
      {/* Summary bar */}
      <div className="grid grid-cols-3 gap-3" id="import-validation-summary">
        <div className="p-3 bg-emerald-50 dark:bg-emerald-900/20 rounded-lg border border-emerald-200 dark:border-emerald-800 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <Check className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400">Valid</span>
          </div>
          <p className="text-xl font-bold text-emerald-700 dark:text-emerald-300">{validation.valid_count}</p>
        </div>
        <div className="p-3 bg-amber-50 dark:bg-amber-900/20 rounded-lg border border-amber-200 dark:border-amber-800 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <AlertTriangle className="w-4 h-4 text-amber-600 dark:text-amber-400" />
            <span className="text-xs font-medium text-amber-600 dark:text-amber-400">Warnings</span>
          </div>
          <p className="text-xl font-bold text-amber-700 dark:text-amber-300">{validation.warning_count}</p>
        </div>
        <div className="p-3 bg-red-50 dark:bg-red-900/20 rounded-lg border border-red-200 dark:border-red-800 text-center">
          <div className="flex items-center justify-center gap-1.5 mb-1">
            <XCircle className="w-4 h-4 text-red-600 dark:text-red-400" />
            <span className="text-xs font-medium text-red-600 dark:text-red-400">Errors</span>
          </div>
          <p className="text-xl font-bold text-red-700 dark:text-red-300">{validation.error_count}</p>
        </div>
      </div>

      {/* Unmatched accounts mapping */}
      {validation.unmatched_accounts.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-3">
            Unmatched accounts — assign to existing accounts:
          </p>
          <div className="space-y-2">
            {validation.unmatched_accounts.map(name => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 dark:text-gray-300 w-40 truncate" title={name}>{name}</span>
                <span className="text-gray-400">→</span>
                <select
                  value={accountMapping[name] ?? ""}
                  onChange={e => onAccountMappingChange({ ...accountMapping, [name]: parseInt(e.target.value) })}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">— Use default —</option>
                  {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Unmatched categories mapping */}
      {validation.unmatched_categories.length > 0 && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300 mb-3">
            Unmatched categories — assign or create automatically:
          </p>
          <div className="space-y-2">
            {validation.unmatched_categories.map(name => (
              <div key={name} className="flex items-center gap-3">
                <span className="text-sm text-gray-700 dark:text-gray-300 w-40 truncate" title={name}>{name}</span>
                <span className="text-gray-400">→</span>
                <select
                  value={categoryMapping[name] ?? ""}
                  onChange={e => onCategoryMappingChange({ ...categoryMapping, [name]: parseInt(e.target.value) })}
                  className="flex-1 px-3 py-1.5 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                >
                  <option value="">— Auto-create —</option>
                  {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
                </select>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Row preview table */}
      <div>
        <p className="text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
          Showing first {Math.min(validation.rows.length, 10)} of {totalRows} rows:
        </p>
        <div className="overflow-x-auto rounded-lg border border-gray-200 dark:border-gray-700 max-h-[300px]">
          <table className="w-full text-xs">
            <thead className="sticky top-0">
              <tr className="bg-gray-100 dark:bg-gray-700/50">
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300 w-8">✓</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Date</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Amount</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Type</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Category</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Memo</th>
                <th className="px-3 py-2 text-left font-semibold text-gray-600 dark:text-gray-300">Issue</th>
              </tr>
            </thead>
            <tbody>
              {validation.rows.slice(0, 10).map((row: RowValidation) => (
                <tr key={row.row_index} className={`border-t border-gray-100 dark:border-gray-700/50 ${
                  row.status === "error" ? "bg-red-50/50 dark:bg-red-900/10" :
                  row.status === "warning" ? "bg-amber-50/50 dark:bg-amber-900/10" : ""
                }`}>
                  <td className="px-3 py-1.5">
                    {row.status === "valid" && <Check className="w-3.5 h-3.5 text-emerald-500" />}
                    {row.status === "warning" && <AlertTriangle className="w-3.5 h-3.5 text-amber-500" />}
                    {row.status === "error" && <XCircle className="w-3.5 h-3.5 text-red-500" />}
                  </td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{row.date}</td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300">{row.amount.toFixed(2)}</td>
                  <td className="px-3 py-1.5">
                    <span className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold ${
                      row.transaction_type === "INCOME" ? "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" :
                      "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400"
                    }`}>{row.transaction_type}</span>
                  </td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 max-w-[120px] truncate">{row.category_name || "—"}</td>
                  <td className="px-3 py-1.5 text-gray-700 dark:text-gray-300 max-w-[150px] truncate">{row.memo || "—"}</td>
                  <td className="px-3 py-1.5 text-xs text-red-500">{row.error || ""}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════
// STEP 4: CONFIRM & IMPORT
// ═══════════════════════════════════════════════════
function StepConfirm({ validation, skipDuplicates, createMissingCategories, defaultAccountId, accounts, isImporting, importProgress, importResult, onSkipDuplicatesChange, onCreateMissingCategoriesChange, onDefaultAccountChange, onImport, onUndo }: {
  validation: ImportValidationResult | null;
  skipDuplicates: boolean;
  createMissingCategories: boolean;
  defaultAccountId: number;
  accounts: Account[];
  isImporting: boolean;
  importProgress: number;
  importResult: ImportResult | null;
  onSkipDuplicatesChange: (v: boolean) => void;
  onCreateMissingCategoriesChange: (v: boolean) => void;
  onDefaultAccountChange: (id: number) => void;
  onImport: () => void;
  onUndo: () => void;
}) {
  // Show result screen after import
  if (importResult) {
    return (
      <div className="flex flex-col items-center justify-center py-10 space-y-6" id="import-result">
        <div className="w-16 h-16 rounded-full bg-emerald-100 dark:bg-emerald-900/30 flex items-center justify-center">
          <Check className="w-8 h-8 text-emerald-600 dark:text-emerald-400" />
        </div>
        <div className="text-center">
          <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-2">Import Complete</h3>
          <p className="text-sm text-gray-500 dark:text-gray-400">Your transactions have been imported.</p>
        </div>

        <div className="grid grid-cols-3 gap-6 text-center">
          <div>
            <p className="text-2xl font-bold text-emerald-600 dark:text-emerald-400">{importResult.imported}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Imported</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-amber-600 dark:text-amber-400">{importResult.skipped}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Skipped</p>
          </div>
          <div>
            <p className="text-2xl font-bold text-red-600 dark:text-red-400">{importResult.errors}</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Errors</p>
          </div>
        </div>

        <button
          onClick={onUndo}
          className="flex items-center gap-2 px-4 py-2 text-sm font-medium text-amber-700 dark:text-amber-400 bg-amber-50 dark:bg-amber-900/20 hover:bg-amber-100 dark:hover:bg-amber-900/30 rounded-lg border border-amber-200 dark:border-amber-800 transition-colors"
        >
          <Undo2 className="w-4 h-4" />
          Undo Import (available for 24h)
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Summary */}
      {validation && (
        <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-1">Ready to import</p>
          <p className="text-sm text-gray-500 dark:text-gray-400">
            {validation.valid_count} valid transactions will be imported. {validation.warning_count > 0 ? `${validation.warning_count} duplicates detected.` : ""}
          </p>
        </div>
      )}

      {/* Options */}
      <div className="space-y-4">
        <div className="p-4 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-900 dark:text-white mb-3">Default Account</p>
          <select
            value={defaultAccountId}
            onChange={e => onDefaultAccountChange(parseInt(e.target.value))}
            className="w-full px-3 py-2 text-sm rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
          >
            {accounts.map(a => <option key={a.id} value={a.id}>{a.name}</option>)}
          </select>
          <p className="text-xs text-gray-400 mt-1">Used when no account column is mapped or no match found</p>
        </div>

        <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={skipDuplicates}
            onChange={e => onSkipDuplicatesChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Skip duplicates</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Transactions matching date + amount + type will be skipped</p>
          </div>
        </label>

        <label className="flex items-center gap-3 p-3 bg-gray-50 dark:bg-gray-700/30 rounded-lg border border-gray-100 dark:border-gray-700 cursor-pointer">
          <input
            type="checkbox"
            checked={createMissingCategories}
            onChange={e => onCreateMissingCategoriesChange(e.target.checked)}
            className="w-4 h-4 rounded border-gray-300 text-amber-600 focus:ring-amber-500"
          />
          <div>
            <p className="text-sm font-medium text-gray-900 dark:text-white">Create missing categories</p>
            <p className="text-xs text-gray-500 dark:text-gray-400">Automatically create new categories for unmatched names</p>
          </div>
        </label>
      </div>

      {/* Progress bar during import */}
      {isImporting && (
        <div className="p-4 bg-amber-50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800">
          <div className="flex items-center justify-between mb-2">
            <p className="text-sm font-medium text-amber-800 dark:text-amber-300">Importing transactions...</p>
            <p className="text-sm font-bold text-amber-600 dark:text-amber-400">{importProgress}%</p>
          </div>
          <div className="w-full h-2 bg-amber-200 dark:bg-amber-900/30 rounded-full overflow-hidden">
            <div
              className="h-full bg-amber-500 rounded-full transition-all duration-300"
              style={{ width: `${importProgress}%` }}
            />
          </div>
        </div>
      )}

      {/* Import button */}
      {!isImporting && (
        <button
          onClick={onImport}
          id="import-execute-btn"
          className="w-full flex items-center justify-center gap-2 px-6 py-3 text-sm font-semibold text-white bg-amber-600 hover:bg-amber-700 rounded-xl transition-colors shadow-lg shadow-amber-500/20"
        >
          <Play className="w-4 h-4" />
          Start Import
        </button>
      )}
    </div>
  );
}
