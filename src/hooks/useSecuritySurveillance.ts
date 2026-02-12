import { useState, useRef, useCallback, useEffect } from "react";
import { MotionDetector, captureFrameData } from "@/lib/motionDetection";

export interface SecurityEvent {
  type: "keyboard" | "mouse" | "usb" | "lid" | "power" | "camera_motion";
  timestamp: Date;
  photos: string[];
  changePercent?: number;
}

interface UseSecuritySurveillanceOptions {
  onEventDetected?: (event: SecurityEvent) => void;
  bufferDuration?: number;
  captureInterval?: number;
  mouseSensitivity?: number;
  motionThreshold?: number; // 카메라 변화율(%) 임계값
  motionConsecutive?: number; // 연속 초과 프레임 수
  motionCooldown?: number; // 감지 후 쿨다운 (ms)
}

const DEFAULT_BUFFER_DURATION = 10;
const DEFAULT_CAPTURE_INTERVAL = 1000;
const DEFAULT_MOUSE_SENSITIVITY = 50;
const DEFAULT_MOTION_THRESHOLD = 15;
const DEFAULT_MOTION_CONSECUTIVE = 2;
const DEFAULT_MOTION_COOLDOWN = 1000;

export function useSecuritySurveillance({
  onEventDetected,
  bufferDuration = DEFAULT_BUFFER_DURATION,
  captureInterval = DEFAULT_CAPTURE_INTERVAL,
  mouseSensitivity = DEFAULT_MOUSE_SENSITIVITY,
  motionThreshold = DEFAULT_MOTION_THRESHOLD,
  motionConsecutive = DEFAULT_MOTION_CONSECUTIVE,
  motionCooldown = DEFAULT_MOTION_COOLDOWN,
}: UseSecuritySurveillanceOptions = {}) {
  const [isActive, setIsActive] = useState(false);

  const photoBufferRef = useRef<{ timestamp: number; dataUrl: string }[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMousePosition = useRef<{ x: number; y: number } | null>(null);
  const isMonitoringRef = useRef(false);
  const onEventDetectedRef = useRef(onEventDetected);
  const motionDetectorRef = useRef<MotionDetector | null>(null);

  useEffect(() => {
    onEventDetectedRef.current = onEventDetected;
  }, [onEventDetected]);

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

    // 모션 분석용 별도 캔버스
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

  // Capture a single photo (full resolution for buffer)
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

      // 모션 감지기 초기화
      motionDetectorRef.current = new MotionDetector(
        motionThreshold,
        motionConsecutive,
        motionCooldown
      );

      // 캡처 + 모션 분석 인터벌
      captureIntervalRef.current = setInterval(() => {
        // 1. 사진 버퍼에 추가
        const photo = capturePhoto();
        if (photo) addToBuffer(photo);

        // 2. 모션 분석
        if (
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

      // Keyboard listener
      const handleKeyboard = (e: KeyboardEvent) => {
        if (isMonitoringRef.current) {
          console.log("[Surveillance] Keyboard detected:", e.key);
          triggerEvent("keyboard");
        }
      };

      // Mouse listener
      const handleMouse = (e: MouseEvent) => {
        if (!isMonitoringRef.current) return;
        const currentPos = { x: e.clientX, y: e.clientY };

        if (lastMousePosition.current) {
          const dx = Math.abs(currentPos.x - lastMousePosition.current.x);
          const dy = Math.abs(currentPos.y - lastMousePosition.current.y);
          const distance = Math.sqrt(dx * dx + dy * dy);

          if (distance >= mouseSensitivity) {
            console.log(
              "[Surveillance] Mouse movement detected:",
              distance.toFixed(0),
              "px"
            );
            triggerEvent("mouse");
            lastMousePosition.current = currentPos;
          }
        } else {
          lastMousePosition.current = currentPos;
        }
      };

      // Power detection
      let lastChargingState: boolean | null = null;
      const handleChargingChange = (charging: boolean) => {
        if (!isMonitoringRef.current) return;
        if (lastChargingState === true && charging === false) {
          console.log("[Surveillance] Power unplugged detected!");
          triggerEvent("power");
        }
        lastChargingState = charging;
      };

      const setupBatteryMonitoring = async () => {
        try {
          // @ts-ignore
          if ("getBattery" in navigator) {
            // @ts-ignore
            const battery = await navigator.getBattery();
            lastChargingState = battery.charging;
            battery.addEventListener("chargingchange", () => {
              handleChargingChange(battery.charging);
            });
            (window as any).__meercop_battery = battery;
          }
        } catch (err) {
          console.log("[Surveillance] Battery API error:", err);
        }
      };

      setupBatteryMonitoring();

      // Lid close detection
      const handleVisibilityChange = () => {
        if (!isMonitoringRef.current) return;
        if (document.hidden) {
          console.log("[Surveillance] Lid closed / screen hidden detected!");
          triggerEvent("lid");
        }
      };

      window.addEventListener("keydown", handleKeyboard);
      window.addEventListener("mousemove", handleMouse);
      document.addEventListener("visibilitychange", handleVisibilityChange);

      (window as any).__meercop_keyboard_handler = handleKeyboard;
      (window as any).__meercop_mouse_handler = handleMouse;
      (window as any).__meercop_visibility_handler = handleVisibilityChange;

      console.log(
        "[Surveillance] Started - monitoring keyboard, mouse, power, lid, camera motion"
      );
      isMonitoringRef.current = true;
      setIsActive(true);

      return true;
    } catch (error) {
      console.error("Failed to start surveillance:", error);
      return false;
    }
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

    // Reset motion detector
    motionDetectorRef.current?.reset();
    motionDetectorRef.current = null;

    const keyboardHandler = (window as any).__meercop_keyboard_handler;
    const mouseHandler = (window as any).__meercop_mouse_handler;
    const visibilityHandler = (window as any).__meercop_visibility_handler;

    if (keyboardHandler) {
      window.removeEventListener("keydown", keyboardHandler);
      delete (window as any).__meercop_keyboard_handler;
    }
    if (mouseHandler) {
      window.removeEventListener("mousemove", mouseHandler);
      delete (window as any).__meercop_mouse_handler;
    }
    if (visibilityHandler) {
      document.removeEventListener("visibilitychange", visibilityHandler);
      delete (window as any).__meercop_visibility_handler;
    }

    photoBufferRef.current = [];
    lastMousePosition.current = null;

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
      const kh = (window as any).__meercop_keyboard_handler;
      const mh = (window as any).__meercop_mouse_handler;
      const vh = (window as any).__meercop_visibility_handler;
      if (kh) window.removeEventListener("keydown", kh);
      if (mh) window.removeEventListener("mousemove", mh);
      if (vh) document.removeEventListener("visibilitychange", vh);
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
