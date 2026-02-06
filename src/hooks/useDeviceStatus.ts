import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

interface DeviceStatus {
  isNetworkConnected: boolean;
  isCameraAvailable: boolean;
}

interface PresenceState {
  status: "online" | "offline";
  is_network_connected: boolean;
  is_camera_connected: boolean;
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
  const syncPresence = useCallback(async (
    networkConnected: boolean,
    cameraConnected: boolean
  ) => {
    const currentDeviceId = deviceIdRef.current;
    if (!currentDeviceId || !channelRef.current) return;

    const presenceState: PresenceState = {
      status: "online",
      is_network_connected: networkConnected,
      is_camera_connected: cameraConnected,
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

  // Presence 채널 설정
  useEffect(() => {
    if (!deviceId) return;

    const channel = supabaseShared.channel(`device-presence-${deviceId}`, {
      config: { presence: { key: deviceId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        console.log("[DeviceStatus] Presence sync:", state);
      })
      .subscribe(async (status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          // 초기 상태 동기화
          await syncPresence(
            navigator.onLine,
            false // 카메라 상태는 별도 감지
          );
        }
      });

    return () => {
      supabaseShared.removeChannel(channel);
      channelRef.current = null;
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
        syncPresence(true, prev.isCameraAvailable);
        updateDeviceStatusInDB(true, prev.isCameraAvailable);
        return newStatus;
      });
    };

    const handleOffline = () => {
      setStatus((prev) => {
        const newStatus = { ...prev, isNetworkConnected: false };
        syncPresence(false, prev.isCameraAvailable);
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
              syncPresence(prev.isNetworkConnected, hasCamera);
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

  // Initial sync when deviceId becomes available
  useEffect(() => {
    if (deviceId) {
      syncPresence(status.isNetworkConnected, status.isCameraAvailable);
      updateDeviceStatusInDB(status.isNetworkConnected, status.isCameraAvailable);
    }
  }, [deviceId]); // eslint-disable-line react-hooks/exhaustive-deps

  const setCameraAvailable = useCallback((available: boolean) => {
    setStatus((prev) => {
      syncPresence(prev.isNetworkConnected, available);
      updateDeviceStatusInDB(prev.isNetworkConnected, available);
      return { ...prev, isCameraAvailable: available };
    });
  }, [syncPresence, updateDeviceStatusInDB]);

  return {
    isNetworkConnected: status.isNetworkConnected,
    isCameraAvailable: status.isCameraAvailable,
    setCameraAvailable,
  };
}
