import { useState, useEffect, useCallback, useRef } from "react";
import { getSavedAuth, clearAuth, revalidateSerial, SerialAuthData } from "@/lib/serialAuth";
import { startWorkerInterval, stopWorkerInterval } from "@/lib/workerTimer";

const REVALIDATION_INTERVAL = 60 * 60 * 1000; // 1시간
const REVALIDATION_TIMER_ID = "serial-revalidation";

export function useAuth() {
  const [authData, setAuthData] = useState<SerialAuthData | null>(() => getSavedAuth());
  const [isLoading, setIsLoading] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const initialRevalidationDone = useRef(false);

  // 만료 체크
  const checkExpiration = useCallback((data: SerialAuthData | null) => {
    if (!data) return false;
    if (data.remaining_days !== null && data.remaining_days <= 0) {
      setIsExpired(true);
      return true;
    }
    setIsExpired(false);
    return false;
  }, []);

  // 재검증 실행
  const doRevalidate = useCallback(async () => {
    const updated = await revalidateSerial();
    if (updated) {
      setAuthData(updated);
      checkExpiration(updated);
    }
  }, [checkExpiration]);

  // 앱 시작 시 즉시 재검증 + 1시간 간격 폴링
  useEffect(() => {
    if (!authData || initialRevalidationDone.current) return;
    initialRevalidationDone.current = true;

    // 앱 시작 시 즉시 재검증
    doRevalidate();

    // 1시간 간격 재검증 (Web Worker 기반)
    startWorkerInterval(REVALIDATION_TIMER_ID, doRevalidate, REVALIDATION_INTERVAL);

    return () => {
      stopWorkerInterval(REVALIDATION_TIMER_ID);
    };
  }, [authData, doRevalidate]);

  // Listen for storage changes
  useEffect(() => {
    const handleStorage = () => {
      const data = getSavedAuth();
      setAuthData(data);
      checkExpiration(data);
    };
    window.addEventListener("storage", handleStorage);
    return () => window.removeEventListener("storage", handleStorage);
  }, [checkExpiration]);

  const signOut = useCallback(() => {
    clearAuth();
    stopWorkerInterval(REVALIDATION_TIMER_ID);
    setAuthData(null);
    setIsExpired(false);
    initialRevalidationDone.current = false;
  }, []);

  const refreshAuth = useCallback(() => {
    const data = getSavedAuth();
    setAuthData(data);
    checkExpiration(data);
  }, [checkExpiration]);

  return {
    user: authData ? { id: authData.user_id, email: null } : null,
    session: null,
    isLoading,
    isAuthenticated: !!authData,
    isExpired,
    signOut,
    refreshAuth,
    revalidate: doRevalidate,
    deviceId: authData?.device_id ?? null,
    userId: authData?.user_id ?? null,
    serialKey: authData?.serial_key ?? null,
    planType: authData?.plan_type ?? "free",
    expiresAt: authData?.expires_at ?? null,
    remainingDays: authData?.remaining_days ?? null,
  };
}
