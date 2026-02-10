// File: src/components/Toast.tsx
import {
  useState,
  useEffect,
  useCallback,
  createContext,
  useContext,
} from "react";
import type { ReactNode } from "react";
import { CheckCircle, XCircle, AlertTriangle, Info, X } from "lucide-react";

type ToastType = "success" | "error" | "warning" | "info";

interface Toast {
  id: string;
  type: ToastType;
  title: string;
  message?: string;
  duration?: number;
}

interface ToastContextType {
  toast: (
    type: ToastType,
    title: string,
    message?: string,
    duration?: number,
  ) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  warning: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

export function useToast(): ToastContextType {
  const context = useContext(ToastContext);
  if (!context) {
    throw new Error("useToast must be used within a ToastProvider");
  }
  return context;
}

const ICONS: Record<ToastType, ReactNode> = {
  success: <CheckCircle className="w-5 h-5 text-emerald-400" />,
  error: <XCircle className="w-5 h-5 text-red-400" />,
  warning: <AlertTriangle className="w-5 h-5 text-amber-400" />,
  info: <Info className="w-5 h-5 text-blue-400" />,
};

// Combined light + dark classes in full strings so Tailwind can detect them
const TOAST_CLASSES: Record<ToastType, string> = {
  success:
    "bg-emerald-50 border-emerald-200 text-gray-900 dark:bg-emerald-950/90 dark:border-emerald-800/60 dark:text-gray-100",
  error:
    "bg-red-50 border-red-200 text-gray-900 dark:bg-red-950/90 dark:border-red-800/60 dark:text-gray-100",
  warning:
    "bg-amber-50 border-amber-200 text-gray-900 dark:bg-amber-950/90 dark:border-amber-800/60 dark:text-gray-100",
  info: "bg-blue-50 border-blue-200 text-gray-900 dark:bg-blue-950/90 dark:border-blue-800/60 dark:text-gray-100",
};

function ToastItem({
  toast,
  onDismiss,
}: {
  toast: Toast;
  onDismiss: (id: string) => void;
}) {
  const [isExiting, setIsExiting] = useState(false);

  useEffect(() => {
    const duration = toast.duration ?? 4000;
    const exitTimer = setTimeout(() => setIsExiting(true), duration - 300);
    const removeTimer = setTimeout(() => onDismiss(toast.id), duration);

    return () => {
      clearTimeout(exitTimer);
      clearTimeout(removeTimer);
    };
  }, [toast.id, toast.duration, onDismiss]);

  const handleDismiss = () => {
    setIsExiting(true);
    setTimeout(() => onDismiss(toast.id), 300);
  };

  return (
    <div
      className={`
        flex items-start gap-3 w-80 px-4 py-3 rounded-lg border shadow-lg backdrop-blur-sm
        transition-all duration-300 ease-in-out
        ${isExiting ? "opacity-0 translate-x-4" : "opacity-100 translate-x-0"}
        ${TOAST_CLASSES[toast.type]}
      `}
      role="alert"
    >
      <span className="mt-0.5 flex-shrink-0">{ICONS[toast.type]}</span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium leading-5">{toast.title}</p>
        {toast.message && (
          <p className="text-xs mt-0.5 opacity-80 leading-4">{toast.message}</p>
        )}
      </div>
      <button
        onClick={handleDismiss}
        className="flex-shrink-0 mt-0.5 opacity-60 hover:opacity-100 transition-opacity"
      >
        <X className="w-4 h-4" />
      </button>
    </div>
  );
}

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);

  const dismiss = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  const addToast = useCallback(
    (type: ToastType, title: string, message?: string, duration?: number) => {
      const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      setToasts((prev) => [...prev, { id, type, title, message, duration }]);
    },
    [],
  );

  const contextValue: ToastContextType = {
    toast: addToast,
    success: (title, message) => addToast("success", title, message),
    error: (title, message) => addToast("error", title, message),
    warning: (title, message) => addToast("warning", title, message),
    info: (title, message) => addToast("info", title, message),
  };

  return (
    <ToastContext.Provider value={contextValue}>
      {children}
      {/* Toast container */}
      <div className="fixed top-4 right-4 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map((t) => (
          <div key={t.id} className="pointer-events-auto">
            <ToastItem toast={t} onDismiss={dismiss} />
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}
