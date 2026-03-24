// File: src/components/TagPicker.tsx
import { useState, useRef, useEffect } from "react";
import { PlusIcon, XMarkIcon } from "@heroicons/react/24/outline";
import type { Tag } from "../types/tag";

interface TagPickerProps {
  tags: Tag[];
  selectedIds: number[];
  onChange: (ids: number[]) => void;
}

export default function TagPicker({
  tags,
  selectedIds,
  onChange,
}: TagPickerProps) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  // Close on outside click
  useEffect(() => {
    const handleClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    if (open) document.addEventListener("mousedown", handleClick);
    return () => document.removeEventListener("mousedown", handleClick);
  }, [open]);

  const toggle = (id: number) => {
    if (selectedIds.includes(id)) {
      onChange(selectedIds.filter((sid) => sid !== id));
    } else {
      onChange([...selectedIds, id]);
    }
  };

  const remove = (id: number) => {
    onChange(selectedIds.filter((sid) => sid !== id));
  };

  const selectedTags = tags.filter((t) => selectedIds.includes(t.id));
  const availableTags = tags.filter((t) => !selectedIds.includes(t.id));

  return (
    <div ref={ref} className="relative">
      {/* Selected tags + toggle button */}
      <div className="flex flex-wrap items-center gap-1.5">
        {selectedTags.map((tag) => (
          <span
            key={tag.id}
            className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium text-white"
            style={{ backgroundColor: tag.color }}
          >
            {tag.name}
            <button
              type="button"
              onClick={() => remove(tag.id)}
              className="hover:opacity-70 transition-opacity"
            >
              <XMarkIcon className="h-3 w-3" />
            </button>
          </span>
        ))}

        <button
          type="button"
          onClick={() => setOpen(!open)}
          className="inline-flex items-center gap-1 px-2 py-1 text-xs font-medium text-gray-500 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 rounded-full hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
        >
          <PlusIcon className="h-3 w-3" />
          Tag
        </button>
      </div>

      {/* Dropdown */}
      {open && (
        <div className="absolute z-20 mt-1.5 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 max-h-48 overflow-y-auto">
          {availableTags.length === 0 && selectedTags.length === tags.length ? (
            <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
              All tags selected
            </p>
          ) : availableTags.length === 0 ? (
            <p className="px-3 py-2 text-xs text-gray-400 dark:text-gray-500">
              No tags created yet. Add tags in Settings.
            </p>
          ) : (
            availableTags.map((tag) => (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id)}
                className="w-full flex items-center gap-2 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
              >
                <span
                  className="w-3 h-3 rounded-full flex-shrink-0"
                  style={{ backgroundColor: tag.color }}
                />
                {tag.name}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
