import { useState, useRef, useCallback, useEffect } from "react";
import { supabaseShared } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";
import { getIceServers } from "@/lib/iceServers";

interface UseWebRTCViewerOptions {
  deviceId: string;
  onStream?: (stream: MediaStream) => void;
}

export function useWebRTCViewer({ deviceId, onStream }: UseWebRTCViewerOptions) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const sessionIdRef = useRef<string>("");
  const streamRef = useRef<MediaStream | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);
  const isConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);
  const remoteDescriptionSetRef = useRef(false);
  const answerSentRef = useRef(false);

  // Generate unique session ID
  const generateSessionId = useCallback(() => {
    return `viewer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Handle incoming answer from broadcaster
  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!pcRef.current) return;
    
    // 중복 setRemoteDescription 방지
    if (remoteDescriptionSetRef.current) {
      console.log("[WebRTC Viewer] ⏭️ Remote description already set, skipping duplicate");
      return;
    }
    remoteDescriptionSetRef.current = true;

    try {
      await pcRef.current.setRemoteDescription(new RTCSessionDescription(answer));
      console.log("[WebRTC Viewer] Set remote description (answer)");
      
      // Flush queued ICE candidates
      if (iceCandidateQueueRef.current.length > 0) {
        console.log(`[WebRTC Viewer] 🧊 Flushing ${iceCandidateQueueRef.current.length} queued ICE candidates`);
        for (const candidate of iceCandidateQueueRef.current) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn("[WebRTC Viewer] Failed to add queued ICE candidate:", e);
          }
        }
        iceCandidateQueueRef.current = [];
      }
    } catch (err) {
      console.error("[WebRTC Viewer] Error setting remote description:", err);
      setError("VIEWER_CONNECTION_FAILED");
    }
  }, []);

  // Handle incoming ICE candidate from broadcaster (with queuing)
  const handleIceCandidate = useCallback(async (candidate: RTCIceCandidateInit) => {
    if (!pcRef.current) return;

    if (pcRef.current.remoteDescription) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
        console.log("[WebRTC Viewer] Added ICE candidate from broadcaster");
      } catch (err) {
        console.error("[WebRTC Viewer] Error adding ICE candidate:", err);
      }
    } else {
      // Queue until remoteDescription is set
      iceCandidateQueueRef.current.push(candidate);
      console.log(`[WebRTC Viewer] 🧊 Queued ICE candidate (${iceCandidateQueueRef.current.length} total)`);
    }
  }, []);

  // Connect to broadcaster
  const connect = useCallback(async () => {
    if (isConnectingRef.current || isConnectedRef.current) return;

    setIsConnecting(true);
    isConnectingRef.current = true;
    setError(null);
    remoteDescriptionSetRef.current = false;
    answerSentRef.current = false;

    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;

    console.log(`[WebRTC Viewer] Connecting with session ${sessionId}`);

    // Create peer connection with TURN support
    const iceConfig = await getIceServers();
    const pc = new RTCPeerConnection(iceConfig);
    pcRef.current = pc;

    // Add transceiver for receiving video
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    // Handle incoming stream — debounce onStream to avoid rapid play() calls
    const pendingTracksRef = { audio: false, video: false };
    let streamDeliverTimer: ReturnType<typeof setTimeout> | null = null;

    const deliverStream = () => {
      if (streamDeliverTimer) clearTimeout(streamDeliverTimer);
      streamDeliverTimer = setTimeout(() => {
        if (streamRef.current) {
          // Wrap to force React re-render
          const wrapped = new MediaStream(streamRef.current.getTracks());
          streamRef.current = wrapped;
          console.log("[WebRTC Viewer] 📤 Delivering stream to consumer");
          onStream?.(wrapped);
        }
      }, 100);
    };

    pc.ontrack = (event) => {
      console.log("[WebRTC Viewer] Received track:", event.track.kind);
      
      let stream: MediaStream;
      if (event.streams && event.streams[0]) {
        stream = event.streams[0];
      } else {
        console.log("[WebRTC Viewer] ⚠️ event.streams empty, creating manual MediaStream");
        if (!streamRef.current) {
          stream = new MediaStream();
        } else {
          stream = streamRef.current;
        }
        stream.addTrack(event.track);
      }

      streamRef.current = stream;

      // Wait for unmute before delivering to avoid AbortError from premature play()
      if (event.track.muted) {
        event.track.addEventListener("unmute", () => {
          console.log(`[WebRTC Viewer] ✅ Track unmuted: ${event.track.kind}`);
          pendingTracksRef[event.track.kind as "audio" | "video"] = true;
          deliverStream();
        }, { once: true });
      } else {
        pendingTracksRef[event.track.kind as "audio" | "video"] = true;
        deliverStream();
      }
    };

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log("[WebRTC Viewer] Sending ICE candidate");
        await supabaseShared.from("webrtc_signaling").insert({
          device_id: deviceId,
          session_id: sessionId,
          type: "ice-candidate",
          sender_type: "viewer",
          data: { candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Viewer] Connection state: ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        setIsConnected(true);
        isConnectedRef.current = true;
        setIsConnecting(false);
        isConnectingRef.current = false;
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setIsConnected(false);
        isConnectedRef.current = false;
        setError("VIEWER_DISCONNECTED");
      }
    };

    // Subscribe to signaling channel
    const channel = supabaseShared
      .channel(`webrtc-viewer-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "webrtc_signaling",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload) => {
          const record = payload.new as {
            type: string;
            sender_type: string;
            data: any;
          };

          // Only process messages from broadcaster
          if (record.sender_type !== "broadcaster") return;

          if (record.type === "answer") {
            await handleAnswer(record.data.sdp);
          } else if (record.type === "ice-candidate") {
            await handleIceCandidate(record.data.candidate);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    // Create and send offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      // Send SDP as plain object with type and sdp string
      await supabaseShared.from("webrtc_signaling").insert({
        device_id: deviceId,
        session_id: sessionId,
        type: "offer",
        sender_type: "viewer",
        data: { sdp: { type: offer.type, sdp: offer.sdp } },
      });

      console.log("[WebRTC Viewer] Sent offer");

      // Timeout for connection
      setTimeout(() => {
        if (!isConnectedRef.current && isConnectingRef.current) {
          setError("VIEWER_CAMERA_NOT_ON");
          setIsConnecting(false);
          isConnectingRef.current = false;
          // Inline cleanup instead of calling disconnect to avoid circular dep
          if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
          iceCandidateQueueRef.current = [];
          if (channelRef.current) { supabaseShared.removeChannel(channelRef.current); channelRef.current = null; }
          if (sessionIdRef.current) {
            supabaseShared.from("webrtc_signaling").delete().eq("session_id", sessionIdRef.current);
          }
          streamRef.current = null;
        }
      }, 15000);
    } catch (err) {
      console.error("[WebRTC Viewer] Error creating offer:", err);
      setError("VIEWER_CONNECTION_FAILED");
      setIsConnecting(false);
      isConnectingRef.current = false;
    }
  }, [deviceId, generateSessionId, handleAnswer, handleIceCandidate, onStream]);

  // Disconnect from broadcaster
  const disconnect = useCallback(async () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    iceCandidateQueueRef.current = [];

    if (channelRef.current) {
      await supabaseShared.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Clean up signaling data
    if (sessionIdRef.current) {
      await supabaseShared
        .from("webrtc_signaling")
        .delete()
        .eq("session_id", sessionIdRef.current);
    }

    streamRef.current = null;
    setIsConnected(false);
    isConnectedRef.current = false;
    setIsConnecting(false);
    isConnectingRef.current = false;
    remoteDescriptionSetRef.current = false;
    answerSentRef.current = false;
    console.log("[WebRTC Viewer] Disconnected");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnecting,
    isConnected,
    error,
    stream: streamRef.current,
    connect,
    disconnect,
  };
}
