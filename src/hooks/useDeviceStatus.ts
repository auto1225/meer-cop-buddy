import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";
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

export function useDeviceStatus(deviceId?: string, isAuthenticated?: boolean) {
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

  // DB 업데이트 (모바일 앱 호환성을 위해 최소한으로 유지, 쓰로틀링 적용)
  const updateDeviceStatusInDB = useCallback(async (
    networkConnected: boolean,
    cameraConnected: boolean
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
      await supabaseShared
        .from("devices")
        .update({
          is_network_connected: networkConnected,
          is_camera_connected: cameraConnected,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentDeviceId);
    } catch (error) {
      console.error("Failed to update device status in DB:", error);
    }
  }, []);

  // Update device online/offline status
  const updateDeviceOnlineStatus = useCallback(async (isOnline: boolean) => {
    const currentDeviceId = deviceIdRef.current;
    if (!currentDeviceId) return;

    try {
      await supabaseShared
        .from("devices")
        .update({
          status: isOnline ? "online" : "offline",
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentDeviceId);
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
      
      const channel = supabaseShared.channel(`device-presence-${deviceId}`, {
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
              await channel.track({
                status: "online",
                is_network_connected: navigator.onLine,
                last_seen_at: new Date().toISOString(),
              });
              console.log("[DeviceStatus] Presence synced");
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
  }, [deviceId]);

  // Sync status when authentication changes
  useEffect(() => {
    if (deviceId && isAuthenticated !== undefined) {
      updateDeviceOnlineStatus(isAuthenticated);
    }
  }, [deviceId, isAuthenticated, updateDeviceOnlineStatus]);

  // Handle page unload - set offline
  useEffect(() => {
    if (!deviceId) return;

    const handleBeforeUnload = () => {
      // Use sendBeacon for reliable unload requests
      const url = `https://sltxwkdvaapyeosikegj.supabase.co/rest/v1/devices?id=eq.${deviceId}`;
      const data = JSON.stringify({
        status: "offline",
        updated_at: new Date().toISOString(),
      });

      navigator.sendBeacon(
        url,
        new Blob([data], { type: "application/json" })
      );
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => {
      window.removeEventListener("beforeunload", handleBeforeUnload);
    };
  }, [deviceId]);

  // Network connectivity detection
  useEffect(() => {
    const handleOnline = () => {
      setStatus((prev) => {
        const newStatus = { ...prev, isNetworkConnected: true };
        syncPresence(true);
        updateDeviceStatusInDB(true, prev.isCameraAvailable);
        return newStatus;
      });
    };

    const handleOffline = () => {
      setStatus((prev) => {
        const newStatus = { ...prev, isNetworkConnected: false };
        syncPresence(false);
        updateDeviceStatusInDB(false, prev.isCameraAvailable);
        return newStatus;
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPresence, updateDeviceStatusInDB]);

  // Auto-detect camera availability
  useEffect(() => {
    let isMounted = true;

    const checkCameraAvailability = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some((device) => device.kind === "videoinput");

        if (isMounted) {
          setStatus((prev) => {
            if (prev.isCameraAvailable !== hasCamera) {
              // 카메라 상태는 DB만 업데이트, Presence에서는 제외
              updateDeviceStatusInDB(prev.isNetworkConnected, hasCamera);
            }
            return { ...prev, isCameraAvailable: hasCamera };
          });
        }
      } catch (error) {
        console.log("Camera detection failed:", error);
      }
    };

    checkCameraAvailability();

    const handleDeviceChange = () => {
      checkCameraAvailability();
    };

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    }

    return () => {
      isMounted = false;
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      }
    };
  }, [syncPresence, updateDeviceStatusInDB]);

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
  useEffect(() => {
    if (deviceId) {
      syncPresence(status.isNetworkConnected);
      updateDeviceStatusInDB(status.isNetworkConnected, status.isCameraAvailable);
    }
  }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCameraAvailable = useCallback((available: boolean) => {
    setStatus((prev) => {
      // 카메라 상태는 DB만 업데이트, Presence에서는 제외
      updateDeviceStatusInDB(prev.isNetworkConnected, available);
      return { ...prev, isCameraAvailable: available };
    });
  }, [updateDeviceStatusInDB]);

  return {
    isNetworkConnected: status.isNetworkConnected,
    isCameraAvailable: status.isCameraAvailable,
    setCameraAvailable,
  };
}
