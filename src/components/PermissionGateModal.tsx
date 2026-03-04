import React, { useEffect, useState, useCallback } from "react";
import { Camera, Mic, MapPin, X, ShieldCheck, AlertTriangle } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

interface PermissionItem {
  key: "camera" | "microphone" | "geolocation";
  icon: React.ReactNode;
  state: PermissionState | "unknown";
  checking: boolean;
}

const DISMISS_STORAGE_KEY = "meercop-permission-dismissed";
const DISMISS_DURATION_MS = 24 * 60 * 60 * 1000; // 24시간

/** 최근 dismiss 여부 확인 */
function wasRecentlyDismissed(): boolean {
  try {
    const raw = localStorage.getItem(DISMISS_STORAGE_KEY);
    if (!raw) return false;
    const ts = parseInt(raw, 10);
    return Date.now() - ts < DISMISS_DURATION_MS;
  } catch {
    return false;
  }
}

async function queryPermission(name: string): Promise<PermissionState> {
  try {
    const result = await navigator.permissions.query({ name: name as PermissionName });
    return result.state;
  } catch {
    return "prompt"; // API 미지원 시 prompt로 가정
  }
}

export function PermissionGateModal() {
  const { t } = useI18n();
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<PermissionItem[]>([
    { key: "camera", icon: <Camera className="w-5 h-5" />, state: "unknown", checking: true },
    { key: "microphone", icon: <Mic className="w-5 h-5" />, state: "unknown", checking: true },
    { key: "geolocation", icon: <MapPin className="w-5 h-5" />, state: "unknown", checking: true },
  ]);
  const [requesting, setRequesting] = useState<string | null>(null);

  // 권한 상태 확인
  const checkAllPermissions = useCallback(async () => {
    const results = await Promise.all([
      queryPermission("camera"),
      queryPermission("microphone"),
      queryPermission("geolocation"),
    ]);

    const keys: PermissionItem["key"][] = ["camera", "microphone", "geolocation"];
    const icons = [
      <Camera className="w-5 h-5" key="cam" />,
      <Mic className="w-5 h-5" key="mic" />,
      <MapPin className="w-5 h-5" key="loc" />,
    ];

    const newItems = keys.map((key, i) => ({
      key,
      icon: icons[i],
      state: results[i],
      checking: false,
    }));

    setItems(newItems);

    // 미승인 항목이 있으면 팝업 표시 (최근 dismiss 안 했을 때만)
    const hasUngranted = newItems.some(item => item.state !== "granted");
    if (hasUngranted && !wasRecentlyDismissed()) {
      setOpen(true);
    }
  }, []);

  useEffect(() => {
    // 약간의 지연 후 확인 (앱 초기화 완료 대기)
    const timer = setTimeout(checkAllPermissions, 1500);
    return () => clearTimeout(timer);
  }, [checkAllPermissions]);

  // 개별 권한 요청
  const requestPermission = useCallback(async (key: PermissionItem["key"]) => {
    setRequesting(key);
    try {
      if (key === "camera") {
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        stream.getTracks().forEach(t => t.stop());
      } else if (key === "microphone") {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        stream.getTracks().forEach(t => t.stop());
      } else if (key === "geolocation") {
        await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, { timeout: 10000 });
        });
      }
    } catch (err) {
      console.warn(`[PermissionGate] ${key} request failed/denied:`, err);
    }

    // 재확인
    const newState = await queryPermission(key);
    setItems(prev => prev.map(item =>
      item.key === key ? { ...item, state: newState } : item
    ));
    setRequesting(null);
  }, []);

  // 전체 승인 요청
  const requestAll = useCallback(async () => {
    const ungranted = items.filter(item => item.state !== "granted");
    for (const item of ungranted) {
      await requestPermission(item.key);
    }
  }, [items, requestPermission]);

  // 나중에 하기
  const handleDismiss = useCallback(() => {
    try {
      localStorage.setItem(DISMISS_STORAGE_KEY, Date.now().toString());
    } catch { /* ignore */ }
    setOpen(false);
  }, []);

  // 모든 권한이 granted면 자동 닫기
  useEffect(() => {
    if (items.every(item => !item.checking && item.state === "granted") && open) {
      const timer = setTimeout(() => setOpen(false), 800);
      return () => clearTimeout(timer);
    }
  }, [items, open]);

  if (!open) return null;

  const ungrantedCount = items.filter(i => i.state !== "granted" && !i.checking).length;
  const allGranted = ungrantedCount === 0 && items.every(i => !i.checking);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black/40 backdrop-blur-sm animate-in fade-in duration-300">
      <div className="relative w-full max-w-sm rounded-2xl border border-white/25 bg-white/15 backdrop-blur-xl shadow-2xl overflow-hidden">
        {/* Glass highlight */}
        <div className="absolute inset-0 bg-gradient-to-b from-white/20 to-transparent pointer-events-none rounded-2xl" />

        {/* Close button */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 z-10 p-1.5 rounded-full bg-white/10 hover:bg-white/25 transition-colors"
        >
          <X className="w-4 h-4 text-white/80" />
        </button>

        <div className="relative p-6 space-y-5">
          {/* Header */}
          <div className="flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-yellow-400/20 border border-yellow-400/30">
              <ShieldCheck className="w-6 h-6 text-yellow-300" />
            </div>
            <div>
              <h2 className="text-white font-extrabold text-lg drop-shadow-md">
                {t("permission.title")}
              </h2>
              <p className="text-white/70 text-xs mt-0.5">
                {t("permission.subtitle")}
              </p>
            </div>
          </div>

          {/* Permission items */}
          <div className="space-y-2.5">
            {items.map((item) => {
              const isGranted = item.state === "granted";
              const isDenied = item.state === "denied";
              const isPrompt = item.state === "prompt" || item.state === "unknown";
              const isThisRequesting = requesting === item.key;

              return (
                <div
                  key={item.key}
                  className={`flex items-center gap-3 p-3 rounded-xl border transition-all duration-200 ${
                    isGranted
                      ? "bg-green-500/15 border-green-400/30"
                      : isDenied
                      ? "bg-red-500/15 border-red-400/30"
                      : "bg-white/10 border-white/20"
                  }`}
                >
                  {/* Icon */}
                  <div className={`p-2 rounded-lg ${
                    isGranted ? "bg-green-400/20 text-green-300" :
                    isDenied ? "bg-red-400/20 text-red-300" :
                    "bg-white/15 text-white/80"
                  }`}>
                    {item.icon}
                  </div>

                  {/* Text */}
                  <div className="flex-1 min-w-0">
                    <p className="text-white font-bold text-sm drop-shadow-sm">
                      {t(`permission.${item.key}.name`)}
                    </p>
                    <p className={`text-xs mt-0.5 ${
                      isDenied ? "text-red-300/90" : "text-white/60"
                    }`}>
                      {isDenied
                        ? t(`permission.${item.key}.denied`)
                        : isGranted
                        ? t("permission.granted")
                        : t(`permission.${item.key}.desc`)
                      }
                    </p>
                  </div>

                  {/* Status / Action */}
                  {item.checking ? (
                    <div className="w-5 h-5 border-2 border-white/30 border-t-white/80 rounded-full animate-spin" />
                  ) : isGranted ? (
                    <div className="text-green-400 text-sm font-bold">✓</div>
                  ) : isDenied ? (
                    <div className="flex items-center gap-1">
                      <AlertTriangle className="w-4 h-4 text-red-400" />
                    </div>
                  ) : (
                    <button
                      onClick={() => requestPermission(item.key)}
                      disabled={isThisRequesting}
                      className="px-3 py-1.5 rounded-lg bg-white/20 hover:bg-white/30 border border-white/25 text-white text-xs font-bold transition-all disabled:opacity-50"
                    >
                      {isThisRequesting ? "..." : t("permission.allow")}
                    </button>
                  )}
                </div>
              );
            })}
          </div>

          {/* Warning for denied items */}
          {items.some(i => i.state === "denied") && (
            <div className="flex items-start gap-2 p-3 rounded-xl bg-red-500/10 border border-red-400/20">
              <AlertTriangle className="w-4 h-4 text-red-400 mt-0.5 flex-shrink-0" />
              <p className="text-red-200/90 text-xs leading-relaxed">
                {t("permission.deniedWarning")}
              </p>
            </div>
          )}

          {/* Buttons */}
          <div className="flex gap-2">
            {!allGranted && (
              <button
                onClick={requestAll}
                disabled={!!requesting}
                className="flex-1 py-2.5 rounded-xl bg-[#E8F84A]/90 hover:bg-[#E8F84A] text-gray-900 font-extrabold text-sm transition-all disabled:opacity-50 shadow-lg"
              >
                {t("permission.allowAll")}
              </button>
            )}
            <button
              onClick={handleDismiss}
              className={`${allGranted ? "flex-1" : ""} py-2.5 px-4 rounded-xl bg-white/10 hover:bg-white/20 border border-white/20 text-white/80 font-bold text-sm transition-all`}
            >
              {allGranted ? t("permission.done") : t("permission.later")}
            </button>
          </div>

          {/* Repeat info */}
          {!allGranted && (
            <p className="text-center text-white/40 text-[10px]">
              {t("permission.repeatInfo")}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
