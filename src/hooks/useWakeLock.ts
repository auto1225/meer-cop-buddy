import { useEffect, useRef } from "react";

/**
 * Wake Lock API를 사용하여 화면 꺼짐/백그라운드 킬 방지
 * - active가 true일 때 Wake Lock 획득
 * - visibilitychange 시 자동 재획득
 * - 브라우저 미지원 시 graceful fallback
 */
export function useWakeLock(active: boolean) {
  const wakeLockRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active || !("wakeLock" in navigator)) return;

    let released = false;

    const acquire = async () => {
      if (released) return;
      try {
        // 기존 lock이 있으면 해제
        if (wakeLockRef.current) {
          await wakeLockRef.current.release().catch(() => {});
          wakeLockRef.current = null;
        }
        wakeLockRef.current = await navigator.wakeLock.request("screen");
        console.log("[WakeLock] ✅ Acquired");

        wakeLockRef.current.addEventListener("release", () => {
          console.log("[WakeLock] 🔓 Released by system");
          wakeLockRef.current = null;
        });
      } catch (err) {
        console.warn("[WakeLock] Failed to acquire:", err);
      }
    };

    // visibilitychange 시 자동 재획득
    const handleVisibility = () => {
      if (!document.hidden && active) {
        acquire();
      }
    };

    acquire();
    document.addEventListener("visibilitychange", handleVisibility);

    return () => {
      released = true;
      document.removeEventListener("visibilitychange", handleVisibility);
      wakeLockRef.current?.release().catch(() => {});
      wakeLockRef.current = null;
      console.log("[WakeLock] 🧹 Cleanup");
    };
  }, [active]);
}
