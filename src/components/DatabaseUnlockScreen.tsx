import { useState, useRef, useEffect } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Database, ShieldCheck, Eye, EyeOff } from "lucide-react";
import Button from "./Button";

interface DatabaseUnlockScreenProps {
  onUnlock: () => void;
}

export default function DatabaseUnlockScreen({ onUnlock }: DatabaseUnlockScreenProps) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [shake, setShake] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  const handleUnlock = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!password.trim() || isUnlocking) return;

    setIsUnlocking(true);
    setError(null);

    try {
      const success = await invoke<boolean>("unlock_database", { password });
      if (success) {
        onUnlock();
      } else {
        setError("Incorrect master password");
        setShake(true);
        setTimeout(() => setShake(false), 500);
      }
    } catch (err) {
      setError(String(err));
      setShake(true);
      setTimeout(() => setShake(false), 500);
    } finally {
      setIsUnlocking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900 dark:bg-gray-950">
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full"
          style={{
            backgroundImage: "radial-gradient(circle at 25px 25px, white 1px, transparent 0)",
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="relative w-full max-w-md mx-auto px-6">
        <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl overflow-hidden border border-gray-100 dark:border-gray-700 p-8">
          <div className="flex justify-center mb-6">
            <div className="p-4 rounded-full bg-accent-500/10 dark:bg-accent-500/20">
              <Database className="w-10 h-10 text-accent-600 dark:text-accent-400" />
            </div>
          </div>

          <h1 className="text-2xl font-bold text-gray-900 dark:text-white text-center mb-2">
            Encrypted Database
          </h1>
          <p className="text-sm text-gray-500 dark:text-gray-400 text-center mb-8">
            Your financial data is encrypted at rest. Please enter your master password to unlock it.
          </p>

          <form onSubmit={handleUnlock} className={shake ? "animate-shake" : ""}>
            <div className="space-y-4">
              <div className="relative">
                <input
                  ref={inputRef}
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => {
                    setPassword(e.target.value);
                    setError(null);
                  }}
                  placeholder="Master password"
                  className="w-full px-4 py-3 bg-gray-50 dark:bg-gray-900 border border-gray-300 dark:border-gray-700 rounded-xl text-gray-900 dark:text-white focus:ring-2 focus:ring-accent-500 focus:border-transparent outline-none transition-all pr-12"
                  disabled={isUnlocking}
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300 p-1"
                  tabIndex={-1}
                >
                  {showPassword ? <EyeOff className="w-5 h-5" /> : <Eye className="w-5 h-5" />}
                </button>
              </div>

              <div className="h-6 flex items-center justify-center">
                {error && <p className="text-sm text-red-500 dark:text-red-400 font-medium">{error}</p>}
              </div>

              <Button
                type="submit"
                variant="primary"
                className="w-full h-12 text-base font-medium flex items-center justify-center gap-2"
                disabled={!password.trim() || isUnlocking}
              >
                {isUnlocking ? (
                  <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                ) : (
                  <>
                    <ShieldCheck className="w-5 h-5" />
                    Unlock Database
                  </>
                )}
              </Button>
            </div>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          10%, 30%, 50%, 70%, 90% { transform: translateX(-4px); }
          20%, 40%, 60%, 80% { transform: translateX(4px); }
        }
        .animate-shake {
          animation: shake 0.5s ease-in-out;
        }
      `}</style>
    </div>
  );
}
