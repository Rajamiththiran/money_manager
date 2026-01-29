// File: src/components/Calculator.tsx
import { useState, useEffect } from "react";

interface CalculatorProps {
  value: string;
  onChange: (value: string) => void;
}

export default function Calculator({ value, onChange }: CalculatorProps) {
  const [result, setResult] = useState<number | null>(null);

  useEffect(() => {
    try {
      // Safe evaluation of simple arithmetic
      const cleanExpression = value.replace(/[^0-9+\-*/().]/g, "");
      if (cleanExpression && /^[\d+\-*/().]+$/.test(cleanExpression)) {
        // eslint-disable-next-line no-eval
        const calculated = eval(cleanExpression);
        if (typeof calculated === "number" && !isNaN(calculated)) {
          setResult(calculated);
        } else {
          setResult(null);
        }
      } else {
        setResult(null);
      }
    } catch {
      setResult(null);
    }
  }, [value]);

  const handleUseResult = () => {
    if (result !== null) {
      onChange(result.toFixed(2));
    }
  };

  return (
    <div className="mt-2 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg border border-gray-200 dark:border-gray-600">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs text-gray-600 dark:text-gray-400">Result:</p>
          {result !== null ? (
            <p className="text-lg font-bold text-gray-900 dark:text-white">
              {result.toFixed(2)}
            </p>
          ) : (
            <p className="text-sm text-gray-500 dark:text-gray-400">
              Enter a valid expression
            </p>
          )}
        </div>
        {result !== null && (
          <button
            type="button"
            onClick={handleUseResult}
            className="px-3 py-1 text-sm font-medium text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors"
          >
            Use Result
          </button>
        )}
      </div>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        Try: 50+20+10 or 100*1.5
      </p>
    </div>
  );
}
