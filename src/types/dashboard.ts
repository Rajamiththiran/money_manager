// File: src/types/dashboard.ts

export type WidgetId =
  | "net-worth"
  | "upcoming-bills"
  | "goals"
  | "stats-grid"
  | "spending-chart"
  | "income-chart"
  | "recent-transactions"
  | "calendar";

export type WidgetDisplayMode = "expanded" | "compact";

export type DateRangePreset =
  | "this-month"
  | "last-month"
  | "this-week"
  | "custom";

export interface WidgetConfig {
  id: WidgetId;
  visible: boolean;
  displayMode: WidgetDisplayMode;
}

export interface DashboardLayout {
  widgets: WidgetConfig[];
  dateRangePreset: DateRangePreset;
  customDateRange?: { start: string; end: string };
}

export const WIDGET_LABELS: Record<WidgetId, string> = {
  "net-worth": "Net Worth",
  "upcoming-bills": "Upcoming Bills",
  goals: "Savings Goals",
  "stats-grid": "Stats Overview",
  "spending-chart": "Spending by Category",
  "income-chart": "Income Sources",
  "recent-transactions": "Recent Transactions",
  calendar: "Calendar",
};

// Only these widgets support compact/expanded toggle
export const COMPACT_SUPPORTED: WidgetId[] = [
  "net-worth",
  "upcoming-bills",
  "goals",
];

export const DEFAULT_DASHBOARD_LAYOUT: DashboardLayout = {
  widgets: [
    { id: "net-worth", visible: true, displayMode: "expanded" },
    { id: "upcoming-bills", visible: true, displayMode: "expanded" },
    { id: "goals", visible: true, displayMode: "expanded" },
    { id: "stats-grid", visible: true, displayMode: "expanded" },
    { id: "spending-chart", visible: true, displayMode: "expanded" },
    { id: "income-chart", visible: true, displayMode: "expanded" },
    { id: "recent-transactions", visible: true, displayMode: "expanded" },
    { id: "calendar", visible: true, displayMode: "expanded" },
  ],
  dateRangePreset: "this-month",
};
