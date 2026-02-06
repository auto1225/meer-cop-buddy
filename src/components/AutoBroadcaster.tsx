import { useEffect, useRef, useState, useCallback } from "react";
import { supabaseShared } from "@/lib/supabase";
import { useWebRTCBroadcaster } from "@/hooks/useWebRTCBroadcaster";

interface AutoBroadcasterProps {
  deviceId: string | undefined;
}

export function AutoBroadcaster({ deviceId }: AutoBroadcasterProps) {
  const [isStreamingRequested, setIsStreamingRequested] = useState(false);
  const streamRef = useRef<MediaStream | null>(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const lastRequestedRef = useRef<boolean | null>(null);
  
  const {
    isBroadcasting,
    startBroadcasting,
    stopBroadcasting,
  } = useWebRTCBroadcaster({ deviceId: deviceId || "" });

  // Start camera and broadcasting
  const startCameraAndBroadcast = useCallback(async () => {
    // Prevent duplicate starts
    if (!deviceId || isBroadcasting || isStartingRef.current) return;
    isStartingRef.current = true;

    try {
      console.log("[AutoBroadcaster] Starting camera for streaming request");
      
      // Request camera access
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: "user",
        },
        audio: false,
      });

      streamRef.current = stream;

      // Start WebRTC broadcasting (this will set is_camera_connected after SUBSCRIBED)
      await startBroadcasting(stream);

      console.log("[AutoBroadcaster] Camera started, waiting for channel subscription");
    } catch (error) {
      console.error("[AutoBroadcaster] Failed to start camera:", error);
      
      // Reset the streaming request flag on error
      await supabaseShared
        .from("devices")
        .update({ is_streaming_requested: false })
        .eq("id", deviceId);
    } finally {
      isStartingRef.current = false;
    }
  }, [deviceId, isBroadcasting, startBroadcasting]);

  // Stop camera and broadcasting
  const stopCameraAndBroadcast = useCallback(async () => {
    // Prevent duplicate stops
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    console.log("[AutoBroadcaster] Stopping camera and broadcast");

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Stop WebRTC broadcasting
    await stopBroadcasting();

    // Update device status
    if (deviceId) {
      await supabaseShared
        .from("devices")
        .update({ is_camera_connected: false })
        .eq("id", deviceId);
    }

    isStoppingRef.current = false;
  }, [deviceId, stopBroadcasting]);

  // Subscribe to streaming request changes
  useEffect(() => {
    if (!deviceId) return;

    // Initial fetch
    const fetchStreamingStatus = async () => {
      const { data } = await supabaseShared
        .from("devices")
        .select("is_streaming_requested")
        .eq("id", deviceId)
        .maybeSingle();

      if (data?.is_streaming_requested !== undefined) {
        setIsStreamingRequested(data.is_streaming_requested);
        lastRequestedRef.current = data.is_streaming_requested;
      }
    };

    fetchStreamingStatus();

    // Subscribe to realtime changes
    const channel = supabaseShared
      .channel(`streaming-request-${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "devices",
          filter: `id=eq.${deviceId}`,
        },
        (payload) => {
          const newData = payload.new as { is_streaming_requested?: boolean };
          if (newData.is_streaming_requested !== undefined) {
            // Only update if actually changed
            if (lastRequestedRef.current !== newData.is_streaming_requested) {
              console.log("[AutoBroadcaster] Streaming request changed:", newData.is_streaming_requested);
              lastRequestedRef.current = newData.is_streaming_requested;
              setIsStreamingRequested(newData.is_streaming_requested);
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabaseShared.removeChannel(channel);
    };
  }, [deviceId]);


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

  // This component doesn't render anything visible
  return null;
}
