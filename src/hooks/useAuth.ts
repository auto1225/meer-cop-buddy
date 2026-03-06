import { useState, useEffect, useCallback, useRef } from "react";
import { getSavedAuth, clearAuth, revalidateSerial, SerialAuthData } from "@/lib/serialAuth";
import { startWorkerInterval, stopWorkerInterval } from "@/lib/workerTimer";
import { updateDeviceViaEdge } from "@/lib/deviceApi";
import { supabase } from "@/integrations/supabase/client";
import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { getSharedDeviceId } from "@/lib/sharedDeviceIdMap";

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

  const signOut = useCallback(async () => {
    const currentAuth = getSavedAuth();
    
    // 1) 스마트폰에 로그아웃 브로드캐스트 전송
    if (currentAuth?.user_id) {
      const payload = {
        device_id: currentAuth.device_id,
        device_type: "laptop",
        device_name: currentAuth.device_name,
        user_id: currentAuth.user_id,
        timestamp: new Date().toISOString(),
      };

      try {
        const cmdChannel = supabase.channel(`user-commands-${currentAuth.user_id}`);
        
        await new Promise<void>((resolve) => {
          cmdChannel.subscribe((status) => {
            if (status === "SUBSCRIBED") {
              // 두 가지 형식으로 전송 (호환성)
              Promise.allSettled([
                cmdChannel.send({ type: "broadcast", event: "device_logout", payload }),
                cmdChannel.send({ type: "broadcast", event: "command", payload: { type: "device_logout", ...payload } }),
              ]).then(() => {
                console.log("[useAuth] ✅ device_logout broadcast sent");
                setTimeout(() => {
                  supabase.removeChannel(cmdChannel);
                  resolve();
                }, 300); // 전송 완료 대기
              });
            } else {
              // 구독 실패 시에도 진행
              setTimeout(resolve, 500);
            }
          });
        });
      } catch (err) {
        console.warn("[useAuth] ⚠️ Logout broadcast failed:", err);
      }

      // 2) DB 상태를 offline으로 업데이트 (로컬 + 공유 DB 동기화)
      try {
        await updateDeviceViaEdge(currentAuth.device_id, {
          status: "offline",
          is_monitoring: false,
          is_streaming_requested: false,
        });
        console.log("[useAuth] ✅ Device set to offline in DB");
      } catch (err) {
        console.warn("[useAuth] ⚠️ DB offline update failed:", err);
      }

      // 3) 공유 DB에서 기기를 offline으로 전환 (삭제하지 않고 이름 보존)
      const mappedSharedId = getSharedDeviceId(currentAuth.device_id);
      const sharedId = mappedSharedId || (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(currentAuth.device_id) ? currentAuth.device_id : null);
      if (sharedId) {
        fetch(`${SHARED_SUPABASE_URL}/functions/v1/update-device`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: SHARED_SUPABASE_ANON_KEY,
          },
          body: JSON.stringify({
            device_id: sharedId,
            status: "offline",
            is_monitoring: false,
            is_streaming_requested: false,
          }),
        })
          .then(res => res.ok
            ? console.log("[useAuth] ✅ Shared DB device set offline:", sharedId)
            : res.text().then(t => console.warn("[useAuth] ⚠️ Shared DB offline update failed:", t)))
          .catch(err => console.warn("[useAuth] ⚠️ Shared DB offline error:", err));
      } else {
        console.warn(`[useAuth] ⏭️ Skip shared update (no mapped shared UUID): ${currentAuth.device_id}`);
      }
    }

    // 3) 로컬 인증 정보 삭제
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
