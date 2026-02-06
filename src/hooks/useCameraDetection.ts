import { useEffect, useCallback, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

interface CameraDetectionOptions {
  deviceId: string | undefined;
}

export const useCameraDetection = ({ deviceId }: CameraDetectionOptions) => {
  const lastStatusRef = useRef<boolean | null>(null);
  const presenceChannelRef = useRef<RealtimeChannel | null>(null);

  // Setup Presence channel for real-time camera status sync
  useEffect(() => {
    if (!deviceId) return;

    const channel = supabaseShared.channel(`device-presence-${deviceId}`, {
      config: { presence: { key: deviceId } },
    });

    channel.subscribe((status) => {
      if (status === "SUBSCRIBED") {
        presenceChannelRef.current = channel;
        console.log("[CameraDetection] Presence channel subscribed");
      }
    });

    return () => {
      supabaseShared.removeChannel(channel);
      presenceChannelRef.current = null;
    };
  }, [deviceId]);

  const checkCameraAvailability = useCallback(async (): Promise<boolean> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(device => device.kind === "videoinput");
      console.log("[CameraDetection] Camera available:", hasCamera);
      return hasCamera;
    } catch (error) {
      console.error("[CameraDetection] Error:", error);
      return false;
    }
  }, []);

  // Sync to Presence (real-time, no DB write)
  const syncToPresence = useCallback(async (isConnected: boolean) => {
    if (!presenceChannelRef.current) {
      console.log("[CameraDetection] Presence channel not ready");
      return;
    }

    try {
      await presenceChannelRef.current.track({
        status: "online",
        is_network_connected: navigator.onLine,
        is_camera_connected: isConnected,
        last_seen_at: new Date().toISOString(),
      });
      console.log("[CameraDetection] ✅ Presence synced - camera:", isConnected);
    } catch (error) {
      console.error("[CameraDetection] Presence sync error:", error);
    }
  }, []);

  // Sync to DB (throttled, for persistence)
  const syncToDb = useCallback(async (isConnected: boolean) => {
    if (lastStatusRef.current === isConnected || !deviceId) return;
    
    try {
      const { error } = await supabaseShared
        .from("devices")
        .update({ 
          is_camera_connected: isConnected,
          updated_at: new Date().toISOString()
        })
        .eq("id", deviceId);

      if (error) throw error;
      
      lastStatusRef.current = isConnected;
      console.log("[CameraDetection] ✅ DB synced - camera:", isConnected);
    } catch (error) {
      console.error("[CameraDetection] ❌ DB sync error:", error);
    }
  }, [deviceId]);

  const checkAndUpdate = useCallback(async () => {
    const hasCamera = await checkCameraAvailability();
    
    // Sync to Presence immediately (real-time)
    await syncToPresence(hasCamera);
    
    // Also sync to DB (for persistence)
    await syncToDb(hasCamera);
  }, [checkCameraAvailability, syncToPresence, syncToDb]);

  useEffect(() => {
    if (!deviceId) return;

    // Initial check on mount (with delay to wait for presence channel)
    const initTimeout = setTimeout(() => {
      checkAndUpdate();
    }, 1000);

    // Real-time device connect/disconnect events (USB cameras, etc.)
    const handleDeviceChange = () => {
      console.log("[CameraDetection] Device change event triggered");
      checkAndUpdate();
    };
    
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      clearTimeout(initTimeout);
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [deviceId, checkAndUpdate]);

  return { checkAndUpdate };
};
