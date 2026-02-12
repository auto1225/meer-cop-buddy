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
      // videoinput 디바이스가 있는지 확인
      // 권한 미부여 시에도 kind="videoinput"은 반환됨 (label만 빈 문자열)
      const hasCamera = devices.some(device => device.kind === "videoinput");
      console.log("[CameraDetection] Camera available:", hasCamera, 
        `(${devices.filter(d => d.kind === "videoinput").length} devices)`);
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

    // Debounced device change handler - prevents rapid toggling
    // getUserMedia 호출이 devicechange를 유발할 수 있으므로 충분한 대기 시간 필요
    let debounceTimer: ReturnType<typeof setTimeout> | null = null;
    let ignoreUntil = 0; // getUserMedia로 인한 이벤트 무시 타임스탬프
    
    const handleDeviceChange = () => {
      const now = Date.now();
      // 최근 getUserMedia 호출로 인한 이벤트는 무시
      if (now < ignoreUntil) {
        console.log("[CameraDetection] 🔇 Ignoring device change (cooldown)");
        return;
      }
      
      console.log("[CameraDetection] 🔄 Device change event triggered");
      
      if (debounceTimer) clearTimeout(debounceTimer);
      
      // 3초 대기 후 체크 (디바이스 안정화 시간)
      debounceTimer = setTimeout(() => {
        checkAndUpdate();
      }, 3000);
    };
    
    // 다른 컴포넌트의 getUserMedia 호출 시 일시적으로 감지 중단
    const handleCameraAcquired = () => {
      ignoreUntil = Date.now() + 5000; // 5초간 devicechange 무시
    };
    
    window.addEventListener("camera-acquired", handleCameraAcquired);
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      if (debounceTimer) clearTimeout(debounceTimer);
      window.removeEventListener("camera-acquired", handleCameraAcquired);
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
    };
  }, [deviceId, checkAndUpdate]);

  return { checkAndUpdate };
};
