import { useState, useRef, useCallback, useEffect } from "react";
import { MotionDetector, captureFrameData } from "@/lib/motionDetection";
import {
  DEFAULT_BUFFER_DURATION,
  DEFAULT_CAPTURE_INTERVAL_MS,
  DEFAULT_MOUSE_SENSITIVITY_PX,
  DEFAULT_MOTION_THRESHOLD,
  DEFAULT_MOTION_CONSECUTIVE,
  DEFAULT_MOTION_COOLDOWN_MS,
} from "@/lib/constants";
import {
  startWorkerInterval,
  stopWorkerInterval,
} from "@/lib/workerTimer";

// ── 워치독 / 헬스체크 상수 ──
const WATCHDOG_INTERVAL_MS = 5_000;      // 워치독 점검 간격
const WATCHDOG_TOLERANCE_MS = 10_000;    // 캡처 루프 미응답 허용 시간
const TRACK_HEALTH_INTERVAL_MS = 3_000;  // 카메라 트랙 헬스체크 간격
const MAX_CAMERA_RETRIES = 10;           // 카메라 재획득 최대 시도
const CAMERA_RETRY_BASE_MS = 1_000;      // 재시도 기본 대기 (지수 백오프)
const HEARTBEAT_LOG_INTERVAL_MS = 60_000; // 하트비트 로그 간격

export interface SecurityEvent {
  type: "keyboard" | "mouse" | "usb" | "lid" | "power" | "camera_motion";
  timestamp: Date;
  photos: string[];
  changePercent?: number;
}

export interface SensorToggles {
  cameraMotion: boolean;
  lid: boolean;
  keyboard: boolean;
  mouse: boolean;
  power: boolean;
  microphone: boolean;
  usb: boolean;
}

const DEFAULT_SENSOR_TOGGLES: SensorToggles = {
  cameraMotion: true,
  lid: true,
  keyboard: true,
  mouse: true,
  power: true,
  microphone: false,
  usb: false,
};

interface UseSecuritySurveillanceOptions {
  onEventDetected?: (event: SecurityEvent) => void;
  bufferDuration?: number;
  captureInterval?: number;
  mouseSensitivity?: number;
  motionThreshold?: number;
  motionConsecutive?: number;
  motionCooldown?: number;
  sensorToggles?: SensorToggles;
}

export function useSecuritySurveillance({
  onEventDetected,
  bufferDuration = DEFAULT_BUFFER_DURATION,
  captureInterval = DEFAULT_CAPTURE_INTERVAL_MS,
  mouseSensitivity = DEFAULT_MOUSE_SENSITIVITY_PX,
  motionThreshold = DEFAULT_MOTION_THRESHOLD,
  motionConsecutive = DEFAULT_MOTION_CONSECUTIVE,
  motionCooldown = DEFAULT_MOTION_COOLDOWN_MS,
  sensorToggles = DEFAULT_SENSOR_TOGGLES,
}: UseSecuritySurveillanceOptions = {}) {
  const [isActive, setIsActive] = useState(false);

  // Blob 기반 사진 버퍼
  const photoBufferRef = useRef<{ timestamp: number; blob: Blob }[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const lastMousePosition = useRef<{ x: number; y: number } | null>(null);
  const mouseMovementAccum = useRef<{ distance: number; startTime: number }>({ distance: 0, startTime: 0 });
  const isMonitoringRef = useRef(false);
  const onEventDetectedRef = useRef(onEventDetected);
  const motionDetectorRef = useRef<MotionDetector | null>(null);
  const sensorTogglesRef = useRef(sensorToggles);

  // 설정값 refs
  const captureIntervalValRef = useRef(captureInterval);
  const mouseSensitivityRef = useRef(mouseSensitivity);
  const motionThresholdRef = useRef(motionThreshold);
  const motionConsecutiveRef = useRef(motionConsecutive);
  const motionCooldownRef = useRef(motionCooldown);

  // 이벤트 핸들러 refs
  const keyboardHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const mouseHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  const batteryRef = useRef<any>(null);
  const batteryHandlerRef = useRef<(() => void) | null>(null);

  // ── 워치독 & 헬스체크 refs ──
  const lastCaptureTickRef = useRef<number>(0);
  const cameraRetryCountRef = useRef(0);
  const lastHeartbeatLogRef = useRef<number>(0);
  const isStartingRef = useRef(false); // 동시 호출 방지

  // Sync refs
  useEffect(() => { onEventDetectedRef.current = onEventDetected; }, [onEventDetected]);
  useEffect(() => { sensorTogglesRef.current = sensorToggles; }, [sensorToggles]);
  useEffect(() => { captureIntervalValRef.current = captureInterval; }, [captureInterval]);
  useEffect(() => { mouseSensitivityRef.current = mouseSensitivity; }, [mouseSensitivity]);
  useEffect(() => { motionThresholdRef.current = motionThreshold; }, [motionThreshold]);
  useEffect(() => { motionConsecutiveRef.current = motionConsecutive; }, [motionConsecutive]);
  useEffect(() => { motionCooldownRef.current = motionCooldown; }, [motionCooldown]);

  // Initialize hidden video and canvas elements once
  useEffect(() => {
    const video = document.createElement("video");
    video.autoplay = true;
    video.playsInline = true;
    video.muted = true;
    video.style.display = "none";
    document.body.appendChild(video);
    videoRef.current = video;

    const canvas = document.createElement("canvas");
    canvas.style.display = "none";
    document.body.appendChild(canvas);
    canvasRef.current = canvas;

    const analysisCanvas = document.createElement("canvas");
    analysisCanvas.style.display = "none";
    document.body.appendChild(analysisCanvas);
    analysisCanvasRef.current = analysisCanvas;

    return () => {
      [videoRef.current, canvasRef.current, analysisCanvasRef.current].forEach(
        (el) => { if (el?.parentNode) document.body.removeChild(el); }
      );
    };
  }, []);

  // Blob 캡처
  const capturePhotoAsBlob = useCallback((): Promise<Blob | null> => {
    return new Promise((resolve) => {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (!video || !canvas || video.videoWidth === 0) {
        resolve(null);
        return;
      }
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) { resolve(null); return; }
      ctx.drawImage(video, 0, 0);
      canvas.toBlob((blob) => resolve(blob), "image/jpeg", 0.7);
    });
  }, []);

  const addToBuffer = useCallback((blob: Blob) => {
    const now = Date.now();
    const cutoffTime = now - bufferDuration * 1000;
    const filtered = photoBufferRef.current.filter((p) => p.timestamp > cutoffTime);
    photoBufferRef.current = [...filtered, { timestamp: now, blob }];
  }, [bufferDuration]);

  const blobToDataUrl = (blob: Blob): Promise<string> => {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onloadend = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(blob);
    });
  };

  const getBufferPhotos = useCallback(async (): Promise<string[]> => {
    const blobs = photoBufferRef.current.map((p) => p.blob);
    return Promise.all(blobs.map(blobToDataUrl));
  }, []);

  // ── 센서별 쿨다운 (동일 센서의 반복 트리거 방지) ──
  const SENSOR_COOLDOWN_MS = 10_000; // 10초
  const lastSensorTriggerRef = useRef<Record<string, number>>({});

  const triggerEvent = useCallback(
    async (type: SecurityEvent["type"], changePercent?: number) => {
      if (!isMonitoringRef.current) return;

      // 동일 센서 쿨다운 체크
      const now = Date.now();
      const lastTrigger = lastSensorTriggerRef.current[type] || 0;
      if (now - lastTrigger < SENSOR_COOLDOWN_MS) {
        console.log(`[Surveillance] ⏳ ${type} cooldown — skipping (${Math.ceil((SENSOR_COOLDOWN_MS - (now - lastTrigger)) / 1000)}s left)`);
        return;
      }
      lastSensorTriggerRef.current[type] = now;

      const photos = await getBufferPhotos();
      const event: SecurityEvent = { type, timestamp: new Date(), photos, changePercent };
      onEventDetectedRef.current?.(event);
    },
    [getBufferPhotos]
  );

  // ── 카메라 재획득 (지수 백오프) ──
  const reacquireCamera = useCallback(async (): Promise<boolean> => {
    const retryCount = cameraRetryCountRef.current;
    if (retryCount >= MAX_CAMERA_RETRIES) {
      console.error(`[Surveillance] ❌ Camera re-acquire failed after ${MAX_CAMERA_RETRIES} retries`);
      return false;
    }

    const delay = CAMERA_RETRY_BASE_MS * Math.pow(2, retryCount);
    console.log(`[Surveillance] 🔄 Camera re-acquire attempt ${retryCount + 1}/${MAX_CAMERA_RETRIES} (delay: ${delay}ms)`);

    await new Promise((r) => setTimeout(r, delay));

    try {
      // 기존 스트림 정리
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((t) => t.stop());
        streamRef.current = null;
      }

      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;

      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      cameraRetryCountRef.current = 0;
      console.log("[Surveillance] ✅ Camera re-acquired successfully");
      return true;
    } catch (err) {
      cameraRetryCountRef.current = retryCount + 1;
      console.warn(`[Surveillance] Camera re-acquire attempt ${retryCount + 1} failed:`, err);
      return false;
    }
  }, []);

  // ── 캡처 루프 tick (Web Worker에서 호출) ──
  const captureLoopTick = useCallback(async () => {
    if (!isMonitoringRef.current) return;

    lastCaptureTickRef.current = Date.now();

    const photo = await capturePhotoAsBlob();
    if (photo) addToBuffer(photo);

    if (
      sensorTogglesRef.current.cameraMotion &&
      videoRef.current &&
      analysisCanvasRef.current &&
      motionDetectorRef.current &&
      isMonitoringRef.current
    ) {
      const frameData = captureFrameData(videoRef.current, analysisCanvasRef.current);
      if (frameData) {
        const result = motionDetectorRef.current.analyze(frameData);
        if (result.detected) {
          console.log(`[Surveillance] 카메라 모션 감지! 변화율: ${result.changePercent.toFixed(1)}%`);
          triggerEvent("camera_motion", result.changePercent);
        }
      }
    }

    // ── 하트비트 로그 (매 60초) ──
    const now = Date.now();
    if (now - lastHeartbeatLogRef.current >= HEARTBEAT_LOG_INTERVAL_MS) {
      lastHeartbeatLogRef.current = now;
      const bufferSize = photoBufferRef.current.length;
      const trackState = streamRef.current?.getVideoTracks()[0]?.readyState ?? "none";
      console.log(
        `[Surveillance] 💓 Heartbeat — buffer: ${bufferSize}, camera: ${trackState}, ` +
        `uptime: ${Math.floor((now - lastCaptureTickRef.current) / 1000)}s since last tick`
      );
    }
  }, [capturePhotoAsBlob, addToBuffer, triggerEvent]);

  // ── 워치독: 캡처 루프가 살아있는지 점검 ──
  const watchdogTick = useCallback(async () => {
    if (!isMonitoringRef.current) return;

    const now = Date.now();
    const lastTick = lastCaptureTickRef.current;

    // 캡처 루프가 WATCHDOG_TOLERANCE 이상 멈췄으면 재시작
    if (lastTick > 0 && now - lastTick > WATCHDOG_TOLERANCE_MS) {
      console.warn(
        `[Surveillance] ⚠️ Watchdog: Capture loop stalled for ${Math.floor((now - lastTick) / 1000)}s — restarting`
      );
      // 캡처 루프만 재시작 (센서 리스너는 유지)
      stopWorkerInterval("surveillance-capture");
      startWorkerInterval("surveillance-capture", captureLoopTick, captureIntervalValRef.current);
      console.log("[Surveillance] ✅ Capture loop restarted by watchdog");
    }
  }, [captureLoopTick]);

  // ── 카메라 트랙 헬스체크 ──
  const trackHealthTick = useCallback(async () => {
    if (!isMonitoringRef.current) return;

    const track = streamRef.current?.getVideoTracks()[0];
    if (!track) return; // 카메라 없이 실행 중이면 무시

    if (track.readyState === "ended" || track.muted) {
      console.warn(`[Surveillance] ⚠️ Camera track unhealthy: readyState=${track.readyState}, muted=${track.muted}`);
      const success = await reacquireCamera();
      if (success) {
        // MotionDetector 리셋 (새 스트림이므로 이전 프레임 무의미)
        motionDetectorRef.current?.reset();
      }
    } else {
      // 카메라 정상 → retry 카운터 리셋
      cameraRetryCountRef.current = 0;
    }
  }, [reacquireCamera]);

  const startSurveillance = useCallback(async () => {
    if (isMonitoringRef.current || isStartingRef.current) return true;
    isStartingRef.current = true;

    // ✅ 리스너 등록 전에 플래그 설정 — 핸들러가 즉시 동작하도록
    isMonitoringRef.current = true;

    let cameraAvailable = false;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      cameraAvailable = true;
      cameraRetryCountRef.current = 0;

      motionDetectorRef.current = new MotionDetector(
        motionThresholdRef.current,
        motionConsecutiveRef.current,
        motionCooldownRef.current
      );
    } catch (error) {
      console.warn("[Surveillance] Camera unavailable — non-camera sensors will still work:", error);
    }

    // ── Web Worker 기반 타이머 시작 ──
    lastCaptureTickRef.current = Date.now();
    lastHeartbeatLogRef.current = Date.now();

    // 1) 캡처 루프 (백그라운드 탭에서도 정확)
    startWorkerInterval("surveillance-capture", captureLoopTick, captureIntervalValRef.current);

    // 2) 워치독 (캡처 루프 생존 점검)
    startWorkerInterval("surveillance-watchdog", watchdogTick, WATCHDOG_INTERVAL_MS);

    // 3) 카메라 트랙 헬스체크
    if (cameraAvailable) {
      startWorkerInterval("surveillance-track-health", trackHealthTick, TRACK_HEALTH_INTERVAL_MS);
    }

    // === 센서 리스너 등록 ===

    // Keyboard
    const handleKeyboard = (e: KeyboardEvent) => {
      if (isMonitoringRef.current && sensorTogglesRef.current.keyboard) {
        console.log("[Surveillance] Keyboard detected:", e.key);
        triggerEvent("keyboard");
      }
    };

    // Mouse
    const MOUSE_TIME_WINDOW = 200;
    const handleMouse = (e: MouseEvent) => {
      if (!isMonitoringRef.current || !sensorTogglesRef.current.mouse) return;
      const currentPos = { x: e.clientX, y: e.clientY };
      const now = Date.now();

      if (lastMousePosition.current) {
        const dx = currentPos.x - lastMousePosition.current.x;
        const dy = currentPos.y - lastMousePosition.current.y;
        const segmentDist = Math.sqrt(dx * dx + dy * dy);

        const accum = mouseMovementAccum.current;
        if (now - accum.startTime > MOUSE_TIME_WINDOW) {
          accum.distance = segmentDist;
          accum.startTime = now;
        } else {
          accum.distance += segmentDist;
        }

        if (accum.distance >= mouseSensitivityRef.current) {
          console.log("[Surveillance] Mouse movement detected:", accum.distance.toFixed(0), "px");
          triggerEvent("mouse");
          accum.distance = 0;
          accum.startTime = now;
        }
      }
      lastMousePosition.current = currentPos;
    };

    // Power detection
    let lastChargingState: boolean | null = null;
    const handleChargingChange = (charging: boolean) => {
      if (!isMonitoringRef.current || !sensorTogglesRef.current.power) return;
      if (lastChargingState === true && charging === false) {
        console.log("[Surveillance] Power unplugged detected!");
        triggerEvent("power");
      }
      lastChargingState = charging;
    };

    const setupBatteryMonitoring = async () => {
      try {
        if (navigator.getBattery) {
          const battery = await navigator.getBattery();
          lastChargingState = battery.charging;
          const handler = () => handleChargingChange(battery.charging);
          battery.addEventListener("chargingchange", handler);
          batteryRef.current = battery;
          batteryHandlerRef.current = handler;
        }
      } catch (err) {
        console.warn("[Surveillance] Battery API unavailable:", err);
      }
    };
    setupBatteryMonitoring();

    // Lid close detection
    const handleVisibilityChange = () => {
      if (!isMonitoringRef.current || !sensorTogglesRef.current.lid) return;
      if (document.hidden) {
        console.log("[Surveillance] Lid closed / screen hidden detected!");
        triggerEvent("lid");
      }
    };

    // 이벤트 리스너 등록
    window.addEventListener("keydown", handleKeyboard);
    window.addEventListener("mousemove", handleMouse);
    document.addEventListener("visibilitychange", handleVisibilityChange);

    keyboardHandlerRef.current = handleKeyboard;
    mouseHandlerRef.current = handleMouse;
    visibilityHandlerRef.current = handleVisibilityChange;

    console.log(
      `[Surveillance] ✅ Started — camera: ${cameraAvailable ? "ON" : "OFF"}, ` +
      `Worker timers: capture(${captureIntervalValRef.current}ms) + watchdog(${WATCHDOG_INTERVAL_MS}ms) + ` +
      `trackHealth(${cameraAvailable ? TRACK_HEALTH_INTERVAL_MS + "ms" : "OFF"})`
    );
    isStartingRef.current = false;
    setIsActive(true);
    return true;
  }, [captureLoopTick, watchdogTick, trackHealthTick, triggerEvent]);

  const stopSurveillance = useCallback(() => {
    // Worker 타이머 모두 중지
    stopWorkerInterval("surveillance-capture");
    stopWorkerInterval("surveillance-watchdog");
    stopWorkerInterval("surveillance-track-health");

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    motionDetectorRef.current?.reset();
    motionDetectorRef.current = null;

    // Battery 리스너 정리
    if (batteryRef.current && batteryHandlerRef.current) {
      batteryRef.current.removeEventListener("chargingchange", batteryHandlerRef.current);
      batteryRef.current = null;
      batteryHandlerRef.current = null;
    }

    // 이벤트 리스너 정리
    if (keyboardHandlerRef.current) {
      window.removeEventListener("keydown", keyboardHandlerRef.current);
      keyboardHandlerRef.current = null;
    }
    if (mouseHandlerRef.current) {
      window.removeEventListener("mousemove", mouseHandlerRef.current);
      mouseHandlerRef.current = null;
    }
    if (visibilityHandlerRef.current) {
      document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
      visibilityHandlerRef.current = null;
    }

    photoBufferRef.current = [];
    lastMousePosition.current = null;
    mouseMovementAccum.current = { distance: 0, startTime: 0 };
    cameraRetryCountRef.current = 0;

    isMonitoringRef.current = false;
    isStartingRef.current = false;
    setIsActive(false);
    console.log("[Surveillance] 🛑 Stopped — all worker timers & listeners cleaned up");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      stopWorkerInterval("surveillance-capture");
      stopWorkerInterval("surveillance-watchdog");
      stopWorkerInterval("surveillance-track-health");
      if (streamRef.current) streamRef.current.getTracks().forEach((t) => t.stop());
      motionDetectorRef.current?.reset();
      if (batteryRef.current && batteryHandlerRef.current) {
        batteryRef.current.removeEventListener("chargingchange", batteryHandlerRef.current);
      }
      if (keyboardHandlerRef.current) window.removeEventListener("keydown", keyboardHandlerRef.current);
      if (mouseHandlerRef.current) window.removeEventListener("mousemove", mouseHandlerRef.current);
      if (visibilityHandlerRef.current) document.removeEventListener("visibilitychange", visibilityHandlerRef.current);
    };
  }, []);

  return {
    isActive,
    photoBuffer: photoBufferRef.current,
    startSurveillance,
    stopSurveillance,
    getBufferPhotos,
  };
}
