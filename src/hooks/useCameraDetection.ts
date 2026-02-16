import { useEffect, useCallback, useRef } from "react";
import { updateDeviceViaEdge } from "@/lib/deviceApi";

interface CameraDetectionOptions {
  deviceId: string | undefined;
}

/**
 * Camera detection hook - DB only (no Presence)
 * 
 * Key design: devicechange events can ONLY upgrade status (false→true).
 * Downgrade (true→false) is NEVER done via enumerateDevices() because
 * browsers return inconsistent results during stream acquisition/release.
 * The offline/unload handler in useDeviceStatus handles the true→false case.
 */
export const useCameraDetection = ({ deviceId }: CameraDetectionOptions) => {
  const lastStatusRef = useRef<boolean | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const checkCameraAvailability = useCallback(async (): Promise<boolean> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      return devices.some(device => device.kind === "videoinput");
    } catch (error) {
      console.error("[CameraDetection] Error:", error);
      return false;
    }
  }, []);

  const updateCameraStatus = useCallback(async (isConnected: boolean) => {
    if (lastStatusRef.current === isConnected || !deviceId) return;
    
    try {
      await updateDeviceViaEdge(deviceId, { 
        is_camera_connected: isConnected,
        updated_at: new Date().toISOString()
      });
      
      lastStatusRef.current = isConnected;
      console.log("[CameraDetection] ✅ Updated is_camera_connected:", isConnected);
      
      window.dispatchEvent(new CustomEvent("camera-status-changed", { 
        detail: { isConnected } 
      }));
    } catch (error) {
      console.error("[CameraDetection] ❌ Update error:", error);
    }
  }, [deviceId]);

  // Only upgrades (false→true). Never downgrades via enumerateDevices.
  const checkAndUpgrade = useCallback(async () => {
    const hasCamera = await checkCameraAvailability();
    if (hasCamera) {
      await updateCameraStatus(true);
    } else if (lastStatusRef.current === null) {
      // First check ever: trust the result
      await updateCameraStatus(false);
    }
    // If already true and enumerateDevices says false → IGNORE (transient)
  }, [checkCameraAvailability, updateCameraStatus]);

  useEffect(() => {
    if (!deviceId) return;

    console.log("[CameraDetection] 🚀 Initializing for device:", deviceId);

    // Initial check (can set true or false on first run)
    checkAndUpgrade();

    // devicechange: only used to detect NEW cameras (upgrade to true)
    const handleDeviceChange = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        console.log("[CameraDetection] 🔄 Device change → checking for upgrade");
        checkAndUpgrade();
      }, 1000);
    };
    
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [deviceId, checkAndUpgrade]);

  return { checkAndUpdate: checkAndUpgrade };
};
