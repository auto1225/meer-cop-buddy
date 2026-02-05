import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";

interface DeviceStatus {
  isNetworkConnected: boolean;
  isCameraAvailable: boolean;
}

export function useDeviceStatus(deviceId?: string) {
  const [status, setStatus] = useState<DeviceStatus>({
    isNetworkConnected: navigator.onLine,
    isCameraAvailable: false,
  });
  
  const deviceIdRef = useRef(deviceId);
  deviceIdRef.current = deviceId;

  // Update DB with current status
  const updateDeviceStatusInDB = useCallback(async (
    networkConnected: boolean, 
    cameraConnected: boolean
  ) => {
    const currentDeviceId = deviceIdRef.current;
    if (!currentDeviceId) return;

    try {
      await supabaseShared
        .from("devices")
        .update({
          is_network_connected: networkConnected,
          is_camera_connected: cameraConnected,
          updated_at: new Date().toISOString(),
        })
        .eq("id", currentDeviceId);
    } catch (error) {
      console.error("Failed to update device status in DB:", error);
    }
  }, []);

  useEffect(() => {
    // Network connectivity detection
    const handleOnline = () => {
      setStatus((prev) => {
        const newStatus = { ...prev, isNetworkConnected: true };
        updateDeviceStatusInDB(true, prev.isCameraAvailable);
        return newStatus;
      });
    };

    const handleOffline = () => {
      setStatus((prev) => {
        const newStatus = { ...prev, isNetworkConnected: false };
        updateDeviceStatusInDB(false, prev.isCameraAvailable);
        return newStatus;
      });
    };

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, [updateDeviceStatusInDB]);

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
          setStatus((prev) => {
            if (prev.isCameraAvailable !== hasCamera) {
              updateDeviceStatusInDB(prev.isNetworkConnected, hasCamera);
            }
            return { ...prev, isCameraAvailable: hasCamera };
          });
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
  }, [updateDeviceStatusInDB]);

  // Initial sync to DB when deviceId becomes available
  useEffect(() => {
    if (deviceId) {
      updateDeviceStatusInDB(status.isNetworkConnected, status.isCameraAvailable);
    }
  }, [deviceId, updateDeviceStatusInDB, status.isNetworkConnected, status.isCameraAvailable]);

  const setCameraAvailable = useCallback((available: boolean) => {
    setStatus((prev) => {
      updateDeviceStatusInDB(prev.isNetworkConnected, available);
      return { ...prev, isCameraAvailable: available };
    });
  }, [updateDeviceStatusInDB]);

  return {
    isNetworkConnected: status.isNetworkConnected,
    isCameraAvailable: status.isCameraAvailable,
    setCameraAvailable,
  };
}
