import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

// Global tracking to prevent duplicate Presence channel subscriptions
const setupDeviceIds = new Set<string>();
const deviceChannels = new Map<string, RealtimeChannel>();

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

  // DB 업데이트 (네트워크 상태만 - 카메라는 useCameraDetection에서 전담)
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
      await supabaseShared
        .from("devices")
        .update({
          is_network_connected: networkConnected,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentDeviceId);
    } catch (error) {
      console.error("Failed to update network status in DB:", error);
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

    let isMounted = true;
    let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

    const setupChannel = () => {
      // 언마운트 후 재연결 방지
      if (!isMounted) return;

      // 기존 채널이 있으면 제거
      const existingChannel = deviceChannels.get(deviceId);
      if (existingChannel) {
        supabaseShared.removeChannel(existingChannel);
        deviceChannels.delete(deviceId);
      }

      console.log(`[DeviceStatus] 🔗 Setting up Presence channel for ${deviceId}`);
      
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
            
            await syncPresence(navigator.onLine);
          } else if (status === "CLOSED" || status === "CHANNEL_ERROR") {
            // 언마운트 후 무시
            if (!isMounted) return;
            
            console.log(`[DeviceStatus] ⚠️ Channel ${status}, will reconnect in 5s`);
            setupDeviceIds.delete(deviceId);
            deviceChannels.delete(deviceId);
            
            // 5초 후 자동 재연결 (언마운트 체크 포함)
            reconnectTimer = setTimeout(() => {
              if (isMounted && deviceIdRef.current === deviceId) {
                console.log(`[DeviceStatus] 🔄 Reconnecting Presence channel...`);
                setupChannel();
              }
            }, 5000);
          }
        });

      channelRef.current = channel;
    };

    setupChannel();

    return () => {
      isMounted = false;
      if (reconnectTimer) clearTimeout(reconnectTimer);
      
      if (deviceIdRef.current === deviceId) {
        const channel = deviceChannels.get(deviceId);
        if (channel) {
          supabaseShared.removeChannel(channel);
          deviceChannels.delete(deviceId);
          setupDeviceIds.delete(deviceId);
        }
        channelRef.current = null;
      }
    };
  }, [deviceId, syncPresence]);

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
        updateNetworkStatusInDB(true);
        return newStatus;
      });
    };

    const handleOffline = () => {
      setStatus((prev) => {
        const newStatus = { ...prev, isNetworkConnected: false };
        syncPresence(false);
        updateNetworkStatusInDB(false);
        return newStatus;
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [syncPresence, updateNetworkStatusInDB]);

  // Listen for camera status changes from useCameraDetection (UI 상태만 업데이트)
  useEffect(() => {
    const handleCameraStatusChanged = (event: CustomEvent<{ isConnected: boolean }>) => {
      const { isConnected } = event.detail;
      console.log("[DeviceStatus] Camera status changed event:", isConnected);
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
      updateNetworkStatusInDB(status.isNetworkConnected);
    }
  }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCameraAvailable = useCallback((available: boolean) => {
    setStatus((prev) => ({ ...prev, isCameraAvailable: available }));
  }, []);

  return {
    isNetworkConnected: status.isNetworkConnected,
    isCameraAvailable: status.isCameraAvailable,
    setCameraAvailable,
  };
}
