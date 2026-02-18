import { useState, useEffect, useCallback, useRef } from "react";
import { X, Delete } from "lucide-react";
import { verifyPin } from "@/lib/pinHash";

interface PinKeypadProps {
  isOpen: boolean;
  /** @deprecated 폴백용 평문 PIN — alarm_pin_hash가 있으면 무시됨 */
  correctPin: string;
  /** 해시 검증용 디바이스 ID */
  deviceId?: string;
  /** DB metadata (alarm_pin_hash, alarm_pin 포함) */
  metadata?: { alarm_pin_hash?: string; alarm_pin?: string } | null;
  onSuccess: () => void;
  onClose: () => void;
}

export function PinKeypad({ isOpen, correctPin, deviceId, metadata, onSuccess, onClose }: PinKeypadProps) {
  const [pin, setPin] = useState("");
  const [error, setError] = useState(false);
  const isVerifyingRef = useRef(false);

  useEffect(() => {
    if (isOpen) {
      setPin("");
      setError(false);
    }
  }, [isOpen]);

  const handleDigit = useCallback((digit: string) => {
    if (isVerifyingRef.current) return;
    setError(false);
    setPin(prev => {
      const next = prev + digit;
      if (next.length === 4) {
        // 비동기 해시 검증
        isVerifyingRef.current = true;
        (async () => {
          try {
            let valid = false;
            if (deviceId && metadata) {
              valid = await verifyPin(next, deviceId, metadata, correctPin);
            } else {
              // 폴백: 평문 비교
              valid = next === correctPin;
            }

            if (valid) {
              onSuccess();
              setPin("");
            } else {
              setError(true);
              setTimeout(() => {
                setPin("");
                setError(false);
              }, 600);
            }
          } finally {
            isVerifyingRef.current = false;
          }
        })();
        return next;
      }
      return next;
    });
  }, [correctPin, deviceId, metadata, onSuccess]);

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
    <div 
      className="fixed inset-0 z-[60] flex flex-col items-center justify-center"
      style={{
        background: "linear-gradient(180deg, hsla(222, 47%, 25%, 0.95) 0%, hsla(222, 47%, 18%, 0.95) 100%)",
        backdropFilter: "blur(24px)",
        WebkitBackdropFilter: "blur(24px)",
      }}
    >
      {/* Close button - glassmorphism circle */}
      <button
        onClick={onClose}
        tabIndex={-1}
        className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/10 backdrop-blur-sm border border-white/15 flex items-center justify-center text-white/70 hover:bg-white/20 transition-colors"
      >
        <X className="w-5 h-5" />
      </button>

      <h2 className="text-white font-extrabold text-xl mb-2 drop-shadow-md">경보 해제</h2>
      <p className="text-white/60 text-sm mb-6 font-medium">4자리 비밀번호를 입력하세요</p>

      {/* PIN dots */}
      <div className="flex gap-4 mb-8">
        {[0, 1, 2, 3].map(i => (
          <div
            key={i}
            className={`w-5 h-5 rounded-full border-2 transition-all duration-200 ${
              error
                ? "border-destructive bg-destructive shadow-[0_0_12px_hsl(0_72%_51%/0.5)]"
                : pin.length > i
                  ? "border-secondary bg-secondary shadow-[0_0_12px_hsl(68_100%_64%/0.4)]"
                  : "border-white/30 bg-white/5"
            } ${error ? "animate-shake" : ""}`}
          />
        ))}
      </div>

      {error && (
        <p className="text-destructive text-sm mb-4 font-bold drop-shadow-sm">비밀번호가 틀렸습니다</p>
      )}

      {/* Keypad grid - glassmorphism buttons */}
      <div className="grid grid-cols-3 gap-3 w-72">
        {digits.map((d, i) => {
          if (d === "") return <div key={i} />;
          if (d === "del") {
            return (
              <button
                key={i}
                onClick={handleDelete}
                tabIndex={-1}
                className="h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/20 text-white flex items-center justify-center transition-all active:scale-95 active:bg-white/25"
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
              className="h-16 rounded-2xl bg-white/10 backdrop-blur-sm border border-white/15 hover:bg-white/20 text-white text-2xl font-bold transition-all active:scale-95 active:bg-white/25"
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
