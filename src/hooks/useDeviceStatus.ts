import { useState, useEffect, useCallback } from "react";

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

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  // Auto-detect camera availability using enumerateDevices (no permission needed)
  useEffect(() => {
    let isMounted = true;

    const checkCameraAvailability = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          return;
        }
        
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(device => device.kind === "videoinput");
        
        if (isMounted) {
          setStatus((prev) => ({ ...prev, isCameraAvailable: hasCamera }));
        }
      } catch (error) {
        console.log("Camera detection failed:", error);
      }
    };

    // Initial check
    checkCameraAvailability();

    // Listen for device changes (camera plugged/unplugged)
    const handleDeviceChange = () => {
      checkCameraAvailability();
    };

    if (navigator.mediaDevices?.addEventListener) {
      navigator.mediaDevices.addEventListener("devicechange", handleDeviceChange);
    }

    return () => {
      isMounted = false;
      if (navigator.mediaDevices?.removeEventListener) {
        navigator.mediaDevices.removeEventListener("devicechange", handleDeviceChange);
      }
    };
  }, []);

  const setCameraAvailable = useCallback((available: boolean) => {
    setStatus((prev) => ({ ...prev, isCameraAvailable: available }));
  }, []);

  return {
    isNetworkConnected: status.isNetworkConnected,
    isCameraAvailable: status.isCameraAvailable,
    setCameraAvailable,
  };
}
