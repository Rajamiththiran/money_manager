// File: src/components/CategoryTree.tsx
import { useState } from "react";
import {
  ChevronRightIcon,
  ChevronDownIcon,
  PencilIcon,
  TrashIcon,
} from "@heroicons/react/24/outline";
import clsx from "clsx";
import type { CategoryWithChildren } from "../types/category";

interface CategoryTreeProps {
  category: CategoryWithChildren;
  onEdit: (category: CategoryWithChildren) => void;
  onDelete: (categoryId: number) => void;
  level?: number;
}

export default function CategoryTree({
  category,
  onEdit,
  onDelete,
  level = 0,
}: CategoryTreeProps) {
  const [isExpanded, setIsExpanded] = useState(true);
  const hasChildren = category.children && category.children.length > 0;

  const colorClass =
    category.category_type === "INCOME"
      ? "text-green-600 dark:text-green-400"
      : "text-red-600 dark:text-red-400";

  const bgHoverClass =
    category.category_type === "INCOME"
      ? "hover:bg-green-50 dark:hover:bg-green-900/10"
      : "hover:bg-red-50 dark:hover:bg-red-900/10";

  return (
    <div>
      {/* Parent Category */}
      <div
        className={clsx(
          "flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 transition-colors",
          bgHoverClass,
        )}
        style={{ paddingLeft: `${level * 2 + 1}rem` }}
      >
        <div className="flex items-center gap-3 flex-1">
          {/* Expand/Collapse Button */}
          {hasChildren && (
            <button
              onClick={() => setIsExpanded(!isExpanded)}
              className="p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
            >
              {isExpanded ? (
                <ChevronDownIcon className="h-4 w-4 text-gray-500" />
              ) : (
                <ChevronRightIcon className="h-4 w-4 text-gray-500" />
              )}
            </button>
          )}

          {/* Category Name */}
          <div className="flex items-center gap-2">
            <div
              className={clsx("w-3 h-3 rounded-full", {
                "bg-green-500": category.category_type === "INCOME",
                "bg-red-500": category.category_type === "EXPENSE",
              })}
            />
            <span className={clsx("font-medium", colorClass)}>
              {category.name}
            </span>
            {hasChildren && (
              <span className="text-xs text-gray-500 dark:text-gray-400">
                ({category.children.length} subcategories)
              </span>
            )}
          </div>
        </div>

        {/* Actions */}
        <div className="flex items-center gap-2">
          <button
            onClick={() => onEdit(category)}
            className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            aria-label="Edit category"
          >
            <PencilIcon className="h-4 w-4" />
          </button>
          <button
            onClick={() => onDelete(category.id)}
            className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
            aria-label="Delete category"
          >
            <TrashIcon className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Children Categories */}
      {hasChildren && isExpanded && (
        <div>
          {category.children.map((child) => (
            <div
              key={child.id}
              className={clsx(
                "flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700 transition-colors",
                bgHoverClass,
              )}
              style={{ paddingLeft: `${(level + 1) * 2 + 1}rem` }}
            >
              <div className="flex items-center gap-3 flex-1">
                <div className="w-2 h-2 rounded-full bg-gray-400" />
                <span className="text-gray-700 dark:text-gray-300">
                  {child.name}
                </span>
              </div>

              <div className="flex items-center gap-2">
                <button
                  onClick={() =>
                    onEdit({
                      ...child,
                      children: [],
                    } as CategoryWithChildren)
                  }
                  className="p-2 text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
                  aria-label="Edit subcategory"
                >
                  <PencilIcon className="h-4 w-4" />
                </button>
                <button
                  onClick={() => onDelete(child.id)}
                  className="p-2 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                  aria-label="Delete subcategory"
                >
                  <TrashIcon className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
