import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseShared, SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { getSavedAuth } from "@/lib/serialAuth";
import { updateDeviceViaEdge } from "@/lib/deviceApi";
import { getSharedDeviceId } from "@/lib/sharedDeviceIdMap";
import { RealtimeChannel } from "@supabase/supabase-js";

// Global tracking to prevent duplicate Presence channel subscriptions
const setupChannelKeys = new Set<string>();
const channelInstances = new Map<string, RealtimeChannel>();
const reconnectAttempts = new Map<string, number>();
const MAX_RECONNECT_ATTEMPTS = 5;
const BASE_RECONNECT_DELAY = 3000;
const PRESENCE_REFRESH_INTERVAL = 120_000; // 120초

interface DeviceStatus {
  isNetworkConnected: boolean;
  isCameraAvailable: boolean;
}

// Presence payload interface
interface PresenceState {
  device_id: string;
  serial_key: string;
  device_type: string;
  status: "online" | "offline";
  is_network_connected: boolean;
  is_camera_connected: boolean;
  battery_level: number | null;
  is_charging: boolean;
  device_name: string;
  last_seen_at: string;
}

// ── 유틸: 현재 상태를 수집하여 Presence 페이로드 생성 ──
async function buildPresencePayload(
  sharedDeviceId: string,
  isCameraConnected: boolean
): Promise<PresenceState> {
  const savedAuth = getSavedAuth();

  // 배터리
  let batteryLevel: number | null = null;
  let isCharging = false;
  if (navigator.getBattery) {
    try {
      const battery = await navigator.getBattery();
      batteryLevel = Math.round(battery.level * 100);
      isCharging = battery.charging;
    } catch { /* Battery API 미지원 */ }
  }

  return {
    device_id: sharedDeviceId,
    serial_key: savedAuth?.serial_key || "",
    device_type: "laptop",
    status: "online",
    is_network_connected: navigator.onLine,
    is_camera_connected: isCameraConnected,
    battery_level: batteryLevel,
    is_charging: isCharging,
    device_name: savedAuth?.device_name || "Laptop",
    last_seen_at: new Date().toISOString(),
  };
}

export function useDeviceStatus(deviceId?: string, isAuthenticated?: boolean, userId?: string) {
  const [status, setStatus] = useState<DeviceStatus>({
    isNetworkConnected: navigator.onLine,
    isCameraAvailable: false,
  });

  const deviceIdRef = useRef(deviceId);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const lastSyncRef = useRef<number>(0);
  // 공유 DB UUID를 캐시 (getSharedDeviceId가 아직 설정 안 됐을 수 있으므로 ref로 추적)
  const sharedIdRef = useRef<string | undefined>(undefined);
  // ★ 카메라 상태를 ref로 추적 — React state보다 항상 최신값 보장
  const cameraStatusRef = useRef<boolean>(false);

  deviceIdRef.current = deviceId;

  // sharedId 업데이트 추적 — resolve되면 채널 설정 트리거
  useEffect(() => {
    if (!deviceId) return;
    const check = () => {
      const sid = getSharedDeviceId(deviceId);
      if (sid && sid !== sharedIdRef.current) {
        sharedIdRef.current = sid;
        console.log(`[DeviceStatus] 🔗 Shared ID resolved: ${sid}`);
      }
    };
    check();
    const timer = setInterval(check, 2000);
    return () => clearInterval(timer);
  }, [deviceId]);

  // Presence 기반 상태 동기화 (실시간, DB 쓰기 없음)
  const syncPresence = useCallback(async (
    networkConnected: boolean
  ) => {
    const currentDeviceId = deviceIdRef.current;
    if (!currentDeviceId || !channelRef.current) return;

    // ★ sharedId 없으면 track하지 않음 (스마트폰 매칭 실패 방지)
    const sid = sharedIdRef.current || getSharedDeviceId(currentDeviceId);
    if (!sid) {
      console.log("[DeviceStatus] ⏳ syncPresence skipped - no sharedId yet");
      return;
    }
    const payload = await buildPresencePayload(sid, cameraStatusRef.current);
    payload.is_network_connected = networkConnected;

    try {
      await channelRef.current.track(payload);
      console.log("[DeviceStatus] Presence synced:", payload);
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
    if (now - lastSyncRef.current < 5000) return;
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

  // ── Presence 채널 설정 (공유 DB UUID가 resolve된 후에만 채널 생성) ──
  // sharedIdRef.current를 deps에 넣을 수 없으므로, state로 관리
  const [resolvedSharedId, setResolvedSharedId] = useState<string | undefined>(undefined);

  // sharedId가 resolve되면 state 업데이트 → 채널 설정 effect 트리거
  useEffect(() => {
    if (!deviceId) return;
    const check = () => {
      const sid = sharedIdRef.current || getSharedDeviceId(deviceId);
      if (sid && sid !== resolvedSharedId) {
        setResolvedSharedId(sid);
      }
    };
    check();
    const timer = setInterval(check, 1000);
    return () => clearInterval(timer);
  }, [deviceId, resolvedSharedId]);

  // ★ resolvedSharedId가 확정되면 현재 카메라 상태를 공유 DB에 즉시 동기화
  useEffect(() => {
    if (!resolvedSharedId || !deviceId) return;
    const currentCamera = cameraStatusRef.current;
    console.log(`[DeviceStatus] 🔗 SharedId resolved → syncing camera=${currentCamera} to shared DB (${resolvedSharedId})`);
    updateDeviceViaEdge(resolvedSharedId, {
      is_camera_connected: currentCamera,
      updated_at: new Date().toISOString(),
    }).catch((e) => console.error("[DeviceStatus] Failed to sync camera on sharedId resolve:", e));
  }, [resolvedSharedId, deviceId]);

  useEffect(() => {
    if (!deviceId || !userId || !resolvedSharedId) {
      console.log(`[DeviceStatus] ⏳ Waiting for sharedId before channel setup (deviceId=${deviceId}, userId=${userId}, sharedId=${resolvedSharedId})`);
      return;
    }

    const channelKey = `user-presence-${userId}`;

    // 이미 같은 sharedId로 설정된 채널은 스킵
    if (setupChannelKeys.has(channelKey)) {
      const existing = channelInstances.get(channelKey);
      if (existing) {
        channelRef.current = existing;
        // 기존 채널에 최신 payload로 re-track
        (async () => {
          try {
            let cam = false;
            try {
              const devices = await navigator.mediaDevices.enumerateDevices();
              cam = devices.some(d => d.kind === "videoinput");
            } catch {}
            const payload = await buildPresencePayload(resolvedSharedId, cam);
            await existing.track(payload);
            console.log("[DeviceStatus] ✅ Re-tracked on existing channel:", payload);
          } catch (e) {
            console.error("[DeviceStatus] Re-track failed:", e);
          }
        })();
        return;
      }
    }

    let reconnectTimerId: ReturnType<typeof setTimeout> | null = null;
    let isMounted = true;

    const setupChannel = () => {
      if (!isMounted) return;

      const attempts = reconnectAttempts.get(channelKey) || 0;
      if (attempts >= MAX_RECONNECT_ATTEMPTS) {
        console.log(`[DeviceStatus] ❌ Max reconnect attempts reached for ${channelKey}`);
        return;
      }

      // 기존 채널이 있으면 제거
      const existingChannel = channelInstances.get(channelKey);
      if (existingChannel) {
        supabaseShared.removeChannel(existingChannel);
        channelInstances.delete(channelKey);
      }
      setupChannelKeys.delete(channelKey);

      // ★ 핵심: Presence key = 공유 DB UUID (확정된 값만 사용)
      console.log(`[DeviceStatus] 🔗 Setting up Presence channel: ${channelKey} (key=${resolvedSharedId}, attempt ${attempts + 1}/${MAX_RECONNECT_ATTEMPTS})`);
      
      const channel = supabaseShared.channel(channelKey, {
        config: { presence: { key: resolvedSharedId } },
      });

      channel
        .on("presence", { event: "sync" }, () => {
          const state = channel.presenceState();
          console.log("[DeviceStatus] Presence sync:", state);
        })
        .subscribe(async (subStatus) => {
          console.log(`[DeviceStatus] Channel status: ${subStatus}`);
          
          if (subStatus === "SUBSCRIBED") {
            channelRef.current = channel;
            channelInstances.set(channelKey, channel);
            setupChannelKeys.add(channelKey);
            reconnectAttempts.set(channelKey, 0);
            
            try {
              let initCameraConnected = false;
              try {
                const devices = await navigator.mediaDevices.enumerateDevices();
                initCameraConnected = devices.some(d => d.kind === "videoinput");
              } catch { /* ignore */ }

              // 초기 하드웨어 상태를 로컬 상태/ref에 반영
              cameraStatusRef.current = initCameraConnected;
              setStatus((prev) => ({ ...prev, isCameraAvailable: initCameraConnected }));

              const payload = await buildPresencePayload(resolvedSharedId, initCameraConnected);
              await channel.track(payload);
              console.log("[DeviceStatus] ✅ Initial presence tracked:", payload);

              // ★ camera-status-changed 이벤트가 없더라도 DB를 즉시 정합화
              if (deviceIdRef.current) {
                await updateDeviceViaEdge(deviceIdRef.current, {
                  is_camera_connected: initCameraConnected,
                  updated_at: new Date().toISOString(),
                });
                console.log("[DeviceStatus] ✅ Initial camera synced to DB:", initCameraConnected);
              }
            } catch (e) {
              console.error("[DeviceStatus] Failed to sync presence:", e);
            }
          } else if (subStatus === "CLOSED" || subStatus === "CHANNEL_ERROR") {
            setupChannelKeys.delete(channelKey);
            channelInstances.delete(channelKey);
            
            const currentAttempts = reconnectAttempts.get(channelKey) || 0;
            if (isMounted && currentAttempts < MAX_RECONNECT_ATTEMPTS) {
              const delay = BASE_RECONNECT_DELAY * Math.pow(2, currentAttempts);
              console.log(`[DeviceStatus] ⚠️ Channel ${subStatus}, reconnect ${currentAttempts + 1}/${MAX_RECONNECT_ATTEMPTS} in ${delay / 1000}s`);
              reconnectAttempts.set(channelKey, currentAttempts + 1);
              
              reconnectTimerId = setTimeout(() => {
                if (isMounted && deviceIdRef.current === deviceId) {
                  setupChannel();
                }
              }, delay);
            }
          }
        });

      channelRef.current = channel;
    };

    setupChannel();

    return () => {
      isMounted = false;
      if (reconnectTimerId) clearTimeout(reconnectTimerId);
      const channel = channelInstances.get(channelKey);
      if (channel) {
        channel.untrack().catch(() => {});
        supabaseShared.removeChannel(channel);
        channelInstances.delete(channelKey);
        setupChannelKeys.delete(channelKey);
      }
      channelRef.current = null;
    };
  }, [deviceId, userId, resolvedSharedId]);

  // ── 주기적 Presence 갱신 (120초) ──
  useEffect(() => {
    if (!deviceId || !channelRef.current) return;

    const refreshPresence = async () => {
      if (!channelRef.current) return;
      const sid = sharedIdRef.current || getSharedDeviceId(deviceId);
      if (!sid) return; // sharedId 없으면 스킵
      try {
        const payload = await buildPresencePayload(sid, cameraStatusRef.current);
        await channelRef.current.track(payload);
        console.log("[DeviceStatus] 🔄 Presence refreshed (120s), camera:", cameraStatusRef.current);
      } catch (e) {
        console.error("[DeviceStatus] Presence refresh failed:", e);
      }
    };

    const intervalId = setInterval(refreshPresence, PRESENCE_REFRESH_INTERVAL);
    return () => clearInterval(intervalId);
  }, [deviceId]);

  // Sync status when authentication changes
  useEffect(() => {
    if (deviceId && isAuthenticated !== undefined) {
      updateDeviceOnlineStatus(isAuthenticated);
    }
  }, [deviceId, isAuthenticated, updateDeviceOnlineStatus]);

  // Handle page unload & sleep - set offline with all statuses
  useEffect(() => {
    if (!deviceId) return;

    const sendOfflineBeacon = () => {
      const updates = {
        status: "offline",
        is_network_connected: false,
        is_camera_connected: false,
        updated_at: new Date().toISOString(),
      };

      // 1) 공유 DB (매핑된 shared ID 사용)
      const mappedSharedId = getSharedDeviceId(deviceId);
      const isUuid = (s: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(s);
      const sharedId = mappedSharedId || (isUuid(deviceId) ? deviceId : null);
      if (sharedId) {
        const sharedBlob = new Blob(
          [JSON.stringify({ device_id: sharedId, updates })],
          { type: "application/json" }
        );
        navigator.sendBeacon(
          `${SHARED_SUPABASE_URL}/functions/v1/update-device`, sharedBlob
        );
      }

      // 2) 로컬 DB
      const localProjectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "dmvbwyfzueywuwxkjuuy";
      const localBlob = new Blob(
        [JSON.stringify({ device_id: deviceId, updates })],
        { type: "application/json" }
      );
      navigator.sendBeacon(
        `https://${localProjectId}.supabase.co/functions/v1/update-device`, localBlob
      );

      console.log(`[DeviceStatus] 🚪 sendBeacon offline: shared=${sharedId} local=${deviceId}`);
    };

    const sendStatusUpdate = (isOnline: boolean) => {
      if (!isOnline) {
        sendOfflineBeacon();
        return;
      }
      updateDeviceViaEdge(deviceId, {
        status: "online",
        is_network_connected: navigator.onLine,
        updated_at: new Date().toISOString(),
      }).catch(() => {});
    };

    const handleBeforeUnload = () => {
      // untrack before leaving
      channelRef.current?.untrack().catch(() => {});
      sendOfflineBeacon();
    };

    const handleVisibilityChange = () => {
      if (document.hidden) {
        console.log("[DeviceStatus] 💤 Page hidden → sending offline");
        sendStatusUpdate(false);
      } else {
        console.log("[DeviceStatus] ☀️ Page visible → sending online");
        sendStatusUpdate(true);
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
      console.log("[DeviceStatus] 📷 Camera status changed event:", isConnected);
      cameraStatusRef.current = isConnected; // ★ ref를 먼저 업데이트
      setStatus((prev) => ({ ...prev, isCameraAvailable: isConnected }));
      
      // DB 동기화 — 로컬 ID로 호출 (updateDeviceViaEdge 내부에서 shared 매핑 처리)
      if (deviceIdRef.current) {
        updateDeviceViaEdge(deviceIdRef.current, {
          is_camera_connected: isConnected,
          updated_at: new Date().toISOString(),
        }).catch((e) => console.error("[DeviceStatus] Failed to sync camera to DB:", e));
      }

      // ★ 공유 DB에도 직접 업데이트 (shared ID가 로컬 ID와 다른 경우 대비)
      const sid = sharedIdRef.current || (deviceIdRef.current ? getSharedDeviceId(deviceIdRef.current) : undefined);
      if (sid && sid !== deviceIdRef.current) {
        updateDeviceViaEdge(sid, {
          is_camera_connected: isConnected,
          updated_at: new Date().toISOString(),
        }).catch((e) => console.error("[DeviceStatus] Failed to sync camera to shared DB:", e));
      }
      
      // Presence 재동기화 (공유 DB UUID 사용)
      if (channelRef.current && deviceIdRef.current) {
        (async () => {
          const presenceSid = sid || deviceIdRef.current!;
          try {
            const payload = await buildPresencePayload(presenceSid, isConnected);
            await channelRef.current?.track(payload);
            console.log("[DeviceStatus] Presence re-synced with camera:", isConnected);
          } catch (e) {
            console.error("[DeviceStatus] Failed to re-sync presence for camera:", e);
          }
        })();
      }
    };

    window.addEventListener("camera-status-changed", handleCameraStatusChanged as EventListener);
    return () => {
      window.removeEventListener("camera-status-changed", handleCameraStatusChanged as EventListener);
    };
  }, []);

  // Initial sync when deviceId becomes available
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
        is_camera_connected: cameraStatusRef.current,
      };

      const connection = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
      const networkInfo: Record<string, unknown> = {
        type: connection?.type || "unknown",
        downlink: connection?.downlink ?? null,
        rtt: connection?.rtt ?? null,
        effective_type: connection?.effectiveType || "unknown",
        updated_at: now,
      };

      try {
        const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(3000) });
        const data = await res.json();
        if (data.ip) updates.ip_address = data.ip;
      } catch { /* ignore */ }

      updates.metadata = { network_info: networkInfo };

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
      } catch { /* ignore */ }

      try {
        await updateDeviceViaEdge(deviceId, updates);
        console.log("[DeviceStatus] 💓 Heartbeat sent");
      } catch (error) {
        console.error("[DeviceStatus] Heartbeat failed:", error);
      }
    };

    sendHeartbeat();
    const intervalId = setInterval(sendHeartbeat, 60_000);
    return () => clearInterval(intervalId);
  }, [deviceId]);

  return {
    isNetworkConnected: status.isNetworkConnected,
    isCameraAvailable: status.isCameraAvailable,
  };
}
