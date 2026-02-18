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

  const photoBufferRef = useRef<{ timestamp: number; dataUrl: string }[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMousePosition = useRef<{ x: number; y: number } | null>(null);
  const mouseMovementAccum = useRef<{ distance: number; startTime: number }>({ distance: 0, startTime: 0 });
  const isMonitoringRef = useRef(false);
  const onEventDetectedRef = useRef(onEventDetected);
  const motionDetectorRef = useRef<MotionDetector | null>(null);
  const sensorTogglesRef = useRef(sensorToggles);

  // L-5: 전역 변수 대신 useRef로 이벤트 핸들러 관리
  const keyboardHandlerRef = useRef<((e: KeyboardEvent) => void) | null>(null);
  const mouseHandlerRef = useRef<((e: MouseEvent) => void) | null>(null);
  const visibilityHandlerRef = useRef<(() => void) | null>(null);
  // L-4: Battery API 핸들러를 명명된 함수로 관리
  const batteryRef = useRef<any>(null);
  const batteryHandlerRef = useRef<(() => void) | null>(null);

  useEffect(() => {
    onEventDetectedRef.current = onEventDetected;
  }, [onEventDetected]);

  useEffect(() => {
    sensorTogglesRef.current = sensorToggles;
  }, [sensorToggles]);

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
        (el) => {
          if (el?.parentNode) document.body.removeChild(el);
        }
      );
    };
  }, []);

  const capturePhoto = useCallback((): string | null => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas || video.videoWidth === 0) return null;

    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.drawImage(video, 0, 0);
    return canvas.toDataURL("image/jpeg", 0.7);
  }, []);

  const addToBuffer = useCallback(
    (dataUrl: string) => {
      const now = Date.now();
      const cutoffTime = now - bufferDuration * 1000;
      const filtered = photoBufferRef.current.filter(
        (p) => p.timestamp > cutoffTime
      );
      photoBufferRef.current = [...filtered, { timestamp: now, dataUrl }];
    },
    [bufferDuration]
  );

  const getBufferPhotos = useCallback((): string[] => {
    return photoBufferRef.current.map((p) => p.dataUrl);
  }, []);

  const triggerEvent = useCallback(
    (type: SecurityEvent["type"], changePercent?: number) => {
      if (!isMonitoringRef.current) return;

      const event: SecurityEvent = {
        type,
        timestamp: new Date(),
        photos: getBufferPhotos(),
        changePercent,
      };

      onEventDetectedRef.current?.(event);
    },
    [getBufferPhotos]
  );

  const startSurveillance = useCallback(async () => {
    if (isMonitoringRef.current) return true;

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

      motionDetectorRef.current = new MotionDetector(
        motionThreshold,
        motionConsecutive,
        motionCooldown
      );

      captureIntervalRef.current = setInterval(() => {
        const photo = capturePhoto();
        if (photo) addToBuffer(photo);

        if (
          sensorTogglesRef.current.cameraMotion &&
          videoRef.current &&
          analysisCanvasRef.current &&
          motionDetectorRef.current &&
          isMonitoringRef.current
        ) {
          const frameData = captureFrameData(
            videoRef.current,
            analysisCanvasRef.current
          );
          if (frameData) {
            const result = motionDetectorRef.current.analyze(frameData);
            if (result.detected) {
              console.log(
                `[Surveillance] 카메라 모션 감지! 변화율: ${result.changePercent.toFixed(1)}%`
              );
              triggerEvent("camera_motion", result.changePercent);
            }
          }
        }
      }, captureInterval);
    } catch (error) {
      console.warn("[Surveillance] Camera unavailable — non-camera sensors will still work:", error);
    }

    // === 센서 리스너 등록 (useRef로 관리 — 전역 오염 제거) ===

    // Keyboard listener
    const handleKeyboard = (e: KeyboardEvent) => {
      if (isMonitoringRef.current && sensorTogglesRef.current.keyboard) {
        console.log("[Surveillance] Keyboard detected:", e.key);
        triggerEvent("keyboard");
      }
    };

    // Mouse listener
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

        if (accum.distance >= mouseSensitivity) {
          console.log(
            "[Surveillance] Mouse movement detected:",
            accum.distance.toFixed(0),
            "px in 200ms (threshold:", mouseSensitivity, "px)"
          );
          triggerEvent("mouse");
          accum.distance = 0;
          accum.startTime = now;
        }
      }

      lastMousePosition.current = currentPos;
    };

    // Power detection — L-4: 명명된 핸들러 + cleanup
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
        if ("getBattery" in navigator) {
          const battery = await (navigator as any).getBattery();
          lastChargingState = battery.charging;
          
          // 명명된 핸들러 생성 (cleanup 가능)
          const handler = () => handleChargingChange(battery.charging);
          battery.addEventListener("chargingchange", handler);
          
          // ref에 저장하여 cleanup 시 사용
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

    // ref에 저장 (cleanup 시 사용 — 전역 오염 제거)
    keyboardHandlerRef.current = handleKeyboard;
    mouseHandlerRef.current = handleMouse;
    visibilityHandlerRef.current = handleVisibilityChange;

    console.log(
      `[Surveillance] Started - camera: ${cameraAvailable ? "ON" : "OFF"}, monitoring keyboard, mouse, power, lid`
    );
    isMonitoringRef.current = true;
    setIsActive(true);

    return true;
  }, [
    captureInterval,
    capturePhoto,
    addToBuffer,
    triggerEvent,
    mouseSensitivity,
    motionThreshold,
    motionConsecutive,
    motionCooldown,
  ]);

  const stopSurveillance = useCallback(() => {
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    motionDetectorRef.current?.reset();
    motionDetectorRef.current = null;

    // L-4: Battery 리스너 정리
    if (batteryRef.current && batteryHandlerRef.current) {
      batteryRef.current.removeEventListener("chargingchange", batteryHandlerRef.current);
      batteryRef.current = null;
      batteryHandlerRef.current = null;
    }

    // L-5: ref 기반 리스너 정리 (전역 오염 없음)
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

    isMonitoringRef.current = false;
    setIsActive(false);
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (captureIntervalRef.current) clearInterval(captureIntervalRef.current);
      if (streamRef.current)
        streamRef.current.getTracks().forEach((track) => track.stop());
      motionDetectorRef.current?.reset();
      
      // L-4: Battery cleanup on unmount
      if (batteryRef.current && batteryHandlerRef.current) {
        batteryRef.current.removeEventListener("chargingchange", batteryHandlerRef.current);
      }
      
      // L-5: ref 기반 cleanup on unmount
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
