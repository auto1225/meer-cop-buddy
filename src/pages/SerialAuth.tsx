import { useState, useRef, useEffect } from "react";
import { validateSerial } from "@/lib/serialAuth";
import { ResizableContainer } from "@/components/ResizableContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { LogOut } from "lucide-react";
import meercopLogo from "@/assets/meercop-logo.png";
import loginTreesBg from "@/assets/login-trees-bg.png";

interface SerialAuthProps {
  onSuccess: (deviceId: string, userId: string) => void;
}

export default function SerialAuth({ onSuccess }: SerialAuthProps) {
  const [parts, setParts] = useState(["", "", ""]);
  const [deviceName, setDeviceName] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  useEffect(() => {
    inputRefs.current[0]?.focus();
  }, []);

  const handleChange = (index: number, value: string) => {
    const clean = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 4);
    const newParts = [...parts];
    newParts[index] = clean;
    setParts(newParts);

    if (clean.length === 4 && index < 2) {
      inputRefs.current[index + 1]?.focus();
    }
  };

  const handleKeyDown = (index: number, e: React.KeyboardEvent) => {
    if (e.key === "Backspace" && parts[index] === "" && index > 0) {
      inputRefs.current[index - 1]?.focus();
    }
    if (e.key === "Enter") {
      handleSubmit();
    }
  };

  const handleSubmit = async () => {
    const serialKey = parts.join("-");
    if (serialKey.replace(/-/g, "").length !== 12) {
      setError("시리얼 넘버를 모두 입력해주세요.");
      return;
    }
    if (!deviceName.trim()) {
      setError("기기 이름을 입력해주세요.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const authData = await validateSerial(serialKey, deviceName.trim());
      onSuccess(authData.device_id, authData.user_id);
    } catch (err: any) {
      setError(err.message || "인증에 실패했습니다.");
    } finally {
      setLoading(false);
    }
  };

  const handleExit = () => {
    window.close();
  };

  return (
    <ResizableContainer
      initialWidth={300}
      initialHeight={520}
      minWidth={200}
      minHeight={347}
      maxWidth={450}
      maxHeight={780}
      baseWidth={300}
      baseHeight={520}
    >
      <div className="w-full h-full sky-background flex flex-col relative overflow-hidden">
        {/* Exit button */}
        <div className="absolute top-3 right-3 z-20">
          <button
            onClick={handleExit}
            className="flex flex-col items-center text-white/80 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            <span className="text-[10px] mt-0.5">종료</span>
          </button>
        </div>

        {/* Main content */}
        <div className="flex-1 flex flex-col items-center justify-center px-6 z-10">
          {/* Logo */}
          <div className="mb-4">
            <img
              src={meercopLogo}
              alt="MeerCOP"
              className="h-14 object-contain"
            />
          </div>

          {/* Instructions */}
          <p className="text-white/80 text-xs text-center mb-4">
            스마트폰 앱 → 설정에서 시리얼 넘버를 확인하세요
          </p>

          {/* Device Name Input */}
          <Input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="기기 이름 (예: 안방 노트북)"
            disabled={loading}
            className="w-full max-w-[240px] h-9 mb-3 bg-white/90 border-0 rounded-md text-foreground placeholder:text-muted-foreground/50 text-center text-sm"
          />

          {/* Serial Input */}
          <div className="flex items-center gap-2 mb-4">
            {parts.map((part, i) => (
              <div key={i} className="flex items-center gap-2">
                <input
                  ref={(el) => { inputRefs.current[i] = el; }}
                  value={part}
                  onChange={(e) => handleChange(i, e.target.value)}
                  onKeyDown={(e) => handleKeyDown(i, e)}
                  maxLength={4}
                  placeholder="XXXX"
                  disabled={loading}
                  className="w-[68px] h-10 px-2 text-center text-sm font-mono font-bold tracking-widest bg-white/90 border-0 rounded-md text-foreground placeholder:text-muted-foreground/40 focus:outline-none focus:ring-2 focus:ring-secondary disabled:opacity-50"
                />
                {i < 2 && <span className="text-white/60 font-bold">-</span>}
              </div>
            ))}
          </div>

          {/* Error */}
          {error && (
            <p className="text-red-300 text-xs text-center mb-3">{error}</p>
          )}

          {/* Submit */}
          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full max-w-[240px] h-9 bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold rounded-full text-sm"
          >
            {loading ? "확인 중..." : "연결하기"}
          </Button>
        </div>

        {/* Trees background */}
        <div className="absolute bottom-0 left-0 right-0 z-0">
          <img
            src={loginTreesBg}
            alt=""
            className="w-full object-cover object-bottom"
            style={{ maxHeight: "120px" }}
          />
        </div>
      </div>
    </ResizableContainer>
  );
}
