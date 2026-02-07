// File: src/components/LockScreen.tsx
import { useState, useEffect, useRef, useCallback } from "react";
import { invoke } from "@tauri-apps/api/core";
import { Lock, ShieldCheck, AlertTriangle, Delete } from "lucide-react";

interface LockScreenProps {
  onUnlock: () => void;
}

export default function LockScreen({ onUnlock }: LockScreenProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [isVerifying, setIsVerifying] = useState(false);
  const [isLockedOut, setIsLockedOut] = useState(false);
  const [lockoutSeconds, setLockoutSeconds] = useState(0);
  const [shake, setShake] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  const MAX_DIGITS = 8;

  // Focus the container for keyboard input
  useEffect(() => {
    containerRef.current?.focus();
  }, []);

  // Lockout countdown timer
  useEffect(() => {
    if (lockoutSeconds <= 0) {
      setIsLockedOut(false);
      return;
    }

    const timer = setInterval(() => {
      setLockoutSeconds((prev) => {
        if (prev <= 1) {
          setIsLockedOut(false);
          setError(null);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [lockoutSeconds]);

  const handleVerify = useCallback(
    async (currentPin: string) => {
      if (currentPin.length < 4 || isVerifying || isLockedOut) return;

      setIsVerifying(true);
      setError(null);

      try {
        const result = await invoke<boolean>("verify_pin", {
          pin: currentPin,
        });
        if (result) {
          onUnlock();
        }
      } catch (err) {
        const errMsg = String(err);
        setError(errMsg);
        setPin("");
        setShake(true);
        setTimeout(() => setShake(false), 500);

        // Parse lockout from error message
        if (errMsg.includes("Locked")) {
          setIsLockedOut(true);
          const match = errMsg.match(/(\d+) second/);
          if (match) {
            setLockoutSeconds(parseInt(match[1], 10));
          } else {
            setLockoutSeconds(30);
          }
        }
      } finally {
        setIsVerifying(false);
      }
    },
    [isVerifying, isLockedOut, onUnlock],
  );

  const handleDigit = useCallback(
    (digit: string) => {
      if (isLockedOut || isVerifying) return;
      setError(null);

      setPin((prev) => {
        const next = prev + digit;
        if (next.length > MAX_DIGITS) return prev;

        // Auto-submit when 4+ digits and user presses enter or reaches max
        if (next.length >= 4 && next.length <= MAX_DIGITS) {
          // Don't auto-submit, let user press enter or click button
        }
        return next;
      });
    },
    [isLockedOut, isVerifying],
  );

  const handleBackspace = useCallback(() => {
    setPin((prev) => prev.slice(0, -1));
    setError(null);
  }, []);

  const handleClear = useCallback(() => {
    setPin("");
    setError(null);
  }, []);

  // Keyboard handler
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key >= "0" && e.key <= "9") {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleBackspace();
      } else if (e.key === "Enter" && pin.length >= 4) {
        handleVerify(pin);
      } else if (e.key === "Escape") {
        handleClear();
      }
    },
    [handleDigit, handleBackspace, handleClear, handleVerify, pin],
  );

  const numpadKeys = [
    ["1", "2", "3"],
    ["4", "5", "6"],
    ["7", "8", "9"],
    ["clear", "0", "back"],
  ];

  return (
    <div
      ref={containerRef}
      tabIndex={0}
      onKeyDown={handleKeyDown}
      className="fixed inset-0 z-[9999] flex items-center justify-center bg-gray-900 dark:bg-gray-950 outline-none"
    >
      {/* Subtle background pattern */}
      <div className="absolute inset-0 opacity-5">
        <div
          className="w-full h-full"
          style={{
            backgroundImage:
              "radial-gradient(circle at 25px 25px, white 1px, transparent 0)",
            backgroundSize: "50px 50px",
          }}
        />
      </div>

      <div className="relative w-full max-w-sm mx-auto px-6">
        {/* Lock icon */}
        <div className="flex justify-center mb-6">
          <div
            className={`p-4 rounded-full ${
              isLockedOut ? "bg-red-500/20" : "bg-accent-500/20"
            }`}
          >
            {isLockedOut ? (
              <AlertTriangle className="w-10 h-10 text-red-400" />
            ) : (
              <Lock className="w-10 h-10 text-accent-400" />
            )}
          </div>
        </div>

        {/* Title */}
        <h1 className="text-xl font-semibold text-white text-center mb-1">
          Money Manager
        </h1>
        <p className="text-sm text-gray-400 text-center mb-8">
          {isLockedOut
            ? `Try again in ${lockoutSeconds}s`
            : "Enter your PIN to unlock"}
        </p>

        {/* PIN dots */}
        <div
          className={`flex justify-center gap-3 mb-6 ${
            shake ? "animate-shake" : ""
          }`}
        >
          {Array.from({ length: MAX_DIGITS }).map((_, i) => (
            <div
              key={i}
              className={`w-3.5 h-3.5 rounded-full transition-all duration-200 ${
                i < pin.length
                  ? "bg-accent-500 scale-110"
                  : i < 4
                    ? "bg-gray-600 border-2 border-gray-500"
                    : "bg-gray-700/50 border border-gray-700"
              }`}
            />
          ))}
        </div>

        {/* Error message */}
        <div className="h-6 mb-4 flex items-center justify-center">
          {error && <p className="text-sm text-red-400 text-center">{error}</p>}
        </div>

        {/* Numpad */}
        <div className="grid grid-cols-3 gap-3 mb-6">
          {numpadKeys.flat().map((key) => {
            if (key === "clear") {
              return (
                <button
                  key={key}
                  onClick={handleClear}
                  disabled={isLockedOut}
                  className="h-16 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 text-gray-400 text-sm font-medium transition-colors disabled:opacity-30"
                >
                  Clear
                </button>
              );
            }
            if (key === "back") {
              return (
                <button
                  key={key}
                  onClick={handleBackspace}
                  disabled={isLockedOut}
                  className="h-16 rounded-xl bg-gray-800/50 hover:bg-gray-700/50 flex items-center justify-center text-gray-400 transition-colors disabled:opacity-30"
                >
                  <Delete className="w-6 h-6" />
                </button>
              );
            }
            return (
              <button
                key={key}
                onClick={() => handleDigit(key)}
                disabled={isLockedOut || pin.length >= MAX_DIGITS}
                className="h-16 rounded-xl bg-gray-800 hover:bg-gray-700 active:bg-gray-600 text-white text-2xl font-light transition-colors disabled:opacity-30 disabled:hover:bg-gray-800"
              >
                {key}
              </button>
            );
          })}
        </div>

        {/* Unlock button */}
        <button
          onClick={() => handleVerify(pin)}
          disabled={pin.length < 4 || isVerifying || isLockedOut}
          className="w-full h-12 rounded-xl bg-accent-600 hover:bg-accent-700 active:bg-accent-800 text-white font-medium flex items-center justify-center gap-2 transition-colors disabled:opacity-40 disabled:hover:bg-accent-600"
        >
          {isVerifying ? (
            <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin" />
          ) : (
            <>
              <ShieldCheck className="w-5 h-5" />
              Unlock
            </>
          )}
        </button>
      </div>

      {/* Shake animation style */}
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
