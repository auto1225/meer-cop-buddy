import { useEffect, useCallback, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";

interface CameraDetectionOptions {
  deviceId: string | undefined;
}

/**
 * Camera detection hook - DB only (no Presence)
 * Presence is handled by useDeviceStatus to avoid duplicate channels
 * 
 * enumerateDevices()는 브라우저 권한 획득 전에는 카메라를 감지하지 못할 수 있음.
 * getUserMedia 성공 후 재확인하거나, 외부에서 강제 설정 가능.
 */
export const useCameraDetection = ({ deviceId }: CameraDetectionOptions) => {
  const lastStatusRef = useRef<boolean | null>(null);
  // 외부(CameraModal 등)에서 명시적으로 true 설정된 경우 추적
  const manualOverrideRef = useRef<boolean>(false);

  const checkCameraAvailability = useCallback(async (): Promise<boolean> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      // enumerateDevices는 권한 없이도 deviceId=""인 항목을 반환할 수 있음
      // videoinput kind가 있으면 카메라 존재
      const videoDevices = devices.filter(device => device.kind === "videoinput");
      const hasCamera = videoDevices.length > 0;
      console.log("[CameraDetection] Camera available:", hasCamera, "devices:", videoDevices.length);
      return hasCamera;
    } catch (error) {
      console.error("[CameraDetection] Error:", error);
      return false;
    }
  }, []);

  const updateCameraStatus = useCallback(async (isConnected: boolean) => {
    // Only update if changed
    if (lastStatusRef.current === isConnected || !deviceId) return;
    
    // 외부에서 true로 설정된 상태에서 enumerateDevices가 false를 반환하면 무시
    if (manualOverrideRef.current && !isConnected) {
      console.log("[CameraDetection] ⏭️ Skipping false update (manual override active)");
      return;
    }
    
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

  // 외부에서 카메라 상태를 명시적으로 설정 (getUserMedia 성공 시)
  const forceSetConnected = useCallback(async (isConnected: boolean) => {
    console.log("[CameraDetection] 🔧 Force set camera connected:", isConnected);
    manualOverrideRef.current = isConnected;
    lastStatusRef.current = null; // reset to force update
    await updateCameraStatus(isConnected);
  }, [updateCameraStatus]);

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
      // devicechange 이벤트는 실제 하드웨어 변경이므로 override 해제
      manualOverrideRef.current = false;
      checkAndUpdate();
    };
    
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    // getUserMedia 성공 후 재확인 이벤트 리스너
    const handleCameraGranted = () => {
      console.log("[CameraDetection] 🎥 Camera permission granted, re-checking");
      manualOverrideRef.current = true;
      lastStatusRef.current = null;
      updateCameraStatus(true);
    };
    window.addEventListener("camera-permission-granted", handleCameraGranted);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      window.removeEventListener("camera-permission-granted", handleCameraGranted);
    };
  }, [deviceId, checkAndUpdate, updateCameraStatus]);

  return { checkAndUpdate, forceSetConnected };
};
