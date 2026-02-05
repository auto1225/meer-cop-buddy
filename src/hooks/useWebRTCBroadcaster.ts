import { useState, useRef, useCallback, useEffect } from "react";
import { supabaseShared } from "@/lib/supabase";
import { RealtimeChannel } from "@supabase/supabase-js";

interface UseWebRTCBroadcasterOptions {
  deviceId: string;
}

interface PeerConnection {
  sessionId: string;
  pc: RTCPeerConnection;
}

const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export function useWebRTCBroadcaster({ deviceId }: UseWebRTCBroadcasterOptions) {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);

  // Clean up a specific peer connection
  const cleanupPeer = useCallback((sessionId: string) => {
    const peer = peersRef.current.get(sessionId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(sessionId);
      setViewerCount(peersRef.current.size);
      console.log(`[WebRTC Broadcaster] Peer ${sessionId} disconnected`);
    }
  }, []);

  // Create peer connection for a viewer
  const createPeerConnection = useCallback(async (sessionId: string) => {
    if (!streamRef.current) {
      console.error("[WebRTC Broadcaster] No stream available");
      return null;
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    // Add local stream tracks
    streamRef.current.getTracks().forEach((track) => {
      pc.addTrack(track, streamRef.current!);
    });

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        console.log("[WebRTC Broadcaster] Sending ICE candidate");
        await supabaseShared.from("webrtc_signaling").insert({
          device_id: deviceId,
          session_id: sessionId,
          type: "ice-candidate",
          sender_type: "broadcaster",
          data: { candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Broadcaster] Connection state: ${pc.connectionState}`);
      if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        cleanupPeer(sessionId);
      }
    };

    peersRef.current.set(sessionId, { sessionId, pc });
    setViewerCount(peersRef.current.size);

    return pc;
  }, [deviceId, cleanupPeer]);

  // Handle incoming offer from viewer
  const handleOffer = useCallback(async (sessionId: string, offer: RTCSessionDescriptionInit) => {
    console.log(`[WebRTC Broadcaster] Received offer from ${sessionId}`);

    const pc = await createPeerConnection(sessionId);
    if (!pc) return;

    try {
      await pc.setRemoteDescription(new RTCSessionDescription(offer));
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);

      // Send answer
      await supabaseShared.from("webrtc_signaling").insert({
        device_id: deviceId,
        session_id: sessionId,
        type: "answer",
        sender_type: "broadcaster",
        data: { sdp: answer },
      });

      console.log(`[WebRTC Broadcaster] Sent answer to ${sessionId}`);
    } catch (err) {
      console.error("[WebRTC Broadcaster] Error handling offer:", err);
      cleanupPeer(sessionId);
    }
  }, [deviceId, createPeerConnection, cleanupPeer]);

  // Handle incoming ICE candidate from viewer
  const handleIceCandidate = useCallback(async (sessionId: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(sessionId);
    if (peer && peer.pc.remoteDescription) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        console.log(`[WebRTC Broadcaster] Added ICE candidate from ${sessionId}`);
      } catch (err) {
        console.error("[WebRTC Broadcaster] Error adding ICE candidate:", err);
      }
    }
  }, []);

  // Start broadcasting
  const startBroadcasting = useCallback(async (stream: MediaStream) => {
    if (isBroadcasting) return;

    streamRef.current = stream;
    setError(null);

    // Clear old signaling data for this device
    await supabaseShared
      .from("webrtc_signaling")
      .delete()
      .eq("device_id", deviceId);

    // Subscribe to signaling channel
    const channel = supabaseShared
      .channel(`webrtc-${deviceId}`)
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
            session_id: string;
            type: string;
            sender_type: string;
            data: any;
          };

          // Only process messages from viewers
          if (record.sender_type !== "viewer") return;

          if (record.type === "offer") {
            await handleOffer(record.session_id, record.data.sdp);
          } else if (record.type === "ice-candidate") {
            await handleIceCandidate(record.session_id, record.data.candidate);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;
    setIsBroadcasting(true);
    console.log("[WebRTC Broadcaster] Started broadcasting");
  }, [deviceId, isBroadcasting, handleOffer, handleIceCandidate]);

  // Stop broadcasting
  const stopBroadcasting = useCallback(async () => {
    // Close all peer connections
    peersRef.current.forEach((peer) => {
      peer.pc.close();
    });
    peersRef.current.clear();

    // Unsubscribe from channel
    if (channelRef.current) {
      await supabaseShared.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // Clear signaling data
    await supabaseShared
      .from("webrtc_signaling")
      .delete()
      .eq("device_id", deviceId);

    streamRef.current = null;
    setIsBroadcasting(false);
    setViewerCount(0);
    console.log("[WebRTC Broadcaster] Stopped broadcasting");
  }, [deviceId]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (isBroadcasting) {
        stopBroadcasting();
      }
    };
  }, [isBroadcasting, stopBroadcasting]);

  return {
    isBroadcasting,
    viewerCount,
    error,
    startBroadcasting,
    stopBroadcasting,
  };
}
