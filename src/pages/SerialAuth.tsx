import { useState, useRef, useEffect } from "react";
import { validateSerial, clearAuth } from "@/lib/serialAuth";
import { ResizableContainer } from "@/components/ResizableContainer";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { LogOut } from "lucide-react";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import meercopLogo from "@/assets/meercop-logo.png";
import loginTreesBg from "@/assets/login-trees-bg.png";
import { I18nProvider, useTranslation, type Lang } from "@/lib/i18n";

const REMEMBER_KEY = "meercop_remember_input";

interface SerialAuthProps {
  onSuccess: (deviceId: string, userId: string) => void;
}

function SerialAuthInner({ onSuccess }: SerialAuthProps) {
  const [parts, setParts] = useState(["", "", ""]);
  const [deviceName, setDeviceName] = useState("");
  const [rememberMe, setRememberMe] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [showExitDialog, setShowExitDialog] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);
  const { t } = useTranslation();

  useEffect(() => {
    try {
      const saved = localStorage.getItem(REMEMBER_KEY);
      if (saved) {
        const { parts: savedParts, deviceName: savedName } = JSON.parse(saved);
        if (savedParts) setParts(savedParts);
        if (savedName) setDeviceName(savedName);
        setRememberMe(true);
      }
    } catch {}
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
    if (e.key === "Enter") handleSubmit();
  };

  const handleSubmit = async () => {
    const serialKey = parts.join("-");
    if (serialKey.replace(/-/g, "").length !== 12) {
      setError(t("auth.serialError"));
      return;
    }
    if (!deviceName.trim()) {
      setError(t("auth.nameError"));
      return;
    }

    setLoading(true);
    setError("");

    try {
      if (rememberMe) {
        localStorage.setItem(REMEMBER_KEY, JSON.stringify({ parts, deviceName: deviceName.trim() }));
      } else {
        localStorage.removeItem(REMEMBER_KEY);
      }
      const authData = await validateSerial(serialKey, deviceName.trim());
      onSuccess(authData.device_id, authData.user_id);
    } catch (err: any) {
      setError(err.message || t("auth.authFailed"));
    } finally {
      setLoading(false);
    }
  };

  const handleExit = () => setShowExitDialog(true);

  const confirmExit = () => {
    clearAuth();
    localStorage.removeItem(REMEMBER_KEY);
    setParts(["", "", ""]);
    setDeviceName("");
    setRememberMe(false);
    setShowExitDialog(false);
    window.close();
    setTimeout(() => { window.location.href = "about:blank"; }, 300);
  };

  return (
    <ResizableContainer
      initialWidth={300} initialHeight={520}
      minWidth={200} minHeight={347}
      maxWidth={450} maxHeight={780}
      baseWidth={300} baseHeight={520}
    >
      <div className="w-full h-full sky-background flex flex-col relative overflow-hidden">
        <div className="absolute top-3 right-3 z-20">
          <button onClick={handleExit} className="flex flex-col items-center text-white/80 hover:text-white transition-colors">
            <LogOut className="h-4 w-4" />
            <span className="text-[10px] mt-0.5">{t("auth.exit")}</span>
          </button>
        </div>

        <div className="flex-1 flex flex-col items-center justify-center px-6 z-10">
          <div className="mb-4">
            <img src={meercopLogo} alt="MeerCOP" className="h-14 object-contain" />
          </div>

          <p className="text-white/80 text-xs text-center mb-4">{t("auth.checkSerial")}</p>

          <Input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder={t("auth.deviceName")}
            disabled={loading}
            className="w-full max-w-[240px] h-9 mb-3 backdrop-blur-xl bg-white/15 border border-white/25 rounded-full text-white placeholder:text-white/40 text-center text-sm font-bold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
          />

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
                  className="w-[68px] h-10 px-2 text-center text-sm font-mono font-bold tracking-widest backdrop-blur-xl bg-white/15 border border-white/25 rounded-full text-white placeholder:text-white/30 focus:outline-none focus:ring-2 focus:ring-white/30 disabled:opacity-50 drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
                />
                {i < 2 && <span className="text-white/60 font-bold">-</span>}
              </div>
            ))}
          </div>

          <label className="flex items-center gap-2 mb-3 cursor-pointer select-none">
            <Checkbox
              checked={rememberMe}
              onCheckedChange={(checked) => setRememberMe(checked === true)}
              className="border-white/50 data-[state=checked]:bg-secondary data-[state=checked]:border-secondary h-3.5 w-3.5"
            />
            <span className="text-white/70 text-[11px]">{t("auth.rememberMe")}</span>
          </label>

          {error && <p className="text-red-300 text-xs text-center mb-3">{error}</p>}

          <Button
            onClick={handleSubmit}
            disabled={loading}
            className="w-full max-w-[240px] h-9 backdrop-blur-xl bg-white/20 border border-white/30 hover:bg-white/30 text-white font-extrabold rounded-full text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]"
          >
            {loading ? t("auth.connecting") : t("auth.connect")}
          </Button>
        </div>

        <div className="absolute bottom-0 left-0 right-0 z-0">
          <img src={loginTreesBg} alt="" className="w-full object-cover object-bottom" style={{ maxHeight: "120px" }} />
        </div>

        <AlertDialog open={showExitDialog} onOpenChange={setShowExitDialog}>
          <AlertDialogContent className="backdrop-blur-2xl bg-black/40 border border-white/15 shadow-2xl max-w-[280px] rounded-2xl">
            <AlertDialogHeader>
              <AlertDialogTitle className="text-white font-extrabold text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                {t("auth.exitConfirm")}
              </AlertDialogTitle>
              <AlertDialogDescription className="text-white/70 text-center text-xs">
                {t("auth.exitDesc")}
              </AlertDialogDescription>
            </AlertDialogHeader>
            <AlertDialogFooter className="flex-row gap-2 sm:justify-center">
              <AlertDialogCancel className="flex-1 backdrop-blur-xl bg-white/10 border-white/20 text-white hover:bg-white/20 hover:text-white rounded-full text-xs">
                {t("auth.cancel")}
              </AlertDialogCancel>
              <AlertDialogAction
                onClick={confirmExit}
                className="flex-1 bg-destructive hover:bg-destructive/90 text-destructive-foreground rounded-full text-xs"
              >
                {t("auth.exitBtn")}
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </ResizableContainer>
  );
}

export default function SerialAuth({ onSuccess }: SerialAuthProps) {
  const savedLang = (localStorage.getItem("meercop-language") as Lang) || "ko";
  return (
    <I18nProvider initialLang={savedLang}>
      <SerialAuthInner onSuccess={onSuccess} />
    </I18nProvider>
  );
}
