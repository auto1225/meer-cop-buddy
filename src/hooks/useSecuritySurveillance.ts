import { useState, useRef, useCallback, useEffect } from "react";

export interface SecurityEvent {
  type: "keyboard" | "mouse" | "usb" | "lid" | "power";
  timestamp: Date;
  photos: string[];
}

interface UseSecuritySurveillanceOptions {
  onEventDetected?: (event: SecurityEvent) => void;
  bufferDuration?: number; // seconds to keep photos
  captureInterval?: number; // ms between captures
  mouseSensitivity?: number; // minimum movement to trigger (pixels)
}

const DEFAULT_BUFFER_DURATION = 10;
const DEFAULT_CAPTURE_INTERVAL = 1000;
const DEFAULT_MOUSE_SENSITIVITY = 50; // pixels - higher = less sensitive

export function useSecuritySurveillance({
  onEventDetected,
  bufferDuration = DEFAULT_BUFFER_DURATION,
  captureInterval = DEFAULT_CAPTURE_INTERVAL,
  mouseSensitivity = DEFAULT_MOUSE_SENSITIVITY,
}: UseSecuritySurveillanceOptions = {}) {
  const [isActive, setIsActive] = useState(false);
  
  // Use refs for all mutable state to avoid re-renders
  const photoBufferRef = useRef<{ timestamp: number; dataUrl: string }[]>([]);
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const captureIntervalRef = useRef<NodeJS.Timeout | null>(null);
  const lastMousePosition = useRef<{ x: number; y: number } | null>(null);
  const isMonitoringRef = useRef(false);
  const onEventDetectedRef = useRef(onEventDetected);

  // Keep callback ref updated
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

    return () => {
      if (videoRef.current && videoRef.current.parentNode) {
        document.body.removeChild(videoRef.current);
      }
      if (canvasRef.current && canvasRef.current.parentNode) {
        document.body.removeChild(canvasRef.current);
      }
    };
  }, []);

  // Capture a single photo
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

  // Add photo to rolling buffer (using ref, no state updates)
  const addToBuffer = useCallback((dataUrl: string) => {
    const now = Date.now();
    const cutoffTime = now - bufferDuration * 1000;
    
    const filtered = photoBufferRef.current.filter(p => p.timestamp > cutoffTime);
    photoBufferRef.current = [...filtered, { timestamp: now, dataUrl }];
  }, [bufferDuration]);

  // Get current buffer photos
  const getBufferPhotos = useCallback((): string[] => {
    return photoBufferRef.current.map(p => p.dataUrl);
  }, []);

  // Trigger security event
  const triggerEvent = useCallback((type: SecurityEvent["type"]) => {
    if (!isMonitoringRef.current) return;
    
    const event: SecurityEvent = {
      type,
      timestamp: new Date(),
      photos: getBufferPhotos(),
    };
    
    onEventDetectedRef.current?.(event);
  }, [getBufferPhotos]);

  // Start camera and surveillance - stable function with no problematic deps
  const startSurveillance = useCallback(async () => {
    if (isMonitoringRef.current) return true; // Already running
    
    try {
      // Get camera stream
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      
      streamRef.current = stream;
      
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }
      
      // Start capture interval
      captureIntervalRef.current = setInterval(() => {
        const photo = capturePhoto();
        if (photo) {
          addToBuffer(photo);
        }
      }, captureInterval);
      
      // Add event listeners
      const handleKeyboard = (e: KeyboardEvent) => {
        if (isMonitoringRef.current) {
          console.log("[Surveillance] Keyboard detected:", e.key);
          triggerEvent("keyboard");
        }
      };
      
      const handleMouse = (e: MouseEvent) => {
        if (!isMonitoringRef.current) return;
        
        const currentPos = { x: e.clientX, y: e.clientY };
        
        if (lastMousePosition.current) {
          const dx = Math.abs(currentPos.x - lastMousePosition.current.x);
          const dy = Math.abs(currentPos.y - lastMousePosition.current.y);
          const distance = Math.sqrt(dx * dx + dy * dy);
          
          if (distance >= mouseSensitivity) {
            console.log("[Surveillance] Mouse movement detected:", distance.toFixed(0), "px");
            triggerEvent("mouse");
            lastMousePosition.current = currentPos;
          }
        } else {
          lastMousePosition.current = currentPos;
        }
      };

      // Power/charging status detection (Battery API)
      let lastChargingState: boolean | null = null;
      const handleChargingChange = (charging: boolean) => {
        if (!isMonitoringRef.current) return;
        
        // Only trigger if charging was disconnected (unplugged)
        if (lastChargingState === true && charging === false) {
          console.log("[Surveillance] Power unplugged detected!");
          triggerEvent("power");
        }
        lastChargingState = charging;
      };

      // Setup Battery API if available
      const setupBatteryMonitoring = async () => {
        try {
          // @ts-ignore - Battery API not in all TypeScript definitions
          if ('getBattery' in navigator) {
            // @ts-ignore
            const battery = await navigator.getBattery();
            lastChargingState = battery.charging;
            console.log("[Surveillance] Battery monitoring started. Charging:", battery.charging);
            
            battery.addEventListener('chargingchange', () => {
              handleChargingChange(battery.charging);
            });
            
            // Store for cleanup
            (window as any).__meercop_battery = battery;
          } else {
            console.log("[Surveillance] Battery API not supported");
          }
        } catch (err) {
          console.log("[Surveillance] Battery API error:", err);
        }
      };
      
      setupBatteryMonitoring();

      // Lid close detection via Page Visibility API
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
      
      // Store handlers for cleanup
      (window as any).__meercop_keyboard_handler = handleKeyboard;
      (window as any).__meercop_mouse_handler = handleMouse;
      (window as any).__meercop_visibility_handler = handleVisibilityChange;
      
      console.log("[Surveillance] Started - monitoring keyboard, mouse, power, and lid");
      isMonitoringRef.current = true;
      setIsActive(true);
      
      return true;
    } catch (error) {
      console.error("Failed to start surveillance:", error);
      return false;
    }
  }, [captureInterval, capturePhoto, addToBuffer, triggerEvent, mouseSensitivity]);

  // Stop surveillance - stable function
  const stopSurveillance = useCallback(() => {
    // Stop capture interval
    if (captureIntervalRef.current) {
      clearInterval(captureIntervalRef.current);
      captureIntervalRef.current = null;
    }
    
    // Stop camera
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
    
    // Remove event listeners
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
    
    // Clear buffer
    photoBufferRef.current = [];
    lastMousePosition.current = null;
    
    isMonitoringRef.current = false;
    setIsActive(false);
  }, []);

  // Cleanup on unmount only
  useEffect(() => {
    return () => {
      // Inline cleanup to avoid dependency issues
      if (captureIntervalRef.current) {
        clearInterval(captureIntervalRef.current);
      }
      if (streamRef.current) {
        streamRef.current.getTracks().forEach(track => track.stop());
      }
      const keyboardHandler = (window as any).__meercop_keyboard_handler;
      const mouseHandler = (window as any).__meercop_mouse_handler;
      const visibilityHandler = (window as any).__meercop_visibility_handler;
      if (keyboardHandler) window.removeEventListener("keydown", keyboardHandler);
      if (mouseHandler) window.removeEventListener("mousemove", mouseHandler);
      if (visibilityHandler) document.removeEventListener("visibilitychange", visibilityHandler);
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
