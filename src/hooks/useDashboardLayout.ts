// File: src/hooks/useDashboardLayout.ts
import { useState, useEffect, useCallback, useRef } from "react";
import { invoke } from "@tauri-apps/api/core";
import type {
  DashboardLayout,
  WidgetId,
  WidgetDisplayMode,
  DateRangePreset,
} from "../types/dashboard";
import { DEFAULT_DASHBOARD_LAYOUT } from "../types/dashboard";

const SETTING_KEY = "dashboard_layout";
const SAVE_DEBOUNCE_MS = 500;

export function useDashboardLayout() {
  const [layout, setLayout] = useState<DashboardLayout>(
    DEFAULT_DASHBOARD_LAYOUT,
  );
  const [loaded, setLoaded] = useState(false);
  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Load saved layout on mount
  useEffect(() => {
    const load = async () => {
      try {
        const saved = await invoke<string | null>("get_setting", {
          key: SETTING_KEY,
        });
        if (saved) {
          const parsed = JSON.parse(saved) as DashboardLayout;
          // Merge with defaults to handle any newly added widgets
          const merged = mergeWithDefaults(parsed);
          setLayout(merged);
        }
      } catch (err) {
        console.error("Failed to load dashboard layout:", err);
      } finally {
        setLoaded(true);
      }
    };
    load();
  }, []);

  // Debounced save to backend
  const persistLayout = useCallback((next: DashboardLayout) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    saveTimerRef.current = setTimeout(async () => {
      try {
        await invoke("set_setting", {
          key: SETTING_KEY,
          value: JSON.stringify(next),
        });
      } catch (err) {
        console.error("Failed to save dashboard layout:", err);
      }
    }, SAVE_DEBOUNCE_MS);
  }, []);

  const updateLayout = useCallback(
    (next: DashboardLayout) => {
      setLayout(next);
      persistLayout(next);
    },
    [persistLayout],
  );

  const reorderWidgets = useCallback(
    (fromIndex: number, toIndex: number) => {
      const widgets = [...layout.widgets];
      const [moved] = widgets.splice(fromIndex, 1);
      widgets.splice(toIndex, 0, moved);
      updateLayout({ ...layout, widgets });
    },
    [layout, updateLayout],
  );

  const toggleWidget = useCallback(
    (id: WidgetId) => {
      const widgets = layout.widgets.map((w) =>
        w.id === id ? { ...w, visible: !w.visible } : w,
      );
      updateLayout({ ...layout, widgets });
    },
    [layout, updateLayout],
  );

  const setWidgetMode = useCallback(
    (id: WidgetId, mode: WidgetDisplayMode) => {
      const widgets = layout.widgets.map((w) =>
        w.id === id ? { ...w, displayMode: mode } : w,
      );
      updateLayout({ ...layout, widgets });
    },
    [layout, updateLayout],
  );

  const setDateRange = useCallback(
    (
      preset: DateRangePreset,
      custom?: { start: string; end: string },
    ) => {
      updateLayout({
        ...layout,
        dateRangePreset: preset,
        customDateRange: custom,
      });
    },
    [layout, updateLayout],
  );

  const resetToDefault = useCallback(() => {
    updateLayout(DEFAULT_DASHBOARD_LAYOUT);
  }, [updateLayout]);

  return {
    layout,
    loaded,
    reorderWidgets,
    toggleWidget,
    setWidgetMode,
    setDateRange,
    resetToDefault,
  };
}

/**
 * If the user's saved layout is missing widgets that were added in a newer
 * version, append them at the end with default config.
 */
function mergeWithDefaults(saved: DashboardLayout): DashboardLayout {
  const savedIds = new Set(saved.widgets.map((w) => w.id));
  const missing = DEFAULT_DASHBOARD_LAYOUT.widgets.filter(
    (w) => !savedIds.has(w.id),
  );
  return {
    ...saved,
    widgets: [...saved.widgets, ...missing],
  };
}
