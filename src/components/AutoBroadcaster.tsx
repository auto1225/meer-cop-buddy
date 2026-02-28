import { useEffect, useRef, useState, useCallback } from "react";
import { fetchDeviceViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { useWebRTCBroadcaster } from "@/hooks/useWebRTCBroadcaster";

interface AutoBroadcasterProps {
  deviceId: string | undefined;
  userId: string | undefined;
}

// Global singleton guard to prevent duplicate broadcasts across component instances
let globalBroadcastingDevice: string | null = null;

export function AutoBroadcaster({ deviceId, userId }: AutoBroadcasterProps) {
  const [isStreamingRequested, setIsStreamingRequested] = useState(false);
  // The shared DB's UUID for this device — used for signaling
  const [signalingDeviceId, setSignalingDeviceId] = useState<string>("");
  const streamRef = useRef<MediaStream | null>(null);
  const isStartingRef = useRef(false);
  const isStoppingRef = useRef(false);
  const lastRequestedRef = useRef<boolean | null>(null);
  const instanceIdRef = useRef(Math.random().toString(36).substring(7));
  const retryTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const retryCountRef = useRef(0);
  const MAX_RETRIES = 10;
  const sharedDeviceIdRef = useRef<string>("");
  
  // Use shared DB device ID for signaling so smartphone viewer-join matches
  const {
    isBroadcasting,
    startBroadcasting,
    stopBroadcasting,
  } = useWebRTCBroadcaster({ deviceId: signalingDeviceId });

  // Use ref to avoid stale closure issues with isBroadcasting
  const isBroadcastingRef = useRef(isBroadcasting);
  useEffect(() => { isBroadcastingRef.current = isBroadcasting; }, [isBroadcasting]);

  const isStreamingRequestedRef = useRef(isStreamingRequested);
  useEffect(() => { isStreamingRequestedRef.current = isStreamingRequested; }, [isStreamingRequested]);

  // Clean up retry timer
  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

  // Stop camera and broadcasting
  const stopCameraAndBroadcast = useCallback(async () => {
    if (isStoppingRef.current) return;
    isStoppingRef.current = true;

    console.log(`[AutoBroadcaster:${instanceIdRef.current}] Stopping camera and broadcast`);

    globalBroadcastingDevice = null;
    clearRetryTimer();
    retryCountRef.current = 0;
    isStartingRef.current = false;

    if (streamRef.current) {
      streamRef.current.getTracks().forEach((track) => {
        track.onended = null;
        track.stop();
      });
      streamRef.current = null;
    }

    await stopBroadcasting();

    isStoppingRef.current = false;
  }, [stopBroadcasting, clearRetryTimer]);

  // Start camera and broadcasting
  const startCameraAndBroadcast = useCallback(async () => {
    if (globalBroadcastingDevice && globalBroadcastingDevice !== deviceId) {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ⏭️ Another device is already broadcasting`);
      return;
    }
    
    if (!deviceId || !sharedDeviceIdRef.current || isStartingRef.current || isStoppingRef.current) {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ⏭️ Skipped: sharedId=${sharedDeviceIdRef.current} starting=${isStartingRef.current} stopping=${isStoppingRef.current}`);
      return;
    }

    // Set guard IMMEDIATELY to prevent duplicate calls
    isStartingRef.current = true;
    globalBroadcastingDevice = deviceId;

    // If stream already exists and tracks are alive, skip
    if (streamRef.current) {
      const activeTracks = streamRef.current.getTracks().filter(t => t.readyState === "live");
      if (activeTracks.length > 0) {
        console.log(`[AutoBroadcaster:${instanceIdRef.current}] Stream already active with ${activeTracks.length} live tracks`);
        isStartingRef.current = false;
        return;
      }
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🧹 Cleaning dead stream`);
      streamRef.current.getTracks().forEach(t => { t.onended = null; t.stop(); });
      streamRef.current = null;
    }
    
    // ALWAYS stop previous broadcast to clear stale PeerConnections/signaling
    console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🧹 Forcing full cleanup before (re)start`);
    await stopBroadcasting();
    await new Promise(r => setTimeout(r, 500));

    try {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🎥 Starting camera (attempt ${retryCountRef.current + 1}) signalingId=${sharedDeviceIdRef.current}`);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 640, max: 640 },
          height: { ideal: 480, max: 480 },
          frameRate: { ideal: 15, max: 30 },
          facingMode: "user",
        },
        audio: {
          echoCancellation: true,
          noiseSuppression: true,
          autoGainControl: true,
        },
      });
      
      const audioTracks = stream.getAudioTracks();
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🎤 Audio tracks: ${audioTracks.length}`);
      audioTracks.forEach(t => {
        console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🎤 Audio: "${t.label}" enabled=${t.enabled} muted=${t.muted}`);
      });
      if (audioTracks.length === 0) {
        console.warn(`[AutoBroadcaster:${instanceIdRef.current}] ⚠️ No audio track captured!`);
      }

      streamRef.current = stream;
      retryCountRef.current = 0;
      clearRetryTimer();

      stream.getTracks().forEach((track) => {
        track.onended = async () => {
          console.log(`[AutoBroadcaster:${instanceIdRef.current}] ⚠️ Track ended: ${track.kind} (${track.label})`);
          
          const allEnded = stream.getTracks().every(t => t.readyState === "ended");
          if (allEnded && streamRef.current === stream) {
            console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🔌 All tracks ended — camera likely removed`);
            
            streamRef.current = null;
            globalBroadcastingDevice = null;
            isStartingRef.current = false;
            
            await stopBroadcasting();
            
            if (isStreamingRequestedRef.current) {
              scheduleRetry();
            }
          }
        };
      });

      await startBroadcasting(stream);

      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ✅ Camera started and broadcasting (signalingId=${sharedDeviceIdRef.current})`);
    } catch (error) {
      console.error(`[AutoBroadcaster:${instanceIdRef.current}] ❌ Failed to start camera:`, error);
      streamRef.current = null;
      globalBroadcastingDevice = null;
      
      if (retryCountRef.current < MAX_RETRIES) {
        scheduleRetry();
      } else {
        console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🛑 Max retries reached, giving up`);
        retryCountRef.current = 0;
        await updateDeviceViaEdge(deviceId, { is_streaming_requested: false });
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [deviceId, startBroadcasting, stopBroadcasting, clearRetryTimer]);

  // Schedule a retry attempt
  const scheduleRetry = useCallback(() => {
    clearRetryTimer();
    retryCountRef.current++;
    const delay = 3000;
    console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🔄 Retry scheduled in ${delay}ms (${retryCountRef.current}/${MAX_RETRIES})`);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (isStreamingRequestedRef.current) {
        startCameraAndBroadcast();
      }
    }, delay);
  }, [clearRetryTimer, startCameraAndBroadcast]);

  // Resolve shared DB device ID + poll streaming status
  useEffect(() => {
    if (!deviceId || !userId) return;

    console.log("[AutoBroadcaster] 🔗 Starting dual-DB polling for device:", deviceId);
    let isMounted = true;

    const checkStreamingStatus = async () => {
      if (!isMounted) return;
      try {
        let requested = false;

        // 1) Local DB: read current device once
        let localDevice: any = null;
        try {
          localDevice = await fetchDeviceViaEdge(deviceId, userId);
          if (localDevice) {
            requested = localDevice.is_streaming_requested ?? false;
          }
        } catch (e) {
          console.warn("[AutoBroadcaster] Local poll error:", e);
        }

        // 2) Shared DB: resolve matching shared UUID + sync requested flag
        try {
          const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-devices`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
            body: JSON.stringify({ user_id: userId }),
          });

          if (res.ok) {
            const data = await res.json();
            const devices = data.devices || data || [];
            const localCompositeId = localDevice?.device_id;
            const localName = localDevice?.device_name || localDevice?.name;
            const localType = localDevice?.device_type;

            const sharedDevice =
              devices.find((d: any) => localCompositeId && d.device_id === localCompositeId) ||
              devices.find((d: any) => localName && localType && d.device_name === localName && d.device_type === localType) ||
              devices.find((d: any) => localName && localType && d.name === localName && d.device_type === localType) ||
              devices.find((d: any) => d.id === deviceId);

            if (sharedDevice?.id) {
              if (sharedDeviceIdRef.current !== sharedDevice.id) {
                sharedDeviceIdRef.current = sharedDevice.id;
                setSignalingDeviceId(sharedDevice.id);
                console.log(`[AutoBroadcaster] 🔑 Shared signaling device resolved: ${sharedDevice.id} (local: ${deviceId})`);
              }
              // Shared DB value should win if smartphone writes there
              requested = sharedDevice.is_streaming_requested ?? requested;
            }
          }
        } catch (e) {
          console.warn("[AutoBroadcaster] Shared poll error:", e);
        }

        if (!isMounted) return;

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

    checkStreamingStatus();
    const intervalId = setInterval(checkStreamingStatus, 5000);

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [deviceId, userId]);

  // Listen for camera-status-changed events to auto-restart broadcast
  useEffect(() => {
    const handleCameraStatusChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      console.log(`[AutoBroadcaster] 📷 Camera status changed:`, detail);
      
      if (detail.isConnected && isStreamingRequestedRef.current && !isBroadcastingRef.current) {
        console.log(`[AutoBroadcaster] 📷 Camera reconnected + streaming requested → restarting in 1.5s`);
        retryCountRef.current = 0;
        clearRetryTimer();
        retryTimerRef.current = setTimeout(() => {
          retryTimerRef.current = null;
          startCameraAndBroadcast();
        }, 1500);
      }
    };

    window.addEventListener("camera-status-changed", handleCameraStatusChanged);
    return () => window.removeEventListener("camera-status-changed", handleCameraStatusChanged);
  }, [startCameraAndBroadcast, clearRetryTimer]);

  // Listen for broadcast-needs-restart events (stale stream detection)
  useEffect(() => {
    const handleNeedsRestart = async () => {
      if (!isStreamingRequestedRef.current || !deviceId) return;
      
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🔄 Received broadcast-needs-restart — doing full restart`);
      
      await stopCameraAndBroadcast();
      await new Promise(r => setTimeout(r, 800));
      
      if (isStreamingRequestedRef.current) {
        retryCountRef.current = 0;
        startCameraAndBroadcast();
      }
    };

    window.addEventListener("broadcast-needs-restart", handleNeedsRestart);
    return () => window.removeEventListener("broadcast-needs-restart", handleNeedsRestart);
  }, [deviceId, stopCameraAndBroadcast, startCameraAndBroadcast]);

  // React to streaming request changes
  useEffect(() => {
    if (isStreamingRequested && !isBroadcasting) {
      if (signalingDeviceId) {
        startCameraAndBroadcast();
      } else {
        console.log("[AutoBroadcaster] ⏳ Waiting for shared signaling device ID before start");
      }
    } else if (!isStreamingRequested && isBroadcasting) {
      stopCameraAndBroadcast();
    } else if (!isStreamingRequested && !isBroadcasting) {
      clearRetryTimer();
      retryCountRef.current = 0;
    }
  }, [isStreamingRequested, isBroadcasting, signalingDeviceId, startCameraAndBroadcast, stopCameraAndBroadcast, clearRetryTimer]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      clearRetryTimer();
      if (streamRef.current) {
        streamRef.current.getTracks().forEach((track) => {
          track.onended = null;
          track.stop();
        });
      }
    };
  }, [clearRetryTimer]);

  return null;
}
