import { useState, useRef, useCallback, useEffect } from "react";
import { supabaseShared } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import { getIceServers } from "@/lib/iceServers";

/**
 * WebRTC Viewer Hook — 스마트폰(뷰어) 측
 * 
 * 프로토콜:
 * 1. viewer-join 시그널 전송
 * 2. 브로드캐스터의 offer 수신 대기
 * 3. answer 생성 및 전송
 * 4. ICE candidates 교환
 * 5. P2P 스트림 수신
 */

interface UseWebRTCViewerOptions {
  deviceId: string;
  onStream?: (stream: MediaStream) => void;
}

// ── Supabase signaling helpers ──

async function fetchSignaling(deviceId: string, type: string, senderType: string) {
  const { data, error } = await supabaseShared
    .from("webrtc_signaling")
    .select("*")
    .eq("device_id", deviceId)
    .eq("type", type)
    .eq("sender_type", senderType);
  if (error) {
    console.warn("[Viewer] fetchSignaling error:", error.message);
    return [];
  }
  return data || [];
}

async function insertSignaling(record: {
  device_id: string;
  session_id: string;
  type: string;
  sender_type: string;
  data: Record<string, unknown>;
}) {
  const { error } = await supabaseShared.from("webrtc_signaling").insert(record);
  if (error) {
    console.error("[Viewer] insertSignaling error:", error.message);
  }
}

export function useWebRTCViewer({ deviceId, onStream }: UseWebRTCViewerOptions) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const sessionIdRef = useRef("");
  const streamRef = useRef<MediaStream | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const isConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);
  const remoteDescriptionSetRef = useRef(false);
  const answerSentRef = useRef(false);
  const onStreamRef = useRef(onStream);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Keep onStream ref fresh without re-creating callbacks
  useEffect(() => {
    onStreamRef.current = onStream;
  }, [onStream]);

  const generateSessionId = useCallback(() => {
    return `viewer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // ── Handle offer from broadcaster ──
  const handleOffer = useCallback(async (offerData: any) => {
    const pc = pcRef.current;
    if (!pc) return;

    if (remoteDescriptionSetRef.current) {
      console.log("[Viewer] ⏭️ Remote description already set, skipping");
      return;
    }
    remoteDescriptionSetRef.current = true;

    try {
      // Parse SDP flexibly
      let sdp: RTCSessionDescriptionInit;
      if (typeof offerData === "string") {
        sdp = JSON.parse(offerData);
      } else if (offerData?.type && offerData?.sdp) {
        sdp = { type: offerData.type, sdp: offerData.sdp };
      } else if (offerData?.sdp?.type && offerData?.sdp?.sdp) {
        sdp = { type: offerData.sdp.type, sdp: offerData.sdp.sdp };
      } else {
        throw new Error("Invalid SDP format");
      }

      console.log("[Viewer] 📥 Setting remote description (offer)");
      await pc.setRemoteDescription(new RTCSessionDescription(sdp));

      // Create and send answer
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      if (!answerSentRef.current) {
        answerSentRef.current = true;
        await insertSignaling({
          device_id: deviceId,
          session_id: sessionIdRef.current,
          type: "answer",
          sender_type: "viewer",
          data: { sdp: { type: answer.type, sdp: answer.sdp } },
        });
        console.log("[Viewer] ✅ Answer sent");
      }

      // Flush queued ICE candidates
      if (iceCandidateQueueRef.current.length > 0) {
        console.log(`[Viewer] 🧊 Flushing ${iceCandidateQueueRef.current.length} queued ICE candidates`);
        for (const candidate of iceCandidateQueueRef.current) {
          try {
            await pc.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn("[Viewer] Failed to add queued ICE:", e);
          }
        }
        iceCandidateQueueRef.current = [];
      }
    } catch (err) {
      console.error("[Viewer] ❌ Error handling offer:", err);
      remoteDescriptionSetRef.current = false;
      answerSentRef.current = false;
      setError("VIEWER_CONNECTION_FAILED");
    }
  }, [deviceId]);

  // ── Handle ICE candidate from broadcaster ──
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    const pc = pcRef.current;
    if (!pc) return;

    if (pc.remoteDescription) {
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.warn("[Viewer] Error adding ICE candidate:", err);
      }
    } else {
      iceCandidateQueueRef.current.push(candidate);
      console.log(`[Viewer] 🧊 Queued ICE candidate (${iceCandidateQueueRef.current.length} total)`);
    }
  }, []);

  // ── Cleanup internals ──
  const cleanupInternals = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    if (channelRef.current) {
      supabaseShared.removeChannel(channelRef.current);
      channelRef.current = null;
    }
    iceCandidateQueueRef.current = [];
    streamRef.current = null;
    remoteDescriptionSetRef.current = false;
    answerSentRef.current = false;
  }, []);

  // ── Connect to broadcaster ──
  const connect = useCallback(async () => {
    if (isConnectingRef.current || isConnectedRef.current) return;

    setIsConnecting(true);
    isConnectingRef.current = true;
    setError(null);

    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;
    console.log(`[Viewer] 🚀 Starting connection, session=${sessionId}`);

    // 1. Create peer connection
    const iceConfig = await getIceServers();
    const pc = new RTCPeerConnection(iceConfig);
    pcRef.current = pc;

    // Add transceivers for receiving
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    // 2. Handle incoming tracks
    pc.ontrack = (event) => {
      console.log(`[Viewer] 🎬 Received track: ${event.track.kind}`);
      const stream = event.streams?.[0];
      if (stream) {
        streamRef.current = stream;
        onStreamRef.current?.(stream);
      } else {
        // Fallback: manually assemble stream
        if (!streamRef.current) {
          streamRef.current = new MediaStream();
        }
        streamRef.current.addTrack(event.track);
        onStreamRef.current?.(streamRef.current);
      }
    };

    // 3. Send ICE candidates to broadcaster
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await insertSignaling({
          device_id: deviceId,
          session_id: sessionId,
          type: "ice-candidate",
          sender_type: "viewer",
          data: { candidate: event.candidate.toJSON() },
        });
      }
    };

    // 4. Connection state tracking
    pc.onconnectionstatechange = () => {
      console.log(`[Viewer] Connection state: ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        setIsConnected(true);
        isConnectedRef.current = true;
        setIsConnecting(false);
        isConnectingRef.current = false;
        // Stop polling once connected
        if (pollingRef.current) {
          clearInterval(pollingRef.current);
          pollingRef.current = null;
        }
      } else if (pc.connectionState === "failed" || pc.connectionState === "closed") {
        setIsConnected(false);
        isConnectedRef.current = false;
        setIsConnecting(false);
        isConnectingRef.current = false;
        setError("VIEWER_DISCONNECTED");
      }
    };

    // 5. Subscribe to Realtime for fast signal delivery
    const channel = supabaseShared
      .channel(`webrtc-viewer-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "webrtc_signaling",
          filter: `device_id=eq.${deviceId}`,
        },
        async (payload) => {
          const record = payload.new as {
            type: string;
            sender_type: string;
            session_id: string;
            data: any;
          };
          if (record.sender_type !== "broadcaster") return;

          // Only process offers/ice-candidates targeted at this session
          const targetSession = record.data?.target_session;
          if (targetSession && targetSession !== sessionId) return;

          if (record.type === "offer") {
            console.log("[Viewer] 📡 Realtime: received offer");
            await handleOffer(record.data?.sdp || record.data);
          } else if (record.type === "ice-candidate" && record.data?.candidate) {
            await handleIceCandidate(record.data.candidate);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // 6. Send viewer-join signal
    await insertSignaling({
      device_id: deviceId,
      session_id: sessionId,
      type: "viewer-join",
      sender_type: "viewer",
      data: { timestamp: Date.now() },
    });
    console.log("[Viewer] 📤 Sent viewer-join");

    // 7. Poll for offer (fallback if Realtime misses it)
    const pollForOffer = async () => {
      if (remoteDescriptionSetRef.current || !pcRef.current) return;

      try {
        const offers = await fetchSignaling(deviceId, "offer", "broadcaster");
        for (const offer of offers) {
          const targetSession = offer.data?.target_session;
          if (targetSession && targetSession !== sessionId) continue;
          console.log("[Viewer] 📡 Poll: found offer");
          await handleOffer(offer.data?.sdp || offer.data);
          break;
        }

        // Also check for ICE candidates
        if (pcRef.current?.remoteDescription) {
          const candidates = await fetchSignaling(deviceId, "ice-candidate", "broadcaster");
          for (const cand of candidates) {
            const targetSession = cand.data?.target_session;
            if (targetSession && targetSession !== sessionId) continue;
            if (cand.data?.candidate) {
              await handleIceCandidate(cand.data.candidate);
            }
          }
        }
      } catch (e) {
        console.warn("[Viewer] Poll error:", e);
      }
    };

    // Start polling after 1s grace period (give Realtime a chance first)
    setTimeout(() => {
      if (remoteDescriptionSetRef.current) return;
      pollForOffer();
      pollingRef.current = setInterval(pollForOffer, 2000);
    }, 1000);

    // 8. Timeout after 20s
    timeoutRef.current = setTimeout(() => {
      if (!isConnectedRef.current && isConnectingRef.current) {
        console.warn("[Viewer] ⏰ Connection timeout");
        setError("VIEWER_CAMERA_NOT_ON");
        setIsConnecting(false);
        isConnectingRef.current = false;
        cleanupInternals();
      }
    }, 20000);
  }, [deviceId, generateSessionId, handleOffer, handleIceCandidate, cleanupInternals]);

  // ── Disconnect ──
  const disconnect = useCallback(async () => {
    cleanupInternals();

    // Clean up signaling data
    if (sessionIdRef.current) {
      await supabaseShared
        .from("webrtc_signaling")
        .delete()
        .eq("session_id", sessionIdRef.current);
    }

    setIsConnected(false);
    isConnectedRef.current = false;
    setIsConnecting(false);
    isConnectingRef.current = false;
    console.log("[Viewer] Disconnected");
  }, [cleanupInternals]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      cleanupInternals();
      if (sessionIdRef.current) {
        supabaseShared
          .from("webrtc_signaling")
          .delete()
          .eq("session_id", sessionIdRef.current);
      }
    };
  }, [cleanupInternals]);

  return {
    isConnecting,
    isConnected,
    error,
    stream: streamRef.current,
    connect,
    disconnect,
  };
}
