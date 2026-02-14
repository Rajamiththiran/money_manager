// File: src/hooks/useCurrency.ts
import { useCallback } from "react";

interface AppSettings {
  currency: string;
  currencySymbol: string;
  numberFormat: string;
}

const DEFAULT_SETTINGS: AppSettings = {
  currency: "LKR",
  currencySymbol: "Rs",
  numberFormat: "1,000.00",
};

function getSettings(): AppSettings {
  try {
    const stored = localStorage.getItem("appSettings");
    if (stored) {
      const parsed = JSON.parse(stored);
      return { ...DEFAULT_SETTINGS, ...parsed };
    }
  } catch {
    // ignore
  }
  return DEFAULT_SETTINGS;
}

export function useCurrency() {
  const settings = getSettings();

  const formatAmount = useCallback(
    (value: number, showSymbol = true): string => {
      const { currencySymbol, numberFormat } = settings;

      // Determine locale-style formatting based on numberFormat setting
      let formatted: string;
      switch (numberFormat) {
        case "1.000,00": // European style
          formatted = value
            .toFixed(2)
            .replace(".", ",")
            .replace(/\B(?=(\d{3})+(?!\d))/g, ".");
          break;
        case "1 000.00": // Space separator
          formatted = value.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
          break;
        case "1000.00": // No separator
          formatted = value.toFixed(2);
          break;
        case "1,000.00": // US/UK style (default)
        default:
          formatted = value.toLocaleString("en-US", {
            minimumFractionDigits: 2,
            maximumFractionDigits: 2,
          });
          break;
      }

      return showSymbol ? `${currencySymbol} ${formatted}` : formatted;
    },
    [settings.currencySymbol, settings.numberFormat],
  );

  const formatAmountSigned = useCallback(
    (
      value: number,
      type: "INCOME" | "EXPENSE" | "TRANSFER",
      showSymbol = true,
    ): string => {
      const formatted = formatAmount(Math.abs(value), showSymbol);
      if (type === "EXPENSE") return `- ${formatted}`;
      if (type === "INCOME") return `+ ${formatted}`;
      return formatted;
    },
    [formatAmount],
  );

  return {
    currency: settings.currency,
    symbol: settings.currencySymbol,
    formatAmount,
    formatAmountSigned,
  };
}
