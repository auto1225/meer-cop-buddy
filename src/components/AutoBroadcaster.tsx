import { useEffect, useRef, useState, useCallback } from "react";
import { supabaseShared } from "@/lib/supabase";
import { useWebRTCBroadcaster } from "@/hooks/useWebRTCBroadcaster";

interface AutoBroadcasterProps {
  deviceId: string | undefined;
}

// Global singleton guard to prevent duplicate broadcasts across component instances
let globalBroadcastingDevice: string | null = null;

export function AutoBroadcaster({ deviceId }: AutoBroadcasterProps) {
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
    // Global singleton check - prevent multiple instances from broadcasting
    if (globalBroadcastingDevice && globalBroadcastingDevice !== deviceId) {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ⏭️ Another device is already broadcasting`);
      return;
    }
    
    // Prevent duplicate starts - check multiple conditions
    if (!deviceId || isStartingRef.current || streamRef.current) {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] Skipping start`, {
        deviceId: !!deviceId,
        isStarting: isStartingRef.current,
        hasStream: !!streamRef.current,
      });
      return;
    }
    
    // Set global lock
    globalBroadcastingDevice = deviceId;
    isStartingRef.current = true;

    try {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🎥 Starting camera for streaming request`);
      
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

      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ✅ Camera started, waiting for channel subscription`);
    } catch (error) {
      console.error(`[AutoBroadcaster:${instanceIdRef.current}] ❌ Failed to start camera:`, error);
      streamRef.current = null;
      globalBroadcastingDevice = null;
      
      // Reset the streaming request flag on error
      await supabaseShared
        .from("devices")
        .update({ is_streaming_requested: false })
        .eq("id", deviceId);
    } finally {
      isStartingRef.current = false;
    }
  }, [deviceId, startBroadcasting]);

  // Stop camera and broadcasting
  const stopCameraAndBroadcast = useCallback(async () => {
    // Prevent duplicate stops
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    console.log(`[AutoBroadcaster:${instanceIdRef.current}] Stopping camera and broadcast`);

    // Clear global lock
    globalBroadcastingDevice = null;

    // Stop all tracks
    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
    }

    // Stop WebRTC broadcasting
    await stopBroadcasting();

    // NOTE: is_camera_connected는 useCameraDetection에서 하드웨어 상태만 관리
    // 스트리밍 종료 시 카메라 연결 상태를 변경하지 않음

    isStoppingRef.current = false;
  }, [deviceId, stopBroadcasting]);

  // Subscribe to streaming request changes
  useEffect(() => {
    if (!deviceId) return;

    console.log("[AutoBroadcaster] 🔗 Subscribing to device:", deviceId);

    // Initial fetch
    const fetchStreamingStatus = async () => {
      const { data, error } = await supabaseShared
        .from("devices")
        .select("is_streaming_requested")
        .eq("id", deviceId)
        .maybeSingle();

      if (error) {
        console.error("[AutoBroadcaster] ❌ Error fetching streaming status:", error);
        return;
      }

      console.log("[AutoBroadcaster] 📊 Initial streaming status:", data?.is_streaming_requested);
      
      if (data?.is_streaming_requested !== undefined) {
        setIsStreamingRequested(data.is_streaming_requested);
        lastRequestedRef.current = data.is_streaming_requested;
      }
    };

    fetchStreamingStatus();

    const channelName = `streaming-request-${deviceId}`;
    
    // Reuse existing channel if available
    const existingChannel = supabaseShared.getChannels().find(
      ch => ch.topic === `realtime:${channelName}`
    );
    
    if (existingChannel) {
      console.log("[AutoBroadcaster] ♻️ Reusing existing channel");
      return;
    }

    // Subscribe to realtime changes
    const channel = supabaseShared
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "devices",
          filter: `id=eq.${deviceId}`,
        },
        (payload) => {
          const newData = payload.new as { is_streaming_requested?: boolean; updated_at?: string };
          
          if (newData.is_streaming_requested !== undefined) {
            // Only update if actually changed
            if (lastRequestedRef.current !== newData.is_streaming_requested) {
              console.log("[AutoBroadcaster] ✨ Streaming request CHANGED:", 
                lastRequestedRef.current, "→", newData.is_streaming_requested);
              lastRequestedRef.current = newData.is_streaming_requested;
              setIsStreamingRequested(newData.is_streaming_requested);
            }
          }
        }
      )
      .subscribe((status) => {
        if (status === "CHANNEL_ERROR") {
          console.error("[AutoBroadcaster] Channel error");
        }
      });

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
