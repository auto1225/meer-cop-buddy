import { useEffect, useCallback, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";

interface CameraDetectionOptions {
  deviceId: string | undefined;
}

/**
 * Camera detection hook - DB only (no Presence)
 * Presence is handled by useDeviceStatus to avoid duplicate channels
 */
export const useCameraDetection = ({ deviceId }: CameraDetectionOptions) => {
  const lastStatusRef = useRef<boolean | null>(null);

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

  const updateCameraStatus = useCallback(async (isConnected: boolean) => {
    // Only update if changed
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
      console.log("[CameraDetection] ✅ Updated is_camera_connected:", isConnected);
      
      // Dispatch event for useDeviceStatus to sync Presence
      window.dispatchEvent(new CustomEvent("camera-status-changed", { 
        detail: { isConnected } 
      }));
    } catch (error) {
      console.error("[CameraDetection] ❌ Update error:", error);
    }
  }, [deviceId]);

  const checkAndUpdate = useCallback(async () => {
    const hasCamera = await checkCameraAvailability();
    await updateCameraStatus(hasCamera);
  }, [checkCameraAvailability, updateCameraStatus]);

  useEffect(() => {
    if (!deviceId) {
      console.log("[CameraDetection] ⚠️ No deviceId, skipping");
      return;
    }

    console.log("[CameraDetection] 🚀 Initializing for device:", deviceId);

    // Initial check on mount
    checkAndUpdate();

    // Real-time device connect/disconnect events (USB cameras, etc.)
    const handleDeviceChange = () => {
      console.log("[CameraDetection] 🔄 Device change event triggered");
      checkAndUpdate();
    };
    
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [deviceId, checkAndUpdate]);

  return { checkAndUpdate };
};
