import { useEffect, useCallback, useRef } from "react";
import { updateDeviceViaEdge } from "@/lib/deviceApi";

interface CameraDetectionOptions {
  deviceId: string | undefined;
}

/** 카메라 권한 상태 확인 — granted면 enumerateDevices 결과 신뢰 가능 */
async function isCameraPermissionGranted(): Promise<boolean> {
  try {
    const result = await navigator.permissions.query({ name: "camera" as PermissionName });
    return result.state === "granted";
  } catch {
    // permissions API 미지원 브라우저 → 낙관적으로 true (enumerateDevices 결과 사용)
    return true;
  }
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
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveFalseRef = useRef(0);
  const isCheckingRef = useRef(false); // 동시 실행 방지
  const DOWNGRADE_THRESHOLD = 3;

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const checkCameraAvailability = useCallback(async (): Promise<boolean> => {
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hasVideo = devices.some(device => device.kind === "videoinput");
      console.log("[CameraDetection] enumerateDevices →", hasVideo, `(${devices.filter(d => d.kind === "videoinput").length} videoinput)`);
      return hasVideo;
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

  const checkAndUpdate = useCallback(async () => {
    // 동시 실행 방지 — 이미 체크 중이면 무시
    if (isCheckingRef.current) {
      console.log("[CameraDetection] ⏭️ Already checking, skipping");
      return;
    }
    isCheckingRef.current = true;
    clearRetryTimer();

    try {
      const hasCamera = await checkCameraAvailability();
      
      if (hasCamera) {
        consecutiveFalseRef.current = 0;
        await updateCameraStatus(true);
      } else if (lastStatusRef.current === null) {
        // 최초 실행: 권한이 granted일 때만 false 반영
        // 권한 미부여 시 enumerateDevices()가 빈 목록을 반환할 수 있으므로 무시
        const permGranted = await isCameraPermissionGranted();
        if (permGranted) {
          console.log("[CameraDetection] 🔍 Initial check: permission granted but no camera → false");
          await updateCameraStatus(false);
        } else {
          console.log("[CameraDetection] ⏳ Initial check: permission not granted, assuming camera present");
          await updateCameraStatus(true); // 낙관적 기본값: 카메라 있다고 가정
        }
      } else if (lastStatusRef.current === true) {
        consecutiveFalseRef.current++;
        console.log(`[CameraDetection] ⚠️ Camera not found (${consecutiveFalseRef.current}/${DOWNGRADE_THRESHOLD})`);
        if (consecutiveFalseRef.current >= DOWNGRADE_THRESHOLD) {
          // 다운그레이드 전 권한 재확인
          const permGranted = await isCameraPermissionGranted();
          if (permGranted) {
            console.log("[CameraDetection] 🔻 Confirmed camera removed — downgrading");
            await updateCameraStatus(false);
          } else {
            console.log("[CameraDetection] ⏳ Permission revoked, not camera removal — keeping true");
            consecutiveFalseRef.current = 0;
          }
        } else {
          isCheckingRef.current = false;
          retryTimerRef.current = setTimeout(() => checkAndUpdate(), 500);
          return;
        }
      }
      // false → false 는 아무것도 안함 (이미 해제 상태)
    } finally {
      isCheckingRef.current = false;
    }
  }, [checkCameraAvailability, updateCameraStatus, clearRetryTimer]);

  useEffect(() => {
    if (!deviceId) return;

    console.log("[CameraDetection] 🚀 Initializing for device:", deviceId);
    // 상태 초기화
    lastStatusRef.current = null;
    consecutiveFalseRef.current = 0;
    isCheckingRef.current = false;

    // Initial check
    checkAndUpdate();

    // devicechange: 진행 중인 재확인 체인 취소 후 새로 시작
    const handleDeviceChange = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      clearRetryTimer();
      consecutiveFalseRef.current = 0; // devicechange 시 카운터 리셋
      isCheckingRef.current = false; // 새 체크 허용
      
      debounceTimerRef.current = setTimeout(() => {
        console.log("[CameraDetection] 🔄 Device change → checking status");
        checkAndUpdate();
      }, 1000);
    };
    
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      clearRetryTimer();
    };
  }, [deviceId, checkAndUpdate, clearRetryTimer]);

  return { checkAndUpdate };
};
