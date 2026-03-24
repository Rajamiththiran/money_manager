import { useState, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Plus, Edit2, Trash2, Tag as TagIcon, Check } from "lucide-react";
import { useToast } from "./Toast";
import Button from "./Button";
import type { Tag, CreateTagInput, UpdateTagInput } from "../types/tag";
import { ask } from "@tauri-apps/plugin-dialog";

export default function SettingsTags() {
  const { success, error } = useToast();
  const [tags, setTags] = useState<Tag[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Form state
  const [isAdding, setIsAdding] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [formData, setFormData] = useState({ name: "", color: "#6B7280" });

  const PRESET_COLORS = [
    "#EF4444", // Red
    "#F97316", // Orange
    "#F59E0B", // Amber
    "#10B981", // Emerald
    "#06B6D4", // Cyan
    "#3B82F6", // Blue
    "#8B5CF6", // Violet
    "#EC4899", // Pink
    "#6B7280", // Gray
  ];

  const loadTags = async () => {
    try {
      const data = await invoke<Tag[]>("get_tags");
      setTags(data);
    } catch (err) {
      error("Failed to load tags", String(err));
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    loadTags();
  }, []);

  const handleSave = async () => {
    if (!formData.name.trim()) {
      error("Validation Error", "Tag name is required");
      return;
    }

    try {
      if (editingId) {
        const input: UpdateTagInput = {
          id: editingId,
          name: formData.name.trim(),
          color: formData.color,
        };
        await invoke("update_tag", { input });
        success("Tag Updated", "Tag saved successfully.");
      } else {
        const input: CreateTagInput = {
          name: formData.name.trim(),
          color: formData.color,
        };
        await invoke("create_tag", { input });
        success("Tag Created", "New tag added successfully.");
      }

      setFormData({ name: "", color: "#6B7280" });
      setIsAdding(false);
      setEditingId(null);
      await loadTags();
    } catch (err) {
      error("Failed to save tag", String(err));
    }
  };

  const handleDelete = async (id: number, name: string) => {
    const confirmed = await ask(
      `Are you sure you want to delete the "${name}" tag?\n\nThis will remove the tag from all transactions but will NOT delete the transactions themselves.`,
      {
        title: "Delete Tag",
        kind: "warning",
        okLabel: "Delete",
        cancelLabel: "Cancel",
      },
    );

    if (confirmed) {
      try {
        await invoke("delete_tag", { id });
        success("Tag Deleted", "Tag removed successfully.");
        await loadTags();
      } catch (err) {
        error("Failed to delete tag", String(err));
      }
    }
  };

  const startEdit = (tag: Tag) => {
    setEditingId(tag.id);
    setFormData({ name: tag.name, color: tag.color });
    setIsAdding(false);
  };

  const cancelEdit = () => {
    setEditingId(null);
    setIsAdding(false);
    setFormData({ name: "", color: "#6B7280" });
  };

  if (isLoading) {
    return (
      <div className="animate-pulse space-y-4 pt-4">
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
        <div className="h-12 bg-gray-200 dark:bg-gray-700 rounded-lg"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4 pt-4">
      {/* Header & Add Button */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium text-gray-900 dark:text-white flex items-center gap-2">
          <TagIcon className="w-5 h-5 text-gray-500" /> Manage Tags
        </h3>
        {!isAdding && !editingId && (
          <Button
            size="sm"
            onClick={() => {
              setIsAdding(true);
              setFormData({ name: "", color: PRESET_COLORS[8] });
            }}
            icon={<Plus className="w-4 h-4" />}
          >
            New Tag
          </Button>
        )}
      </div>

      {/* Form Area */}
      {(isAdding || editingId) && (
        <div className="bg-gray-50 dark:bg-gray-800/50 p-4 rounded-xl border border-gray-200 dark:border-gray-700 space-y-4">
          <h4 className="text-sm font-medium text-gray-900 dark:text-white">
            {editingId ? "Edit Tag" : "Create New Tag"}
          </h4>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-1">
                Tag Name
              </label>
              <input
                type="text"
                value={formData.name}
                onChange={(e) =>
                  setFormData({ ...formData, name: e.target.value })
                }
                placeholder="e.g., Business Trip, Renovation..."
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                autoFocus
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSave();
                  if (e.key === "Escape") cancelEdit();
                }}
              />
            </div>
            <div>
              <label className="block text-xs font-medium text-gray-500 dark:text-gray-400 mb-2">
                Color
              </label>
              <div className="flex flex-wrap gap-2">
                {PRESET_COLORS.map((color) => (
                  <button
                    key={color}
                    onClick={() => setFormData({ ...formData, color })}
                    className={`w-8 h-8 rounded-full flex items-center justify-center transition-transform hover:scale-110 ${
                      formData.color === color
                        ? "ring-2 ring-offset-2 ring-gray-400 dark:ring-offset-gray-800"
                        : ""
                    }`}
                    style={{ backgroundColor: color }}
                  >
                    {formData.color === color && (
                      <Check className="w-4 h-4 text-white" />
                    )}
                  </button>
                ))}
              </div>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="secondary" size="sm" onClick={cancelEdit}>
              Cancel
            </Button>
            <Button variant="primary" size="sm" onClick={handleSave}>
              Save Tag
            </Button>
          </div>
        </div>
      )}

      {/* Tags List */}
      <div className="bg-white dark:bg-gray-800 rounded-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {tags.length === 0 && !isAdding ? (
          <div className="p-8 text-center text-gray-500 dark:text-gray-400">
            <TagIcon className="w-8 h-8 mx-auto mb-2 opacity-50" />
            <p>No tags created yet.</p>
            <p className="text-sm mt-1">Tags help you track cross-category projects and events.</p>
          </div>
        ) : (
          <ul className="divide-y divide-gray-200 dark:divide-gray-700">
            {tags.map((tag) => (
              <li
                key={tag.id}
                className="flex items-center justify-between p-4 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors"
              >
                <div className="flex items-center gap-3">
                  <span
                    className="w-3 h-3 rounded-full flex-shrink-0"
                    style={{ backgroundColor: tag.color }}
                  />
                  <span className="font-medium text-gray-900 dark:text-white">
                    {tag.name}
                  </span>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    onClick={() => startEdit(tag)}
                    className="p-1.5 text-gray-400 hover:text-blue-500 dark:hover:text-blue-400 rounded-lg hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
                    title="Edit tag"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDelete(tag.id, tag.name)}
                    className="p-1.5 text-gray-400 hover:text-red-500 dark:hover:text-red-400 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                    title="Delete tag"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
