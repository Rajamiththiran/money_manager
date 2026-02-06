// File: src/contexts/AccentColorContext.tsx
import { createContext, useContext, useEffect, useState } from "react";

type AccentColor =
  | "blue"
  | "indigo"
  | "violet"
  | "emerald"
  | "amber"
  | "rose"
  | "cyan"
  | "orange";

interface AccentColorContextType {
  accentColor: AccentColor;
  setAccentColor: (color: AccentColor) => void;
}

const AccentColorContext = createContext<AccentColorContextType | undefined>(
  undefined,
);

// ── Color palettes mapped to Tailwind's default scale ─────────────
const ACCENT_PALETTES: Record<
  AccentColor,
  {
    400: string;
    500: string;
    600: string;
    700: string;
    ring: string;
    bg50: string;
    bg900_20: string;
  }
> = {
  blue: {
    400: "96 165 250", // blue-400
    500: "59 130 246", // blue-500
    600: "37 99 235", // blue-600
    700: "29 78 216", // blue-700
    ring: "59 130 246",
    bg50: "239 246 255", // blue-50
    bg900_20: "30 58 138",
  },
  indigo: {
    400: "129 140 248",
    500: "99 102 241",
    600: "79 70 229",
    700: "67 56 202",
    ring: "99 102 241",
    bg50: "238 242 255",
    bg900_20: "49 46 129",
  },
  violet: {
    400: "167 139 250",
    500: "139 92 246",
    600: "124 58 237",
    700: "109 40 217",
    ring: "139 92 246",
    bg50: "245 243 255",
    bg900_20: "76 29 149",
  },
  emerald: {
    400: "52 211 153",
    500: "16 185 129",
    600: "5 150 105",
    700: "4 120 87",
    ring: "16 185 129",
    bg50: "236 253 245",
    bg900_20: "6 78 59",
  },
  amber: {
    400: "251 191 36",
    500: "245 158 11",
    600: "217 119 6",
    700: "180 83 9",
    ring: "245 158 11",
    bg50: "255 251 235",
    bg900_20: "120 53 15",
  },
  rose: {
    400: "251 113 133",
    500: "244 63 94",
    600: "225 29 72",
    700: "190 18 60",
    ring: "244 63 94",
    bg50: "255 241 242",
    bg900_20: "136 19 55",
  },
  cyan: {
    400: "34 211 238",
    500: "6 182 212",
    600: "8 145 178",
    700: "14 116 144",
    ring: "6 182 212",
    bg50: "236 254 255",
    bg900_20: "22 78 99",
  },
  orange: {
    400: "251 146 60",
    500: "249 115 22",
    600: "234 88 12",
    700: "194 65 12",
    ring: "249 115 22",
    bg50: "255 247 237",
    bg900_20: "124 45 18",
  },
};

export function AccentColorProvider({
  children,
}: {
  children: React.ReactNode;
}) {
  const [accentColor, setAccentColorState] = useState<AccentColor>(() => {
    try {
      const stored = localStorage.getItem("appSettings");
      if (stored) {
        const parsed = JSON.parse(stored);
        if (parsed.accentColor && parsed.accentColor in ACCENT_PALETTES) {
          return parsed.accentColor as AccentColor;
        }
      }
    } catch {
      // ignore
    }
    return "blue";
  });

  useEffect(() => {
    applyAccentColor(accentColor);
  }, [accentColor]);

  const setAccentColor = (color: AccentColor) => {
    setAccentColorState(color);

    // Also update localStorage appSettings
    try {
      const stored = localStorage.getItem("appSettings");
      const settings = stored ? JSON.parse(stored) : {};
      settings.accentColor = color;
      localStorage.setItem("appSettings", JSON.stringify(settings));
    } catch {
      // ignore
    }
  };

  return (
    <AccentColorContext.Provider value={{ accentColor, setAccentColor }}>
      {children}
    </AccentColorContext.Provider>
  );
}

export function useAccentColor() {
  const context = useContext(AccentColorContext);
  if (context === undefined) {
    throw new Error(
      "useAccentColor must be used within an AccentColorProvider",
    );
  }
  return context;
}

function applyAccentColor(color: AccentColor) {
  const palette = ACCENT_PALETTES[color];
  const root = document.documentElement;

  root.style.setProperty("--accent-400", palette[400]);
  root.style.setProperty("--accent-500", palette[500]);
  root.style.setProperty("--accent-600", palette[600]);
  root.style.setProperty("--accent-700", palette[700]);
  root.style.setProperty("--accent-ring", palette.ring);
  root.style.setProperty("--accent-bg50", palette.bg50);
  root.style.setProperty("--accent-bg900-20", palette.bg900_20);
}
