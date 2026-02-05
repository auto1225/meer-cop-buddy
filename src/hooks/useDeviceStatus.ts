import { useState, useEffect } from "react";

interface DeviceStatus {
  isNetworkConnected: boolean;
  isCameraAvailable: boolean;
}

export function useDeviceStatus() {
  const [status, setStatus] = useState<DeviceStatus>({
    isNetworkConnected: navigator.onLine,
    isCameraAvailable: false,
  });

  useEffect(() => {
    // Network connectivity detection
    const handleOnline = () => {
      setStatus((prev) => ({ ...prev, isNetworkConnected: true }));
    };

    const handleOffline = () => {
      setStatus((prev) => ({ ...prev, isNetworkConnected: false }));
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    // Camera availability detection
    const checkCameraAvailability = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.enumerateDevices) {
          setStatus((prev) => ({ ...prev, isCameraAvailable: false }));
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some((device) => device.kind === "videoinput");
        setStatus((prev) => ({ ...prev, isCameraAvailable: hasCamera }));
      } catch (error) {
        console.error("Error checking camera availability:", error);
        setStatus((prev) => ({ ...prev, isCameraAvailable: false }));
      }
    };

    checkCameraAvailability();

    // Listen for device changes (camera connected/disconnected)
    const handleDeviceChange = () => {
      checkCameraAvailability();
    };

    if (navigator.mediaDevices) {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    }

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
      if (navigator.mediaDevices) {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      }
    };
  }, []);

  return status;
}
