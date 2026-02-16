import { useEffect, useCallback, useRef } from "react";
import { updateDeviceViaEdge } from "@/lib/deviceApi";

interface CameraDetectionOptions {
  deviceId: string | undefined;
}

/**
 * Camera detection hook - DB only (no Presence)
 * Presence is handled by useDeviceStatus to avoid duplicate channels
 */
export const useCameraDetection = ({ deviceId }: CameraDetectionOptions) => {
  const lastStatusRef = useRef<boolean | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pendingCheckRef = useRef(false);

  const checkCameraAvailability = useCallback(async (): Promise<boolean> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasCamera = devices.some(device => device.kind === "videoinput");
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
      await updateDeviceViaEdge(deviceId, { 
        is_camera_connected: isConnected,
        updated_at: new Date().toISOString()
      });
      
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

  // Debounced check: waits for devicechange events to settle before checking
  const debouncedCheckAndUpdate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    pendingCheckRef.current = true;
    debounceTimerRef.current = setTimeout(async () => {
      if (!pendingCheckRef.current) return;
      pendingCheckRef.current = false;
      // Double-check after settling: read twice with a small gap to avoid transient states
      const first = await checkCameraAvailability();
      await new Promise(r => setTimeout(r, 300));
      const second = await checkCameraAvailability();
      const stable = first === second ? first : second;
      console.log("[CameraDetection] Camera available (debounced):", stable);
      await updateCameraStatus(stable);
    }, 500);
  }, [checkCameraAvailability, updateCameraStatus]);

  useEffect(() => {
    if (!deviceId) return;

    console.log("[CameraDetection] 🚀 Initializing for device:", deviceId);

    // Initial check on mount
    checkAndUpdate();

    // Real-time device connect/disconnect events (USB cameras, etc.)
    const handleDeviceChange = () => {
      console.log("[CameraDetection] 🔄 Device change event triggered");
      debouncedCheckAndUpdate();
    };
    
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [deviceId, checkAndUpdate, debouncedCheckAndUpdate]);

  return { checkAndUpdate };
};
