// File: src/components/CascadingCategorySelect.tsx
import { useState, useRef, useEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronRightIcon, CheckIcon, ChevronDownIcon, PlusIcon } from "@heroicons/react/24/outline";
import type { CategoryWithChildren } from "../types/category";

interface CascadingCategorySelectProps {
  label?: string;
  categories: CategoryWithChildren[];
  selectedId: number;
  onChange: (categoryId: number) => void;
  required?: boolean;
  error?: string;
  showAddButton?: boolean;
  onAddCategory?: () => void;
  placeholder?: string;
  allowClear?: boolean;
}

export default function CascadingCategorySelect({
  label,
  categories,
  selectedId,
  onChange,
  required,
  error,
  showAddButton,
  onAddCategory,
  placeholder = "Select Category",
  allowClear = false,
}: CascadingCategorySelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [hoveredParentId, setHoveredParentId] = useState<number | null>(null);
  const [menuPos, setMenuPos] = useState({ top: 0, left: 0, width: 0 });
  const [subMenuPos, setSubMenuPos] = useState({ top: 0, left: 0 });

  const triggerRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const hoverTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const parentItemRefs = useRef<Map<number, HTMLButtonElement>>(new Map());

  // Find selected label
  const getSelectedLabel = useCallback((): string => {
    if (!selectedId) return placeholder;
    for (const parent of categories) {
      if (parent.id === selectedId) return parent.name;
      for (const child of parent.children) {
        if (child.id === selectedId) return `${parent.name} › ${child.name}`;
      }
    }
    return placeholder;
  }, [selectedId, categories, placeholder]);

  // Position the main dropdown under the trigger button
  const updateMenuPosition = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPos({
      top: rect.bottom + 4,
      left: rect.left,
      width: rect.width,
    });
  }, []);

  // Position the submenu next to the hovered parent item
  const updateSubMenuPosition = useCallback(
    (parentId: number) => {
      const parentEl = parentItemRefs.current.get(parentId);
      if (!parentEl || !menuRef.current) return;

      const parentRect = parentEl.getBoundingClientRect();
      const menuRect = menuRef.current.getBoundingClientRect();
      const subMenuWidth = 200;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;

      // Determine horizontal position: right or left
      let left: number;
      const spaceRight = viewportWidth - menuRect.right;
      if (spaceRight >= subMenuWidth + 8) {
        // Enough space on the right
        left = menuRect.right + 4;
      } else {
        // Flip to the left
        left = menuRect.left - subMenuWidth - 4;
        if (left < 8) left = 8; // Don't go off-screen left
      }

      // Vertical: align with the parent item, but keep on screen
      let top = parentRect.top;
      // Rough estimate: submenu might be ~200px tall max
      if (top + 200 > viewportHeight) {
        top = Math.max(8, viewportHeight - 260);
      }

      setSubMenuPos({ top, left });
    },
    [],
  );

  // Toggle dropdown
  const toggleOpen = () => {
    if (!isOpen) {
      updateMenuPosition();
    }
    setIsOpen(!isOpen);
    setHoveredParentId(null);
  };

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;
    const handleClickOutside = (e: MouseEvent) => {
      const target = e.target as Node;
      if (triggerRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      // Check if click is inside the portal submenu
      const subMenu = document.getElementById("cascading-submenu");
      if (subMenu?.contains(target)) return;

      setIsOpen(false);
      setHoveredParentId(null);
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        setIsOpen(false);
        setHoveredParentId(null);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [isOpen]);

  // Reposition on scroll/resize
  useEffect(() => {
    if (!isOpen) return;
    const reposition = () => {
      updateMenuPosition();
      if (hoveredParentId !== null) {
        updateSubMenuPosition(hoveredParentId);
      }
    };
    window.addEventListener("scroll", reposition, true);
    window.addEventListener("resize", reposition);
    return () => {
      window.removeEventListener("scroll", reposition, true);
      window.removeEventListener("resize", reposition);
    };
  }, [isOpen, hoveredParentId, updateMenuPosition, updateSubMenuPosition]);

  const handleSelect = (categoryId: number) => {
    onChange(categoryId);
    setIsOpen(false);
    setHoveredParentId(null);
  };

  const handleParentHover = (parentId: number, hasChildren: boolean) => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    if (hasChildren) {
      hoverTimerRef.current = setTimeout(() => {
        setHoveredParentId(parentId);
        updateSubMenuPosition(parentId);
      }, 100);
    } else {
      setHoveredParentId(null);
    }
  };

  const handleParentClick = (parentId: number, hasChildren: boolean) => {
    if (hasChildren) {
      if (hoveredParentId === parentId) {
        setHoveredParentId(null);
      } else {
        setHoveredParentId(parentId);
        updateSubMenuPosition(parentId);
      }
    } else {
      handleSelect(parentId);
    }
  };

  const handleParentLeave = () => {
    if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
  };

  // Clean up timer on unmount
  useEffect(() => {
    return () => {
      if (hoverTimerRef.current) clearTimeout(hoverTimerRef.current);
    };
  }, []);

  // Get the currently hovered parent's children
  const hoveredParent = hoveredParentId
    ? categories.find((c) => c.id === hoveredParentId)
    : null;

  return (
    <div className="w-full">
      {label && (
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
          {label}
          {required && <span className="text-red-500 ml-0.5">*</span>}
        </label>
      )}

      {/* Trigger + Add Button Row */}
      <div className="flex items-center gap-1.5">
        {/* Trigger Button */}
        <button
          type="button"
          ref={triggerRef}
          onClick={toggleOpen}
          className={`
            flex-1 min-w-0 px-3 py-2 border rounded-lg transition-colors text-left
            flex items-center justify-between gap-2
            focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent
            bg-white dark:bg-gray-800
            ${error ? "border-red-500" : "border-gray-300 dark:border-gray-600"}
            ${selectedId ? "text-gray-900 dark:text-white" : "text-gray-500 dark:text-gray-400"}
          `}
        >
          <span className="truncate text-sm">{getSelectedLabel()}</span>
          <ChevronDownIcon
            className={`h-4 w-4 flex-shrink-0 text-gray-400 transition-transform duration-150 ${
              isOpen ? "rotate-180" : ""
            }`}
          />
        </button>

        {/* Quick Add Button */}
        {showAddButton && onAddCategory && (
          <button
            type="button"
            onClick={onAddCategory}
            title="Add new category"
            className="flex-shrink-0 p-2 rounded-lg border border-gray-300 dark:border-gray-600
              bg-white dark:bg-gray-800
              hover:bg-blue-50 dark:hover:bg-blue-900/20
              hover:border-blue-400 dark:hover:border-blue-500
              text-gray-500 hover:text-blue-600 dark:hover:text-blue-400
              transition-all duration-150
              focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <PlusIcon className="h-4 w-4" />
          </button>
        )}
      </div>

      {error && <p className="mt-1 text-sm text-red-600">{error}</p>}

      {/* ═══ Main Dropdown (Portal) ═══ */}
      {isOpen &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              top: menuPos.top,
              left: menuPos.left,
              width: menuPos.width,
              minWidth: 200,
            }}
            className="z-[9990] max-h-[320px] overflow-y-auto
              bg-white dark:bg-gray-800 rounded-xl shadow-2xl
              border border-gray-200 dark:border-gray-600 py-1"
          >
            {allowClear && (
              <button
                type="button"
                onClick={() => handleSelect(0)}
                className={`
                  w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors border-b border-gray-100 dark:border-gray-700/50
                  ${
                    selectedId === 0
                      ? "bg-blue-50/50 dark:bg-blue-900/15 text-blue-600 dark:text-blue-400 font-medium"
                      : "text-gray-600 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                  }
                `}
              >
                <span className="w-4 flex-shrink-0">
                  {selectedId === 0 && (
                    <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                  )}
                </span>
                <span className="flex-1 text-left truncate italic text-gray-500 dark:text-gray-400">
                  {placeholder}
                </span>
              </button>
            )}

            {categories.length === 0 ? (
              <div className="px-3 py-4 text-sm text-gray-400 text-center">
                No categories available
              </div>
            ) : (
              categories.map((parent) => {
                const hasChildren = parent.children.length > 0;
                const isHovered = hoveredParentId === parent.id;
                const isSelected = selectedId === parent.id;
                const childSelected = parent.children.some(
                  (c) => c.id === selectedId,
                );

                return (
                  <button
                    key={parent.id}
                    type="button"
                    ref={(el) => {
                      if (el) parentItemRefs.current.set(parent.id, el);
                    }}
                    onClick={() => handleParentClick(parent.id, hasChildren)}
                    onMouseEnter={() =>
                      handleParentHover(parent.id, hasChildren)
                    }
                    onMouseLeave={handleParentLeave}
                    className={`
                      w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors
                      ${
                        isHovered
                          ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                          : isSelected || childSelected
                            ? "bg-blue-50/50 dark:bg-blue-900/15 text-blue-600 dark:text-blue-400"
                            : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                      }
                    `}
                  >
                    <span className="w-4 flex-shrink-0">
                      {(isSelected || childSelected) && (
                        <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                      )}
                    </span>
                    <span className="flex-1 text-left truncate">
                      {parent.name}
                    </span>
                    {hasChildren && (
                      <ChevronRightIcon className="h-3.5 w-3.5 text-gray-400 flex-shrink-0" />
                    )}
                  </button>
                );
              })
            )}
          </div>,
          document.body,
        )}

      {/* ═══ Submenu (Portal) ═══ */}
      {isOpen &&
        hoveredParent &&
        createPortal(
          <div
            id="cascading-submenu"
            style={{
              position: "fixed",
              top: subMenuPos.top,
              left: subMenuPos.left,
              minWidth: 200,
            }}
            className="z-[9991] max-h-[280px] overflow-y-auto
              bg-white dark:bg-gray-800 rounded-xl shadow-2xl
              border border-gray-200 dark:border-gray-600 py-1"
            onMouseEnter={() => {
              // Keep submenu open while mouse is inside
              if (hoverTimerRef.current)
                clearTimeout(hoverTimerRef.current);
            }}
            onMouseLeave={() => setHoveredParentId(null)}
          >
            {/* "All <Parent>" option */}
            <button
              type="button"
              onClick={() => handleSelect(hoveredParent.id)}
              className={`
                w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors
                ${
                  selectedId === hoveredParent.id
                    ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                    : "text-gray-500 dark:text-gray-400 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                }
              `}
            >
              <span className="w-4 flex-shrink-0">
                {selectedId === hoveredParent.id && (
                  <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                )}
              </span>
              <span className="flex-1 text-left truncate italic">
                All {hoveredParent.name}
              </span>
            </button>

            <div className="h-px bg-gray-200 dark:bg-gray-600 mx-2 my-1" />

            {/* Child categories */}
            {hoveredParent.children.map((child) => {
              const childSelected = selectedId === child.id;
              return (
                <button
                  key={child.id}
                  type="button"
                  onClick={() => handleSelect(child.id)}
                  className={`
                    w-full flex items-center gap-2 px-3 py-2.5 text-sm transition-colors
                    ${
                      childSelected
                        ? "bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300"
                        : "text-gray-800 dark:text-gray-200 hover:bg-gray-50 dark:hover:bg-gray-700/50"
                    }
                  `}
                >
                  <span className="w-4 flex-shrink-0">
                    {childSelected && (
                      <CheckIcon className="h-4 w-4 text-blue-600 dark:text-blue-400" />
                    )}
                  </span>
                  <span className="flex-1 text-left truncate">
                    {child.name}
                  </span>
                </button>
              );
            })}
          </div>,
          document.body,
        )}
    </div>
  );
}
