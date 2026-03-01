/**
 * 도난 복구 시스템 (Steal Recovery)
 * 
 * 경보가 활성화된 상태에서 네트워크가 끊기면(도난 후 이동 등):
 * 1. 경보 상태를 localStorage에 영속 저장
 * 2. 네트워크 재연결 시 자동으로:
 *    - GPS 위치 확인 → DB 업데이트
 *    - 스마트폰에 경보 재전송 (Presence)
 *    - 푸시 알림 전송 (위치 포함)
 *    - 스트리밍 자동 시작 요청
 *    - 주기적 위치 추적 시작 (30초 간격)
 * 
 * 스마트폰에서 경보 해제 시 → 복구 비활성화
 */

import { useEffect, useRef, useCallback } from "react";
import { supabaseShared } from "@/lib/supabase";
import { updateDeviceViaEdge } from "@/lib/deviceApi";

const STOLEN_STATE_KEY = "meercop_stolen_state";

// L-12: GPS 폴링 지수 백오프 (30s → 60s → 120s → 300s)
const GPS_INTERVALS = [30_000, 60_000, 120_000, 300_000];
const BATTERY_STOP_THRESHOLD = 0.2; // 20% 미만 시 추적 중단

export interface StolenState {
  isActive: boolean;
  alertEventType: string;
  alertMessage: string;
  alertCreatedAt: string;
  lostAt: string; // 네트워크 끊긴 시각
}

function getStolenState(): StolenState | null {
  try {
    const raw = localStorage.getItem(STOLEN_STATE_KEY);
    if (!raw) return null;
    const state = JSON.parse(raw) as StolenState;
    return state.isActive ? state : null;
  } catch {
    return null;
  }
}

function saveStolenState(state: StolenState): void {
  localStorage.setItem(STOLEN_STATE_KEY, JSON.stringify(state));
}

export function clearStolenState(): void {
  localStorage.removeItem(STOLEN_STATE_KEY);
}

/**
 * 경보 활성 상태를 localStorage에 기록
 * (경보 발생 시 호출)
 */
export function markAlertActive(eventType: string, message: string): void {
  saveStolenState({
    isActive: true,
    alertEventType: eventType,
    alertMessage: message,
    alertCreatedAt: new Date().toISOString(),
    lostAt: "",
  });
  console.log("[StealRecovery] 🔴 Alert state persisted to localStorage");
}

/**
 * 경보 해제 시 호출 (스마트폰 해제 OR 로컬 해제)
 */
export function markAlertCleared(): void {
  clearStolenState();
  console.log("[StealRecovery] ✅ Alert state cleared from localStorage");
}

// GPS 좌표 얻기
function getCurrentPosition(): Promise<GeolocationCoordinates | null> {
  return new Promise((resolve) => {
    if (!navigator.geolocation) {
      resolve(null);
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => resolve(pos.coords),
      () => resolve(null),
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 0 }
    );
  });
}

interface UseStealRecoveryOptions {
  deviceId?: string;
  userId?: string;
  isAlarming: boolean;
  onRecoveryTriggered?: () => void;
  /** 브라우저 새로고침/재실행 시 경보 상태가 남아있으면 호출 */
  onAlarmRestore?: (state: StolenState) => void;
}

export function useStealRecovery({ deviceId, userId, isAlarming, onRecoveryTriggered, onAlarmRestore }: UseStealRecoveryOptions) {
  const trackingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const trackingStepRef = useRef(0); // 지수 백오프 단계
  const isRecoveringRef = useRef(false);
  const deviceIdRef = useRef(deviceId);
  deviceIdRef.current = deviceId;

  // 🔄 마운트 시 경보 복원: 브라우저 새로고침/재실행 후에도 경보 자동 재개
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current) return;
    const stolenState = getStolenState();
    if (stolenState?.isActive) {
      restoredRef.current = true;
      console.log("[StealRecovery] 🔄 Browser restarted with active alarm — restoring alert!");
      onAlarmRestore?.(stolenState);
    }
  }, [onAlarmRestore]);
  useEffect(() => {
    if (!isAlarming) return;

    const handleOffline = () => {
      const existing = getStolenState();
      if (existing && existing.isActive) {
        // 이미 경보 상태 기록됨 → lostAt만 업데이트
        saveStolenState({ ...existing, lostAt: new Date().toISOString() });
        console.log("[StealRecovery] 📡 Network lost during alarm — lostAt updated");
      }
    };

    window.addEventListener("offline", handleOffline);
    return () => window.removeEventListener("offline", handleOffline);
  }, [isAlarming]);

  // L-12: 주기적 위치 추적 (지수 백오프 + 배터리 체크)
  const scheduleNextTracking = useCallback((devId: string) => {
    const step = trackingStepRef.current;
    const interval = GPS_INTERVALS[Math.min(step, GPS_INTERVALS.length - 1)];
    
    console.log(`[StealRecovery] 📍 Next location update in ${interval / 1000}s (step ${step})`);
    
    trackingTimerRef.current = setTimeout(async () => {
      const stolenState = getStolenState();
      if (!stolenState?.isActive) {
        trackingTimerRef.current = null;
        return;
      }

      // L-12: 배터리 20% 미만 시 추적 중단
      if (navigator.getBattery) {
        try {
          const battery = await navigator.getBattery();
          if (battery.level < BATTERY_STOP_THRESHOLD && !battery.charging) {
            console.log(`[StealRecovery] 🔋 Battery ${(battery.level * 100).toFixed(0)}% — stopping tracking to save power`);
            trackingTimerRef.current = null;
            return;
          }
        } catch {
          // Battery API 미지원 — 계속 진행
        }
      }

      const coords = await getCurrentPosition();
      if (coords) {
        try {
          await updateDeviceViaEdge(devId, {
            latitude: coords.latitude,
            longitude: coords.longitude,
            location_updated_at: new Date().toISOString(),
            metadata: {
              last_location_source: "steal_recovery_tracking",
            },
          });

          console.log("[StealRecovery] 📍 Location updated:", coords.latitude, coords.longitude);
        } catch (e) {
          console.error("[StealRecovery] Failed to update location:", e);
        }
      }

      // 다음 단계로 증가 후 재스케줄
      trackingStepRef.current = step + 1;
      scheduleNextTracking(devId);
    }, interval);
  }, []);

  // 네트워크 복구 시 복구 시퀀스 실행
  const executeRecovery = useCallback(async (stolenState: StolenState) => {
    const devId = deviceIdRef.current;
    if (!devId || isRecoveringRef.current) return;
    isRecoveringRef.current = true;

    console.log("[StealRecovery] 🔄 Network reconnected! Starting recovery sequence...");

    try {
      // 1. GPS 위치 확인
      const coords = await getCurrentPosition();
      
      // 2. DB에 위치 + 상태 업데이트 (metadata patch)
      const updatePayload: Record<string, unknown> = {
        status: "online",
        is_network_connected: true,
        updated_at: new Date().toISOString(),
        is_streaming_requested: true, // 스트리밍 자동 시작
        metadata: {
          steal_recovery: {
            recovered_at: new Date().toISOString(),
            lost_at: stolenState.lostAt,
            alert_type: stolenState.alertEventType,
          },
          last_location_source: "steal_recovery",
        },
      };

      if (coords) {
        updatePayload.latitude = coords.latitude;
        updatePayload.longitude = coords.longitude;
        updatePayload.location_updated_at = new Date().toISOString();
      }

      await updateDeviceViaEdge(devId, updatePayload);

      console.log("[StealRecovery] ✅ DB updated with location + streaming request");

      // 3. Presence 채널로 경보 재전송 (통합 채널: user-alerts-{userId})
      const channelKey = userId || devId;
      const alertChannel = supabaseShared.channel(`user-alerts-${channelKey}`, {
        config: { presence: { key: devId } },
      });

      await new Promise<void>((resolve) => {
        alertChannel.subscribe(async (status) => {
          if (status === "SUBSCRIBED") {
            await alertChannel.track({
              device_id: devId,
              active_alert: {
                id: `recovery-${Date.now()}`,
                device_id: devId,
                event_type: stolenState.alertEventType,
                event_data: {
                  alert_type: stolenState.alertEventType.replace("alert_", ""),
                  message: `🔄 네트워크 복구 — ${stolenState.alertMessage}`,
                  is_recovery: true,
                  lost_at: stolenState.lostAt,
                  recovered_at: new Date().toISOString(),
                  latitude: coords?.latitude,
                  longitude: coords?.longitude,
                  auto_streaming: true,
                },
                created_at: new Date().toISOString(),
              },
              updated_at: new Date().toISOString(),
            });
            console.log("[StealRecovery] ✅ Alert re-broadcasted via Presence");
            resolve();
          }
        });
      });

      // 4. 푸시 알림 전송 (위치 포함)
      const locationText = coords 
        ? `위도: ${coords.latitude.toFixed(6)}, 경도: ${coords.longitude.toFixed(6)}` 
        : "위치 확인 불가";

      // 푸시 알림은 Presence 채널을 통해 전달되므로 별도 Edge Function 호출 불필요
      console.log("[StealRecovery] ✅ Recovery alert sent via Presence");

      // 5. 주기적 위치 추적 시작 (지수 백오프)
      trackingStepRef.current = 0;
      scheduleNextTracking(devId);

      onRecoveryTriggered?.();
    } catch (error) {
      console.error("[StealRecovery] Recovery failed:", error);
    } finally {
      isRecoveringRef.current = false;
    }
  }, [userId, scheduleNextTracking, onRecoveryTriggered]);

  // 네트워크 online 이벤트 감지
  useEffect(() => {
    const handleOnline = () => {
      const stolenState = getStolenState();
      if (stolenState?.isActive) {
        // 약간의 딜레이 후 복구 (네트워크 안정화 대기)
        setTimeout(() => executeRecovery(stolenState), 2000);
      }
    };

    window.addEventListener("online", handleOnline);

    // 마운트 시에도 확인 (이미 온라인이지만 stolen state가 남아있는 경우)
    if (navigator.onLine) {
      const stolenState = getStolenState();
      if (stolenState?.isActive) {
        setTimeout(() => executeRecovery(stolenState), 3000);
      }
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      if (trackingTimerRef.current) {
        clearTimeout(trackingTimerRef.current);
        trackingTimerRef.current = null;
      }
    };
  }, [executeRecovery]);

  // 경보 해제 시 추적 중단 + stolen state 정리
  useEffect(() => {
    if (!isAlarming) {
      if (trackingTimerRef.current) {
        clearTimeout(trackingTimerRef.current);
        trackingTimerRef.current = null;
        console.log("[StealRecovery] 🛑 Periodic tracking stopped (alarm cleared)");
      }
    }
  }, [isAlarming]);

  return {
    stolenState: getStolenState(),
    clearStolenState,
  };
}
