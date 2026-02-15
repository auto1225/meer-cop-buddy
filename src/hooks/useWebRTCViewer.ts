import { useState, useRef, useCallback, useEffect } from "react";
import { supabaseShared } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

interface UseWebRTCViewerOptions {
  deviceId: string;
  onStream?: (stream: MediaStream) => void;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
    // Free TURN servers for mobile NAT traversal
    {
      urls: "turn:openrelay.metered.ca:80",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
    {
      urls: "turn:openrelay.metered.ca:443?transport=tcp",
      username: "openrelayproject",
      credential: "openrelayproject",
    },
  ],
  iceCandidatePoolSize: 10,
};

export function useWebRTCViewer({ deviceId, onStream }: UseWebRTCViewerOptions) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const sessionIdRef = useRef<string>("");
  const streamRef = useRef<MediaStream | null>(null);
  const iceCandidateQueueRef = useRef<RTCIceCandidateInit[]>([]);

  // Generate unique session ID
  const generateSessionId = useCallback(() => {
    return `viewer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Handle incoming answer from broadcaster
  const handleAnswer = useCallback(async (answer: RTCSessionDescriptionInit) => {
    if (!pcRef.current) return;

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
      setError("연결에 실패했습니다");
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
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    setError(null);

    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;

    console.log(`[WebRTC Viewer] Connecting with session ${sessionId}`);

    // Create peer connection
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // Add transceiver for receiving video
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    // Handle incoming stream
    pc.ontrack = (event) => {
      console.log("[WebRTC Viewer] Received track:", event.track.kind);
      if (event.streams[0]) {
        streamRef.current = event.streams[0];
        onStream?.(event.streams[0]);
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
        setIsConnecting(false);
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setIsConnected(false);
        setError("연결이 끊어졌습니다");
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
        if (!isConnected && isConnecting) {
          setError("노트북 카메라가 켜져 있지 않습니다");
          setIsConnecting(false);
          disconnect();
        }
      }, 15000);
    } catch (err) {
      console.error("[WebRTC Viewer] Error creating offer:", err);
      setError("연결에 실패했습니다");
      setIsConnecting(false);
    }
  }, [deviceId, isConnecting, isConnected, generateSessionId, handleAnswer, handleIceCandidate, onStream]);

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
    setIsConnecting(false);
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
