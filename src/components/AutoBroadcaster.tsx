import { useEffect, useRef, useState, useCallback } from "react";
import { fetchDeviceViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import { useWebRTCBroadcaster } from "@/hooks/useWebRTCBroadcaster";

interface AutoBroadcasterProps {
  deviceId: string | undefined;
  userId: string | undefined;
}

// Global singleton guard to prevent duplicate broadcasts across component instances
let globalBroadcastingDevice: string | null = null;

export function AutoBroadcaster({ deviceId, userId }: AutoBroadcasterProps) {
  const [isStreamingRequested, setIsStreamingRequested] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const lastRequestedRef = useRef<boolean | null>(null);
  const instanceIdRef = useRef(Math.random().toString(36).substring(7));
  
  const {
    isBroadcasting,
    startBroadcasting,
    stopBroadcasting,
  } = useWebRTCBroadcaster({ deviceId: deviceId || "" });

  // Start camera and broadcasting
  const startCameraAndBroadcast = useCallback(async () => {
    if (globalBroadcastingDevice && globalBroadcastingDevice !== deviceId) {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ⏭️ Another device is already broadcasting`);
      return;
    }
    
    if (!deviceId || isStartingRef.current || streamRef.current) {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] Skipping start`, {
        deviceId: !!deviceId,
        isStarting: isStartingRef.current,
        hasStream: !!streamRef.current,
      });
      return;
    }
    
    globalBroadcastingDevice = deviceId;
    isStartingRef.current = true;

    try {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🎥 Starting camera for streaming request`);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: true,
      });

      streamRef.current = stream;
      await startBroadcasting(stream);

      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ✅ Camera started, waiting for channel subscription`);
    } catch (error) {
      console.error(`[AutoBroadcaster:${instanceIdRef.current}] ❌ Failed to start camera:`, error);
      streamRef.current = null;
      globalBroadcastingDevice = null;
      
      await updateDeviceViaEdge(deviceId, { is_streaming_requested: false });
    } finally {
      isStartingRef.current = false;
    }
  }, [deviceId, startBroadcasting]);

  // Stop camera and broadcasting
  const stopCameraAndBroadcast = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    console.log(`[AutoBroadcaster:${instanceIdRef.current}] Stopping camera and broadcast`);

    globalBroadcastingDevice = null;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    await stopBroadcasting();

    isStoppingRef.current = false;
  }, [deviceId, stopBroadcasting]);

  // Poll streaming status via Edge Function (replaces direct REST + Realtime)
  useEffect(() => {
    if (!deviceId || !userId) return;

    console.log("[AutoBroadcaster] 🔗 Starting polling for device:", deviceId);
    let isMounted = true;

    const checkStreamingStatus = async () => {
      if (!isMounted) return;
      try {
        const device = await fetchDeviceViaEdge(deviceId, userId);
        if (!device || !isMounted) return;

        const requested = device.is_streaming_requested ?? false;
        
        if (lastRequestedRef.current !== requested) {
          console.log("[AutoBroadcaster] ✨ Streaming request CHANGED:", 
            lastRequestedRef.current, "→", requested);
          lastRequestedRef.current = requested;
          setIsStreamingRequested(requested);
        }
      } catch (error) {
        console.warn("[AutoBroadcaster] Poll error:", error);
      }
    };

    // Initial check
    checkStreamingStatus();

    // Poll every 5 seconds
    const intervalId = setInterval(checkStreamingStatus, 5000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [deviceId, userId]);

  // React to streaming request changes
  useEffect(() => {
    if (isStreamingRequested && !isBroadcasting) {
      startCameraAndBroadcast();
    } else if (!isStreamingRequested && isBroadcasting) {
      stopCameraAndBroadcast();
    }
  }, [isStreamingRequested, isBroadcasting, startCameraAndBroadcast, stopCameraAndBroadcast]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => track.stop());
      }
    };
  }, []);

  return null;
}
