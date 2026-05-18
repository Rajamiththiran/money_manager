import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Trash2, Edit2, Check, X } from "lucide-react";
import Button from "./Button";
import Input from "./Input";
import Select from "./Select";
import { useToast } from "./Toast";

interface Category {
  id: number;
  name: string;
}

export interface CategorizationRule {
  id: string;
  match_pattern: string;
  match_type: string; // 'exact', 'contains', 'starts_with', 'regex'
  category_id: string;
  priority: number;
  created_at: string;
  updated_at: string;
}

export default function CategorizationRulesSettings() {
  const [rules, setRules] = useState<CategorizationRule[]>([]);
  const [categories, setCategories] = useState<Category[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isEditing, setIsEditing] = useState<string | null>(null);
  const { success, error } = useToast();

  const [editForm, setEditForm] = useState<Partial<CategorizationRule>>({});

  const loadData = async () => {
    setIsLoading(true);
    try {
      const [fetchedRules, fetchedCats] = await Promise.all([
        invoke<CategorizationRule[]>("get_categorization_rules"),
        invoke<{ id: number; name: string }[]>("get_categories"),
      ]);
      setRules(fetchedRules);
      setCategories(fetchedCats.map((c) => ({ id: c.id, name: c.name })));
    } catch (err) {
      error(`Failed to load data: ${err}`);
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleCreateNew = () => {
    const newId = crypto.randomUUID();
    setEditForm({
      id: newId,
      match_pattern: "",
      match_type: "contains",
      category_id: categories.length > 0 ? categories[0].id.toString() : "",
      priority: 0,
    });
    setIsEditing(newId);
  };

  const handleSave = async () => {
    if (!editForm.match_pattern || !editForm.category_id) {
      error("Match pattern and category are required.");
      return;
    }

    try {
      const isExisting = rules.some((r) => r.id === editForm.id);
      if (isExisting) {
        await invoke("update_categorization_rule", { input: editForm });
        success("Rule updated successfully.");
      } else {
        await invoke("create_categorization_rule", { input: editForm });
        success("Rule created successfully.");
      }
      setIsEditing(null);
      loadData();
    } catch (err) {
      error(`Failed to save rule: ${err}`);
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm("Are you sure you want to delete this rule?")) return;
    try {
      await invoke("delete_categorization_rule", { id });
      success("Rule deleted successfully.");
      loadData();
    } catch (err) {
      error(`Failed to delete rule: ${err}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-gray-500 dark:text-gray-400">
          Automatically categorize imported transactions based on memo or description keywords.
        </p>
        <Button onClick={handleCreateNew} size="sm" icon={<Plus className="w-4 h-4" />}>
          Add Rule
        </Button>
      </div>

      {isLoading ? (
        <div className="animate-pulse flex flex-col space-y-4">
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-full"></div>
          <div className="h-10 bg-gray-200 dark:bg-gray-700 rounded-lg w-full"></div>
        </div>
      ) : rules.length === 0 && !isEditing ? (
        <div className="text-center py-8 bg-gray-50 dark:bg-gray-800/50 rounded-xl border border-gray-200 dark:border-gray-700">
          <p className="text-sm text-gray-500 dark:text-gray-400">
            No categorization rules created yet.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {isEditing && !rules.some(r => r.id === isEditing) && (
            <RuleEditor
              form={editForm}
              categories={categories}
              onChange={setEditForm}
              onSave={handleSave}
              onCancel={() => setIsEditing(null)}
            />
          )}

          {rules.map((rule) => (
            isEditing === rule.id ? (
              <RuleEditor
                key={rule.id}
                form={editForm}
                categories={categories}
                onChange={setEditForm}
                onSave={handleSave}
                onCancel={() => setIsEditing(null)}
              />
            ) : (
              <div
                key={rule.id}
                className="flex items-center justify-between p-4 bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700"
              >
                <div className="flex items-center gap-4">
                  <div className="px-2.5 py-1 text-xs font-semibold rounded bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300">
                    {rule.match_type}
                  </div>
                  <div>
                    <p className="text-sm font-medium text-gray-900 dark:text-white">
                      "{rule.match_pattern}"
                    </p>
                    <p className="text-xs text-gray-500 dark:text-gray-400">
                      → {categories.find((c) => c.id.toString() === rule.category_id)?.name || "Unknown"}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-400 dark:text-gray-500 mr-2">Pri: {rule.priority}</span>
                  <button
                    onClick={() => {
                      setEditForm(rule);
                      setIsEditing(rule.id);
                    }}
                    className="p-1.5 text-gray-400 hover:text-amber-600 transition-colors"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(rule.id)}
                    className="p-1.5 text-gray-400 hover:text-red-600 transition-colors"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            )
          ))}
        </div>
      )}
    </div>
  );
}

function RuleEditor({
  form,
  categories,
  onChange,
  onSave,
  onCancel,
}: {
  form: Partial<CategorizationRule>;
  categories: Category[];
  onChange: (f: Partial<CategorizationRule>) => void;
  onSave: () => void;
  onCancel: () => void;
}) {
  return (
    <div className="p-4 bg-amber-50/50 dark:bg-amber-900/10 rounded-xl border border-amber-200 dark:border-amber-800 space-y-4">
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Pattern</label>
          <Input
            value={form.match_pattern || ""}
            onChange={(e) => onChange({ ...form, match_pattern: e.target.value })}
            placeholder="e.g. UBER EATS"
            className="w-full"
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Match Type</label>
          <Select
            value={form.match_type || "contains"}
            onChange={(e) => onChange({ ...form, match_type: e.target.value })}
            options={[
              { value: "contains", label: "Contains" },
              { value: "exact", label: "Exact Match" },
              { value: "starts_with", label: "Starts With" },
              { value: "regex", label: "Regular Expression" },
            ]}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Assign Category</label>
          <Select
            value={form.category_id || ""}
            onChange={(e) => onChange({ ...form, category_id: e.target.value })}
            options={categories.map((c) => ({ value: c.id.toString(), label: c.name }))}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 dark:text-gray-300 mb-1">Priority (Higher = run first)</label>
          <Input
            type="number"
            value={form.priority?.toString() || "0"}
            onChange={(e) => onChange({ ...form, priority: parseInt(e.target.value) || 0 })}
            className="w-full"
          />
        </div>
      </div>
      <div className="flex items-center justify-end gap-2 pt-2 border-t border-amber-200/50 dark:border-amber-800/50">
        <Button variant="ghost" size="sm" onClick={onCancel} icon={<X className="w-4 h-4" />}>
          Cancel
        </Button>
        <Button onClick={onSave} size="sm" icon={<Check className="w-4 h-4" />}>
          Save Rule
        </Button>
      </div>
    </div>
  );
}
