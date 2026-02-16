import { useEffect, useCallback, useRef } from "react";
import { updateDeviceViaEdge } from "@/lib/deviceApi";

interface CameraDetectionOptions {
  deviceId: string | undefined;
}

/**
 * Camera detection hook - DB only (no Presence)
 * Uses "sticky true" pattern: transitioning from true→false requires
 * multiple consecutive confirmations to prevent transient false readings.
 */
export const useCameraDetection = ({ deviceId }: CameraDetectionOptions) => {
  const lastStatusRef = useRef<boolean | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveFalseRef = useRef(0);
  const REQUIRED_FALSE_COUNT = 3; // Need 3 consecutive false readings to flip to false
  const DEBOUNCE_MS = 1500;
  const RECHECK_INTERVAL = 500;

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

  // Stable check: for true→false, require multiple consecutive false readings
  const stableCheck = useCallback(async () => {
    const result = await checkCameraAvailability();

    if (result) {
      // Camera detected → immediately trust it, reset false counter
      consecutiveFalseRef.current = 0;
      console.log("[CameraDetection] ✅ Camera detected (immediate trust)");
      await updateCameraStatus(true);
    } else {
      // Camera NOT detected
      if (lastStatusRef.current === true || lastStatusRef.current === null) {
        // Was true (or unknown) → need multiple confirmations before flipping
        consecutiveFalseRef.current++;
        console.log(`[CameraDetection] ⚠️ False reading ${consecutiveFalseRef.current}/${REQUIRED_FALSE_COUNT}`);
        
        if (consecutiveFalseRef.current >= REQUIRED_FALSE_COUNT) {
          console.log("[CameraDetection] ❌ Confirmed camera disconnected");
          consecutiveFalseRef.current = 0;
          await updateCameraStatus(false);
        }
      } else {
        // Already false → no change needed
        consecutiveFalseRef.current = 0;
      }
    }
  }, [checkCameraAvailability, updateCameraStatus]);

  const debouncedCheckAndUpdate = useCallback(() => {
    if (debounceTimerRef.current) {
      clearTimeout(debounceTimerRef.current);
    }
    consecutiveFalseRef.current = 0; // Reset on new event burst

    debounceTimerRef.current = setTimeout(async () => {
      // Do multiple checks with intervals for stability
      for (let i = 0; i < REQUIRED_FALSE_COUNT; i++) {
        await stableCheck();
        if (i < REQUIRED_FALSE_COUNT - 1) {
          await new Promise(r => setTimeout(r, RECHECK_INTERVAL));
        }
      }
    }, DEBOUNCE_MS);
  }, [stableCheck]);

  const checkAndUpdate = useCallback(async () => {
    // Initial check also uses stable pattern
    await stableCheck();
  }, [stableCheck]);

  useEffect(() => {
    if (!deviceId) return;

    console.log("[CameraDetection] 🚀 Initializing for device:", deviceId);

    // Initial check
    checkAndUpdate();

    const handleDeviceChange = () => {
      console.log("[CameraDetection] 🔄 Device change event");
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
