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
      
      if (hasCamera) {
        console.log("[CameraDetection] Camera available: true (enumerateDevices)");
        return true;
      }

      // enumerateDevices가 빈 결과를 반환할 수 있음 (권한 미부여 시)
      // 짧은 getUserMedia 프로브로 실제 카메라 존재 확인
      try {
        const probeStream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
        probeStream.getTracks().forEach(t => t.stop()); // 즉시 해제
        console.log("[CameraDetection] Camera available: true (probe)");
        return true;
      } catch {
        // getUserMedia 실패 = 카메라 없거나 권한 거부
        console.log("[CameraDetection] Camera available: false");
        return false;
      }
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

    // Debounced device change handler - prevents rapid toggling
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    
    const handleDeviceChange = () => {
      console.log("[CameraDetection] 🔄 Device change event triggered");
      
      // Clear previous timer
      if (debounceTimer) clearTimeout(debounceTimer);
      
      // Wait 1.5s for device enumeration to stabilize
      debounceTimer = setTimeout(() => {
        checkAndUpdate();
      }, 1500);
    };
    
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [deviceId, checkAndUpdate]);

  return { checkAndUpdate };
};
