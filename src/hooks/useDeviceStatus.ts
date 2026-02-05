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

    // Camera availability detection using enumerateDevices (no permission needed)
    const checkCameraAvailability = async () => {
      try {
        if (!navigator.mediaDevices?.enumerateDevices) {
          setStatus((prev) => ({ ...prev, isCameraAvailable: false }));
          return;
        }

        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasVideoInput = devices.some((device) => device.kind === "videoinput");
        
        console.log("Camera devices found:", devices.filter(d => d.kind === "videoinput"));
        setStatus((prev) => ({ ...prev, isCameraAvailable: hasVideoInput }));
      } catch (error) {
        console.error("Error checking camera:", error);
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
