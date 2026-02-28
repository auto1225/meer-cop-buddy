import { useEffect, useRef, useState, useCallback } from "react";
import { fetchDeviceViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY, supabaseShared } from "@/lib/supabase";
import { useWebRTCBroadcaster } from "@/hooks/useWebRTCBroadcaster";

interface AutoBroadcasterProps {
  deviceId: string | undefined;
  userId: string | undefined;
  sharedDeviceId?: string;
}

let globalBroadcastingDevice: string | null = null;

export function AutoBroadcaster({ deviceId, userId, sharedDeviceId: sharedDeviceIdProp }: AutoBroadcasterProps) {
  const [isStreamingRequested, setIsStreamingRequested] = useState(false);
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

  // Sync from parent prop when available
  useEffect(() => {
    if (sharedDeviceIdProp && sharedDeviceIdRef.current !== sharedDeviceIdProp) {
      sharedDeviceIdRef.current = sharedDeviceIdProp;
      setSignalingDeviceId(sharedDeviceIdProp);
      console.log(`[AutoBroadcaster] 🔑 Signaling ID from parent: ${sharedDeviceIdProp}`);
    }
  }, [sharedDeviceIdProp]);

  // Log mount/unmount for debugging
  useEffect(() => {
    console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🟢 MOUNTED deviceId=${deviceId} userId=${userId} sharedId=${sharedDeviceIdProp}`);
    return () => {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🔴 UNMOUNTED`);
    };
  }, [deviceId, userId, sharedDeviceIdProp]);

  const {
    isBroadcasting,
    startBroadcasting,
    stopBroadcasting,
  } = useWebRTCBroadcaster({ deviceId: signalingDeviceId });

  const isBroadcastingRef = useRef(isBroadcasting);
  useEffect(() => { isBroadcastingRef.current = isBroadcasting; }, [isBroadcasting]);

  const isStreamingRequestedRef = useRef(isStreamingRequested);
  useEffect(() => { isStreamingRequestedRef.current = isStreamingRequested; }, [isStreamingRequested]);

  const clearRetryTimer = useCallback(() => {
    if (retryTimerRef.current) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
  }, []);

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

  const startCameraAndBroadcast = useCallback(async () => {
    if (globalBroadcastingDevice && globalBroadcastingDevice !== deviceId) {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ⏭️ Another device is already broadcasting`);
      return;
    }
    
    if (!deviceId || !sharedDeviceIdRef.current || isStartingRef.current || isStoppingRef.current) {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ⏭️ Skipped: deviceId=${deviceId} sharedId=${sharedDeviceIdRef.current} starting=${isStartingRef.current} stopping=${isStoppingRef.current}`);
      return;
    }

    isStartingRef.current = true;
    globalBroadcastingDevice = deviceId;

    if (streamRef.current) {
      const activeTracks = streamRef.current.getTracks().filter(t => t.readyState === "live");
      if (activeTracks.length > 0) {
        console.log(`[AutoBroadcaster:${instanceIdRef.current}] Stream already active with ${activeTracks.length} live tracks`);
        isStartingRef.current = false;
        return;
      }
      streamRef.current.getTracks().forEach(t => { t.onended = null; t.stop(); });
      streamRef.current = null;
    }
    
    console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🧹 Forcing full cleanup before (re)start`);
    await stopBroadcasting();
    await new Promise(r => setTimeout(r, 500));

    try {
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🎥 Starting camera (attempt ${retryCountRef.current + 1}) signalingId=${sharedDeviceIdRef.current}`);
      
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640, max: 640 }, height: { ideal: 480, max: 480 }, frameRate: { ideal: 15, max: 30 }, facingMode: "user" },
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      
      const audioTracks = stream.getAudioTracks();
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🎤 Audio tracks: ${audioTracks.length}`);
      if (audioTracks.length === 0) {
        console.warn(`[AutoBroadcaster:${instanceIdRef.current}] ⚠️ No audio track captured!`);
      }

      streamRef.current = stream;
      retryCountRef.current = 0;
      clearRetryTimer();

      stream.getTracks().forEach((track) => {
        track.onended = async () => {
          const allEnded = stream.getTracks().every(t => t.readyState === "ended");
          if (allEnded && streamRef.current === stream) {
            console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🔌 All tracks ended`);
            streamRef.current = null;
            globalBroadcastingDevice = null;
            isStartingRef.current = false;
            await stopBroadcasting();
            if (isStreamingRequestedRef.current) scheduleRetry();
          }
        };
      });

      await startBroadcasting(stream);
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] ✅ Broadcasting started (signalingId=${sharedDeviceIdRef.current})`);
    } catch (error) {
      console.error(`[AutoBroadcaster:${instanceIdRef.current}] ❌ Failed to start camera:`, error);
      streamRef.current = null;
      globalBroadcastingDevice = null;
      if (retryCountRef.current < MAX_RETRIES) {
        scheduleRetry();
      } else {
        retryCountRef.current = 0;
        await updateDeviceViaEdge(deviceId, { is_streaming_requested: false });
      }
    } finally {
      isStartingRef.current = false;
    }
  }, [deviceId, startBroadcasting, stopBroadcasting, clearRetryTimer]);

  const scheduleRetry = useCallback(() => {
    clearRetryTimer();
    retryCountRef.current++;
    const delay = 3000;
    console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🔄 Retry in ${delay}ms (${retryCountRef.current}/${MAX_RETRIES})`);
    retryTimerRef.current = setTimeout(() => {
      retryTimerRef.current = null;
      if (isStreamingRequestedRef.current) startCameraAndBroadcast();
    }, delay);
  }, [clearRetryTimer, startCameraAndBroadcast]);

  // ── Shared DB helper: find or register this laptop ──
  const resolveSharedDeviceId = useCallback(async (
    localDevice: any,
    sharedDevices: any[]
  ): Promise<{ id: string; is_streaming_requested: boolean } | null> => {
    const localCompositeId = localDevice?.device_id;
    const localName = localDevice?.device_name || localDevice?.name;
    const localType = localDevice?.device_type || "laptop";

    console.log(`[AutoBroadcaster] 🔍 Matching shared device: compositeId=${localCompositeId} name=${localName} type=${localType} sharedCount=${sharedDevices.length}`);
    
    // Log all shared devices for debugging
    sharedDevices.forEach((d: any, i: number) => {
      console.log(`[AutoBroadcaster] 📋 Shared[${i}]: id=${d.id} device_id=${d.device_id} name=${d.device_name || d.name} type=${d.device_type} streaming=${d.is_streaming_requested}`);
    });

    // Strategy 1: Match by composite device_id text field
    let match = sharedDevices.find((d: any) => localCompositeId && d.device_id === localCompositeId);
    
    // Strategy 2: Match by name + type
    if (!match) match = sharedDevices.find((d: any) => localName && d.device_name === localName && d.device_type === localType);
    if (!match) match = sharedDevices.find((d: any) => localName && d.name === localName && d.device_type === localType);
    
    // Strategy 3: If only one laptop exists, use it
    if (!match) {
      const laptops = sharedDevices.filter((d: any) => d.device_type === localType);
      if (laptops.length === 1) {
        match = laptops[0];
        console.log(`[AutoBroadcaster] 🎯 Only one ${localType} in shared DB, using it`);
      }
    }

    // Strategy 4: Match by UUID (same as local — unlikely but try)
    if (!match) match = sharedDevices.find((d: any) => d.id === localDevice?.id);

    if (match) {
      console.log(`[AutoBroadcaster] ✅ Shared device matched: ${match.id} (name=${match.device_name || match.name})`);
      return { id: match.id, is_streaming_requested: match.is_streaming_requested ?? false };
    }

    // No match found — register in shared DB
    console.log(`[AutoBroadcaster] ⚠️ No shared device found, registering...`);
    try {
      const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/register-device`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
        body: JSON.stringify({
          user_id: localDevice?.user_id,
          name: localName,
          device_name: localName,
          device_type: localType,
          status: "online",
          metadata: {},
        }),
      });
      if (res.ok) {
        const data = await res.json();
        const device = data.device || data;
        console.log(`[AutoBroadcaster] ✅ Registered in shared DB: ${device.id}`);
        return { id: device.id, is_streaming_requested: device.is_streaming_requested ?? false };
      }
    } catch (e) {
      console.warn("[AutoBroadcaster] Shared register failed:", e);
    }
    return null;
  }, []);

  // ── Main polling effect ──
  useEffect(() => {
    if (!deviceId || !userId) {
      console.log(`[AutoBroadcaster] ⏭️ Polling skipped: deviceId=${deviceId} userId=${userId}`);
      return;
    }

    console.log(`[AutoBroadcaster] 🔗 Starting dual-DB polling: localId=${deviceId} userId=${userId}`);
    let isMounted = true;

    const checkStreamingStatus = async () => {
      if (!isMounted) return;
      try {
        let requested = false;

        // 1) Local DB
        let localDevice: any = null;
        try {
          localDevice = await fetchDeviceViaEdge(deviceId, userId);
          if (localDevice) {
            requested = localDevice.is_streaming_requested ?? false;
          }
        } catch (e) {
          console.warn("[AutoBroadcaster] Local poll error:", e);
        }

        // 2) Shared DB
        try {
          const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-devices`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
            body: JSON.stringify({ user_id: userId }),
          });

          if (res.ok) {
            const data = await res.json();
            const devices = data.devices || data || [];
            
            const result = await resolveSharedDeviceId(localDevice, devices);
            if (result) {
              if (sharedDeviceIdRef.current !== result.id) {
                sharedDeviceIdRef.current = result.id;
                setSignalingDeviceId(result.id);
                console.log(`[AutoBroadcaster] 🔑 Signaling ID set: ${result.id}`);
              }
              // Shared DB value wins (smartphone writes there)
              if (result.is_streaming_requested) requested = true;
            }
          } else {
            console.warn(`[AutoBroadcaster] Shared get-devices HTTP ${res.status}`);
          }
        } catch (e) {
          console.warn("[AutoBroadcaster] Shared poll error:", e);
        }

        if (!isMounted) return;

        // 3) Also check for pending viewer-join signals in signaling table
        // This handles the case where is_streaming_requested was briefly true then reset
        if (!requested && sharedDeviceIdRef.current) {
          try {
            const { data: signals } = await supabaseShared
              .from("webrtc_signaling")
              .select("id")
              .eq("device_id", sharedDeviceIdRef.current)
              .eq("type", "viewer-join")
              .eq("sender_type", "viewer")
              .limit(1);
            if (signals && signals.length > 0) {
              console.log("[AutoBroadcaster] 👋 Found pending viewer-join signal! Triggering broadcast.");
              requested = true;
            }
          } catch (e) {
            // silent — signaling table might not be accessible
          }
        }

        if (lastRequestedRef.current !== requested) {
          console.log("[AutoBroadcaster] ✨ Streaming CHANGED:", lastRequestedRef.current, "→", requested);
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
  }, [deviceId, userId, resolveSharedDeviceId]);

  // ── Event listeners ──
  useEffect(() => {
    const handleCameraStatusChanged = (event: Event) => {
      const detail = (event as CustomEvent).detail;
      if (detail.isConnected && isStreamingRequestedRef.current && !isBroadcastingRef.current) {
        console.log(`[AutoBroadcaster] 📷 Camera reconnected → restarting in 1.5s`);
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

  useEffect(() => {
    const handleNeedsRestart = async () => {
      if (!isStreamingRequestedRef.current || !deviceId) return;
      console.log(`[AutoBroadcaster:${instanceIdRef.current}] 🔄 broadcast-needs-restart`);
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

  // React to streaming request + signalingDeviceId changes
  useEffect(() => {
    console.log(`[AutoBroadcaster] 📊 State: streaming=${isStreamingRequested} broadcasting=${isBroadcasting} signalingId=${signalingDeviceId}`);
    if (isStreamingRequested && !isBroadcasting) {
      if (signalingDeviceId) {
        startCameraAndBroadcast();
      } else {
        console.log("[AutoBroadcaster] ⏳ Waiting for shared signaling ID...");
      }
    } else if (!isStreamingRequested && isBroadcasting) {
      stopCameraAndBroadcast();
    } else if (!isStreamingRequested && !isBroadcasting) {
      clearRetryTimer();
      retryCountRef.current = 0;
    }
  }, [isStreamingRequested, isBroadcasting, signalingDeviceId, startCameraAndBroadcast, stopCameraAndBroadcast, clearRetryTimer]);

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
