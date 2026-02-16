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
  const consecutiveFalseRef = useRef(0);
  const DOWNGRADE_THRESHOLD = 3; // 3회 연속 false 확인 후 다운그레이드

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
      consecutiveFalseRef.current = 0;
      console.log("[CameraDetection] ✅ Updated is_camera_connected:", isConnected);
      
      window.dispatchEvent(new CustomEvent("camera-status-changed", { 
        detail: { isConnected } 
      }));
    } catch (error) {
      console.error("[CameraDetection] ❌ Update error:", error);
    }
  }, [deviceId]);

  const checkAndUpdate = useCallback(async () => {
    const hasCamera = await checkCameraAvailability();
    
    if (hasCamera) {
      consecutiveFalseRef.current = 0;
      await updateCameraStatus(true);
    } else if (lastStatusRef.current === null) {
      await updateCameraStatus(false);
    } else if (lastStatusRef.current === true) {
      consecutiveFalseRef.current++;
      console.log(`[CameraDetection] ⚠️ Camera not found (${consecutiveFalseRef.current}/${DOWNGRADE_THRESHOLD})`);
      if (consecutiveFalseRef.current >= DOWNGRADE_THRESHOLD) {
        console.log("[CameraDetection] 🔻 Confirmed camera removed — downgrading");
        await updateCameraStatus(false);
      } else {
        // 아직 threshold 미달 → 500ms 후 재확인 (자동 연속 체크)
        setTimeout(() => checkAndUpdate(), 500);
      }
    }
  }, [checkCameraAvailability, updateCameraStatus]);

  useEffect(() => {
    if (!deviceId) return;

    console.log("[CameraDetection] 🚀 Initializing for device:", deviceId);

    // Initial check (can set true or false on first run)
    checkAndUpdate();

    // devicechange: detect both connection and removal
    const handleDeviceChange = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = setTimeout(() => {
        console.log("[CameraDetection] 🔄 Device change → checking status");
        checkAndUpdate();
      }, 1000);
    };
    
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [deviceId, checkAndUpdate]);

  return { checkAndUpdate };
};
