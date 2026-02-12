import { useState, useEffect, useCallback } from "react";
import { X, Delete } from "lucide-react";

interface PinKeypadProps {
  isOpen: boolean;
  correctPin: string;
  onSuccess: () => void;
  onClose: () => void;
}

export function PinKeypad({ isOpen, correctPin, onSuccess, onClose }: PinKeypadProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);

  useEffect(() => {
    if (isOpen) {
      setPin("");
      setError(false);
    }
  }, [isOpen]);

  const handleDigit = useCallback((digit: string) => {
    setError(false);
    setPin(prev => {
      const next = prev + digit;
      if (next.length === 4) {
        if (next === correctPin) {
          onSuccess();
          return "";
        } else {
          setError(true);
          setTimeout(() => {
            setPin("");
            setError(false);
          }, 600);
          return next;
        }
      }
      return next;
    });
  }, [correctPin, onSuccess]);

  const handleDelete = useCallback(() => {
    setPin(prev => prev.slice(0, -1));
    setError(false);
  }, []);

  // Listen for physical keyboard input
  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: KeyboardEvent) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.key >= "0" && e.key <= "9") {
        handleDigit(e.key);
      } else if (e.key === "Backspace") {
        handleDelete();
      }
    };
    window.addEventListener("keydown", handler, true);
    return () => window.removeEventListener("keydown", handler, true);
  }, [isOpen, handleDigit, handleDelete]);

  if (!isOpen) return null;

  const digits = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "", "0", "del"];

  return (
    <div className="fixed inset-0 z-[60] flex flex-col items-center justify-center bg-primary/95">
      {/* Close button */}
      <button
        onClick={onClose}
        tabIndex={-1}
        className="absolute top-4 right-4 text-white/70 hover:text-white p-2"
      >
        <X className="w-6 h-6" />
      </button>

      <h2 className="text-white font-bold text-lg mb-2">경보 해제</h2>
      <p className="text-white/70 text-sm mb-6">4자리 비밀번호를 입력하세요</p>

      {/* PIN dots */}
      <div className="flex gap-3 mb-8">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`w-4 h-4 rounded-full border-2 transition-all ${
              error
                ? "border-destructive bg-destructive"
                : pin.length > i
                  ? "border-secondary bg-secondary"
                  : "border-white/50 bg-transparent"
            } ${error ? "animate-shake" : ""}`}
          />
        ))}
      </div>

      {error && (
        <p className="text-destructive text-sm mb-4 font-bold">비밀번호가 틀렸습니다</p>
      )}

      {/* Keypad grid */}
      <div className="grid grid-cols-3 gap-3 w-64">
        {digits.map((d, i) => {
          if (d === "") return <div key={i} />;
          if (d === "del") {
            return (
              <button
                key={i}
                onClick={handleDelete}
                tabIndex={-1}
                className="h-14 rounded-xl bg-white/10 hover:bg-white/20 text-white flex items-center justify-center transition-colors active:bg-white/30"
              >
                <Delete className="w-5 h-5" />
              </button>
            );
          }
          return (
            <button
              key={i}
              onClick={() => handleDigit(d)}
              tabIndex={-1}
              className="h-14 rounded-xl bg-white/10 hover:bg-white/20 text-white text-xl font-bold transition-colors active:bg-white/30"
            >
              {d}
            </button>
          );
        })}
      </div>

      <style>{`
        @keyframes shake {
          0%, 100% { transform: translateX(0); }
          25% { transform: translateX(-8px); }
          75% { transform: translateX(8px); }
        }
        .animate-shake {
          animation: shake 0.3s ease-in-out 2;
        }
      `}</style>
    </div>
  );
}
