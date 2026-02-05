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

    // Camera availability detection - need to request permission first
    const checkCameraAvailability = async () => {
      try {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
          setStatus((prev) => ({ ...prev, isCameraAvailable: false }));
          return;
        }

        // Try to get camera access to properly detect devices
        const stream = await navigator.mediaDevices.getUserMedia({ video: true });
        
        // Camera is available - stop the stream immediately
        stream.getTracks().forEach(track => track.stop());
        setStatus((prev) => ({ ...prev, isCameraAvailable: true }));
      } catch (error) {
        console.log("Camera not available or permission denied:", error);
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
