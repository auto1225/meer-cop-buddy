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
 * Downgrade (true→false) requires consecutive confirmation to prevent
 * false negatives from browser inconsistencies during stream acquisition/release.
 */
export const useCameraDetection = ({ deviceId }: CameraDetectionOptions) => {
  const lastStatusRef = useRef<boolean | null>(null);
  const debounceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const consecutiveFalseRef = useRef(0);
  const checkIdRef = useRef(0); // 각 체크 사이클의 고유 ID
  const isMobile = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
  // 모바일은 enumerateDevices가 불안정하므로 더 높은 threshold 사용
  const DOWNGRADE_THRESHOLD = isMobile ? 6 : 3;
  const RETRY_INTERVAL = isMobile ? 1000 : 500;
  const DEVICECHANGE_DEBOUNCE = isMobile ? 2000 : 1000;

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  const checkCameraAvailability = useCallback(async (): Promise<boolean> => {
    try {
      // 브로드캐스터가 활성 스트림을 보유 중이면 하드웨어 연결로 강제 판단
      if ((window as any).__meercopCameraStreamActive) {
        console.log("[CameraDetection] 📹 Broadcaster stream active flag detected — camera is connected");
        return true;
      }

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
    if (lastStatusRef.current === isConnected) return;
    
    // 로컬 상태를 먼저 반영 (DB 실패와 무관하게 UI 업데이트)
    lastStatusRef.current = isConnected;
    console.log("[CameraDetection] ✅ Camera status:", isConnected);
    
    window.dispatchEvent(new CustomEvent("camera-status-changed", { 
      detail: { isConnected } 
    }));

    // DB 업데이트는 deviceId가 있을 때만 시도
    if (deviceId) {
      try {
        await updateDeviceViaEdge(deviceId, { 
          is_camera_connected: isConnected,
          updated_at: new Date().toISOString()
        });
      } catch (error) {
        console.error("[CameraDetection] ⚠️ DB update failed (local status OK):", error);
      }
    }
  }, [deviceId]);

  // checkAndUpdate를 ref에 저장하여 retry 시 stale closure 방지
  const checkAndUpdateRef = useRef<() => Promise<void>>();

  const checkAndUpdate = useCallback(async () => {
    // 고유 ID를 할당하여 이후 취소 판별에 사용
    const myId = ++checkIdRef.current;
    clearRetryTimer();

    try {
      const hasCamera = await checkCameraAvailability();

      // 체크 도중 새로운 체크가 시작되었으면 결과 무시
      if (myId !== checkIdRef.current) {
        console.log("[CameraDetection] ⏭️ Stale check (id:", myId, "), ignoring");
        return;
      }
      
      if (hasCamera) {
        consecutiveFalseRef.current = 0;
        await updateCameraStatus(true);
      } else if (lastStatusRef.current === null) {
        // 최초 실행: 권한이 granted일 때만 false 반영
        const permGranted = await isCameraPermissionGranted();
        if (myId !== checkIdRef.current) return;
        
        if (permGranted) {
          console.log("[CameraDetection] 🔍 Initial check: permission granted but no camera → false");
          await updateCameraStatus(false);
        } else {
          console.log("[CameraDetection] ⏳ Initial check: permission not granted, assuming camera present");
          await updateCameraStatus(true);
        }
      } else if (lastStatusRef.current === true) {
        consecutiveFalseRef.current++;
        console.log(`[CameraDetection] ⚠️ Camera not found (${consecutiveFalseRef.current}/${DOWNGRADE_THRESHOLD})`);
        if (consecutiveFalseRef.current >= DOWNGRADE_THRESHOLD) {
          const permGranted = await isCameraPermissionGranted();
          if (myId !== checkIdRef.current) return;
          
          if (permGranted) {
            console.log("[CameraDetection] 🔻 Confirmed camera removed — downgrading");
            await updateCameraStatus(false);
          } else {
            console.log("[CameraDetection] ⏳ Permission revoked, not camera removal — keeping true");
            consecutiveFalseRef.current = 0;
          }
        } else {
          // ref를 통해 최신 함수를 호출하여 stale closure 방지
          retryTimerRef.current = setTimeout(() => {
            checkAndUpdateRef.current?.();
          }, RETRY_INTERVAL);
        }
      }
      // false → false 는 아무것도 안함
    } catch (error) {
      console.error("[CameraDetection] ❌ Check error:", error);
    }
  }, [checkCameraAvailability, updateCameraStatus, clearRetryTimer]);

  // ref를 항상 최신 함수로 동기화
  useEffect(() => {
    checkAndUpdateRef.current = checkAndUpdate;
  }, [checkAndUpdate]);

  useEffect(() => {
    // deviceId 없이도 로컬 카메라 감지는 실행
    console.log("[CameraDetection] 🚀 Initializing (device:", deviceId || "none", ")");
    lastStatusRef.current = null;
    consecutiveFalseRef.current = 0;
    checkIdRef.current = 0;

    // Initial check
    checkAndUpdate();

    // devicechange: 디바운스만 적용, 카운터는 리셋하지 않음
    // (스퓨리어스 이벤트가 다운그레이드 검증을 방해하는 것을 방지)
    const handleDeviceChange = () => {
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      clearRetryTimer();
      // checkIdRef 증가로 진행 중인 비동기 체크 결과를 자연스럽게 무효화
      checkIdRef.current++;
      
      debounceTimerRef.current = setTimeout(() => {
        console.log("[CameraDetection] 🔄 Device change → checking status");
        checkAndUpdateRef.current?.();
      }, DEVICECHANGE_DEBOUNCE);
    };
    
    navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);

    return () => {
      navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      clearRetryTimer();
      checkIdRef.current++; // cleanup 시 진행 중인 체크 무효화
    };
  }, [deviceId, checkAndUpdate, clearRetryTimer]);

  return { checkAndUpdate };
};
