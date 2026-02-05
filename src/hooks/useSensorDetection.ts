import { useState, useEffect, useCallback } from "react";

export interface SensorSettings {
  deviceType: "laptop" | "desktop";
  // Laptop sensors
  lidClosed: boolean;
  // Common sensors
  camera: boolean;
  keyboard: boolean;
  mouse: boolean;
  mouseType: "wired" | "wireless";
  usb: boolean;
  // Desktop only
  microphone: boolean;
  keyboardType: "wired" | "wireless";
}

export interface SensorStatus {
  keyboardActive: boolean;
  mouseActive: boolean;
  lastKeyboardActivity: Date | null;
  lastMouseActivity: Date | null;
}

const DEFAULT_SENSOR_SETTINGS: SensorSettings = {
  deviceType: "laptop",
  lidClosed: true,
  camera: true,
  keyboard: true,
  mouse: true,
  mouseType: "wireless",
  usb: true,
  microphone: false,
  keyboardType: "wired",
};

export function useSensorDetection(enabled: boolean = true) {
  const [sensorStatus, setSensorStatus] = useState<SensorStatus>({
    keyboardActive: false,
    mouseActive: false,
    lastKeyboardActivity: null,
    lastMouseActivity: null,
  });

  const [isDetecting, setIsDetecting] = useState(false);

  // Keyboard detection
  const handleKeyboardActivity = useCallback(() => {
    if (!enabled) return;
    setSensorStatus((prev) => ({
      ...prev,
      keyboardActive: true,
      lastKeyboardActivity: new Date(),
    }));
    
    // Reset after 1 second of inactivity
    setTimeout(() => {
      setSensorStatus((prev) => ({
        ...prev,
        keyboardActive: false,
      }));
    }, 1000);
  }, [enabled]);

  // Mouse detection
  const handleMouseActivity = useCallback(() => {
    if (!enabled) return;
    setSensorStatus((prev) => ({
      ...prev,
      mouseActive: true,
      lastMouseActivity: new Date(),
    }));
    
    // Reset after 1 second of inactivity
    setTimeout(() => {
      setSensorStatus((prev) => ({
        ...prev,
        mouseActive: false,
      }));
    }, 1000);
  }, [enabled]);

  useEffect(() => {
    if (!enabled) {
      setIsDetecting(false);
      return;
    }

    setIsDetecting(true);

    // Add event listeners
    window.addEventListener("keydown", handleKeyboardActivity);
    window.addEventListener("keyup", handleKeyboardActivity);
    window.addEventListener("mousemove", handleMouseActivity);
    window.addEventListener("mousedown", handleMouseActivity);
    window.addEventListener("wheel", handleMouseActivity);

    return () => {
      window.removeEventListener("keydown", handleKeyboardActivity);
      window.removeEventListener("keyup", handleKeyboardActivity);
      window.removeEventListener("mousemove", handleMouseActivity);
      window.removeEventListener("mousedown", handleMouseActivity);
      window.removeEventListener("wheel", handleMouseActivity);
    };
  }, [enabled, handleKeyboardActivity, handleMouseActivity]);

  return {
    sensorStatus,
    isDetecting,
    DEFAULT_SENSOR_SETTINGS,
  };
}

export { DEFAULT_SENSOR_SETTINGS };
