import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseShared, SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { fetchDeviceViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import { getSavedAuth } from "@/lib/serialAuth";
import { RealtimeChannel } from "@supabase/supabase-js";

// Global tracking to prevent duplicate Presence channel subscriptions
const setupDeviceIds = new Set<string>();
const deviceChannels = new Map<string, RealtimeChannel>();
const reconnectAttempts = new Map<string, number>();
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 3000;

interface DeviceStatus {
  isNetworkConnected: boolean;
  isCameraAvailable: boolean;
}

// Presence state - only status and network, NOT camera
// Camera status is synced via DB Realtime only
interface PresenceState {
  status: "online" | "offline";
  is_network_connected: boolean;
  last_seen_at: string;
}

export function useDeviceStatus(deviceId?: string, isAuthenticated?: boolean, userId?: string) {
  const [status, setStatus] = useState<DeviceStatus>({
    isNetworkConnected: navigator.onLine,
    isCameraAvailable: false,
  });

  const deviceIdRef = useRef(deviceId);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSyncRef = useRef<number>(0);

  deviceIdRef.current = deviceId;

  // Presence 기반 상태 동기화 (실시간, DB 쓰기 없음)
  // 카메라 상태는 DB Realtime에서만 동기화 (Presence에서 제외)
  const syncPresence = useCallback(async (
    networkConnected: boolean
  ) => {
    const currentDeviceId = deviceIdRef.current;
    if (!currentDeviceId || !channelRef.current) return;

    const presenceState: PresenceState = {
      status: "online",
      is_network_connected: networkConnected,
      last_seen_at: new Date().toISOString(),
    };

    try {
      await channelRef.current.track(presenceState);
      console.log("[DeviceStatus] Presence synced:", presenceState);
    } catch (error) {
      console.error("[DeviceStatus] Failed to sync presence:", error);
    }
  }, []);

  // DB 업데이트 (네트워크 상태만 - 카메라는 useCameraDetection이 단독 관리)
  const updateNetworkStatusInDB = useCallback(async (
    networkConnected: boolean
  ) => {
    const currentDeviceId = deviceIdRef.current;
    if (!currentDeviceId) return;

    // 쓰로틀링: 최소 5초 간격으로만 DB 업데이트
    const now = Date.now();
    if (now - lastSyncRef.current < 5000) {
      return;
    }
    lastSyncRef.current = now;

    try {
      await updateDeviceViaEdge(currentDeviceId, {
        is_network_connected: networkConnected,
        updated_at: new Date().toISOString(),
      });
    } catch (error) {
      console.error("Failed to update network status in DB:", error);
    }
  }, []);

  // Update device online/offline status
  const updateDeviceOnlineStatus = useCallback(async (isOnline: boolean) => {
    const currentDeviceId = deviceIdRef.current;
    if (!currentDeviceId) return;

    try {
      await updateDeviceViaEdge(currentDeviceId, {
        status: isOnline ? "online" : "offline",
        updated_at: new Date().toISOString(),
      });
      console.log(`[DeviceStatus] Updated status to ${isOnline ? "online" : "offline"}`);
    } catch (error) {
      console.error("Failed to update device online status:", error);
    }
  }, []);

  // Presence 채널 설정 (중복 방지 및 자동 재연결)
  useEffect(() => {
    if (!deviceId) return;

    // 이미 설정된 디바이스는 스킵
    if (setupDeviceIds.has(deviceId)) {
      console.log(`[DeviceStatus] ⏭️ Presence already setup for ${deviceId}`);
      channelRef.current = deviceChannels.get(deviceId) || null;
      return;
    }

    let reconnectTimerId: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const setupChannel = () => {
      if (!isMounted) return;

      const attempts = reconnectAttempts.get(deviceId) || 0;
      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log(`[DeviceStatus] ❌ Max reconnect attempts (${MAX_RECONNECT_ATTEMPTS}) reached, stopping`);
        return;
      }

      // 기존 채널이 있으면 제거
      const existingChannel = deviceChannels.get(deviceId);
      if (existingChannel) {
        supabaseShared.removeChannel(existingChannel);
        deviceChannels.delete(deviceId);
      }
      setupDeviceIds.delete(deviceId);

      console.log(`[DeviceStatus] 🔗 Setting up Presence channel for ${deviceId} (attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      
      const channelKey = userId || deviceId;
      const channel = supabaseShared.channel(`user-presence-${channelKey}`, {
        config: { presence: { key: deviceId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          console.log("[DeviceStatus] Presence sync:", state);
        })
        .subscribe(async (status) => {
          console.log(`[DeviceStatus] Channel status: ${status}`);
          
          if (status === "SUBSCRIBED") {
            channelRef.current = channel;
            deviceChannels.set(deviceId, channel);
            setupDeviceIds.add(deviceId);
            // 성공 시 재시도 카운터 리셋
            reconnectAttempts.set(deviceId, 0);
            
            try {
              // 배터리 정보 포함 (스마트폰 측 요구사항)
              let batteryLevel: number | null = null;
              let isCharging = false;
              if (navigator.getBattery) {
                try {
                  const battery = await navigator.getBattery();
                  batteryLevel = Math.round(battery.level * 100);
                  isCharging = battery.charging;
                } catch {
                  // Battery API 미지원
                }
              }
              await channel.track({
                device_id: deviceId,
                status: "online",
                is_network_connected: navigator.onLine,
                battery_level: batteryLevel,
                is_charging: isCharging,
                last_seen_at: new Date().toISOString(),
              });
              console.log("[DeviceStatus] Presence synced (battery:", batteryLevel, "%)");
            } catch (e) {
              console.error("[DeviceStatus] Failed to sync presence:", e);
            }
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            setupDeviceIds.delete(deviceId);
            deviceChannels.delete(deviceId);
            
            const currentAttempts = reconnectAttempts.get(deviceId) || 0;
            if (isMounted && currentAttempts < MAX_RECONNECT_ATTEMPTS) {
              const delay = BASE_RECONNECT_DELAY * Math.pow(2, currentAttempts);
              console.log(`[DeviceStatus] ⚠️ Channel ${status}, reconnect ${currentAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s`);
              reconnectAttempts.set(deviceId, currentAttempts + 1);
              
              reconnectTimerId = setTimeout(() => {
                if (isMounted && deviceIdRef.current === deviceId) {
                  setupChannel();
                }
              }, delay);
            } else if (currentAttempts >= MAX_RECONNECT_ATTEMPTS) {
              console.log(`[DeviceStatus] ❌ Giving up after ${MAX_RECONNECT_ATTEMPTS} attempts`);
            }
          }
        });

      channelRef.current = channel;
    };

    setupChannel();

    return () => {
      isMounted = false;
      if (reconnectTimerId) clearTimeout(reconnectTimerId);
      const channel = deviceChannels.get(deviceId);
      if (channel) {
        supabaseShared.removeChannel(channel);
        deviceChannels.delete(deviceId);
        setupDeviceIds.delete(deviceId);
      }
      channelRef.current = null;
    };
  }, [deviceId, userId]);

  // Sync status when authentication changes
  useEffect(() => {
    if (deviceId && isAuthenticated !== undefined) {
      updateDeviceOnlineStatus(isAuthenticated);
    }
  }, [deviceId, isAuthenticated, updateDeviceOnlineStatus]);

  // Handle page unload & sleep - set offline with all statuses
  useEffect(() => {
    if (!deviceId) return;

    const SUPABASE_URL = SHARED_SUPABASE_URL;
    const SUPABASE_ANON_KEY = SHARED_SUPABASE_ANON_KEY;

    const sendOfflineBeacon = () => {
      // Edge Function으로 오프라인 상태 전송 (sendBeacon은 POST만 지원)
      const url = `${SHARED_SUPABASE_URL}/functions/v1/update-device`;
      const body = JSON.stringify({
        device_id: deviceId,
        updates: {
          status: "offline",
          is_network_connected: false,
          is_camera_connected: false,
          updated_at: new Date().toISOString(),
        },
      });
      const blob = new Blob([body], { type: "application/json" });
      
      const sent = navigator.sendBeacon(url, blob);
      console.log(`[DeviceStatus] 🚪 sendBeacon offline: ${sent}`);
    };

    const sendStatusUpdate = (isOnline: boolean) => {
      if (!isOnline) {
        sendOfflineBeacon();
        return;
      }
      // 카메라 상태는 useCameraDetection이 단독 관리하므로 여기서 제외
      updateDeviceViaEdge(deviceId, {
        status: "online",
        is_network_connected: navigator.onLine,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    };

    // 브라우저 종료 시
    const handleBeforeUnload = () => {
      sendOfflineBeacon();
    };

    // 절전모드 진입/복귀 감지
    const handleVisibilityChange = () => {
      if (document.hidden) {
        // 절전모드 또는 탭 비활성화 → offline
        console.log("[DeviceStatus] 💤 Page hidden (sleep/minimize) → sending offline");
        sendStatusUpdate(false);
      } else {
        // 절전모드 복귀 또는 탭 활성화 → online
        console.log("[DeviceStatus] ☀️ Page visible (wake/focus) → sending online");
        sendStatusUpdate(true);
        // Presence 재동기화
        syncPresence(navigator.onLine);
      }
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    document.addEventListener("visibilitychange", handleVisibilityChange);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
    };
  }, [deviceId, syncPresence]);

  // Network connectivity detection
  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => {
        syncPresence(true);
        updateNetworkStatusInDB(true);
        return { ...prev, isNetworkConnected: true };
      });
    };

    const handleOffline = () => {
      setStatus((prev) => {
        syncPresence(false);
        updateNetworkStatusInDB(false);
        return { ...prev, isNetworkConnected: false };
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPresence, updateNetworkStatusInDB]);

  // Listen for camera status changes from useCameraDetection
  useEffect(() => {
    const handleCameraStatusChanged = (event: CustomEvent<{ isConnected: boolean }>) => {
      const { isConnected } = event.detail;
      console.log("[DeviceStatus] Camera status changed event:", isConnected);
      // 카메라 상태는 useCameraDetection에서 DB로 직접 업데이트
      // Presence에서는 카메라 상태를 동기화하지 않음
      setStatus((prev) => ({ ...prev, isCameraAvailable: isConnected }));
    };

    window.addEventListener("camera-status-changed", handleCameraStatusChanged as EventListener);
    return () => {
      window.removeEventListener("camera-status-changed", handleCameraStatusChanged as EventListener);
    };
  }, []);

  // Initial sync when deviceId becomes available
  // syncPresence and updateNetworkStatusInDB are stable (useCallback with no changing deps)
  useEffect(() => {
    if (deviceId) {
      syncPresence(status.isNetworkConnected);
      updateNetworkStatusInDB(status.isNetworkConnected);
    }
  }, [deviceId, syncPresence, updateNetworkStatusInDB, status.isNetworkConnected]);

  // Periodic heartbeat: update last_seen_at + location + network every 60s
  useEffect(() => {
    if (!deviceId) return;

    const sendHeartbeat = async () => {
      const now = new Date().toISOString();
      const updates: Record<string, unknown> = {
        last_seen_at: now,
        updated_at: now,
        is_network_connected: navigator.onLine,
      };

      // Gather network info
      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const networkInfo: Record<string, unknown> = {
        type: connection?.type || "unknown",
        downlink: connection?.downlink ?? null,
        rtt: connection?.rtt ?? null,
        effective_type: connection?.effectiveType || "unknown",
        updated_at: now,
      };

      // Fetch IP (non-blocking, skip on failure)
      // IP 조회 (비차단, 실패 시 무시 — 의도적 catch)
      try {
        const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        if (data.ip) updates.ip_address = data.ip;
      } catch {
        // IP 조회 실패는 정상 동작에 영향 없음 — 의도적으로 무시
      }

      // Merge network_info into metadata
      try {
        const savedAuth = getSavedAuth();
        const uid = savedAuth?.user_id;
        const device = uid ? await fetchDeviceViaEdge(deviceId, uid) : null;
        const existingMeta = (device?.metadata as Record<string, unknown>) || {};
        updates.metadata = { ...existingMeta, network_info: networkInfo };
      } catch (err) {
        // metadata fetch 실패 시 network_info만 단독 전송
        console.warn("[DeviceStatus] Metadata fetch failed, sending standalone:", err);
        updates.metadata = { network_info: networkInfo };
      }

      // Gather location (non-blocking)
      try {
        const position = await new Promise<GeolocationPosition>((resolve, reject) => {
          navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 10000,
            maximumAge: 30000,
          });
        });
        updates.latitude = position.coords.latitude;
        updates.longitude = position.coords.longitude;
        updates.location_updated_at = now;
      } catch {
        // GPS 위치 획득 실패 — 정상 동작에 영향 없음, 의도적으로 무시
      }

      try {
        await updateDeviceViaEdge(deviceId, updates);
        console.log("[DeviceStatus] 💓 Heartbeat sent (with location + network)");
      } catch (error) {
        console.error("[DeviceStatus] Heartbeat failed:", error);
      }
    };

    // Send immediately on mount
    sendHeartbeat();

    // L-9: 하트비트 주기 60초 → 120초 (DB 쓰기 50%↓)
    const intervalId = setInterval(sendHeartbeat, 120_000);

    return () => clearInterval(intervalId);
  }, [deviceId]);

  return {
    isNetworkConnected: status.isNetworkConnected,
    isCameraAvailable: status.isCameraAvailable,
  };
}
