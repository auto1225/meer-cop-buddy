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
  const deviceIdRef = useRef(deviceId);

  // Keep deviceId ref updated
  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

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

  // Create peer connection for a viewer and send offer
  const createPeerConnectionAndOffer = useCallback(async (sessionId: string) => {
    const currentDeviceId = deviceIdRef.current;
    
    if (!streamRef.current) {
      console.error("[WebRTC Broadcaster] No stream available");
      return null;
    }

    // Check if peer already exists
    if (peersRef.current.has(sessionId)) {
      console.log(`[WebRTC Broadcaster] Peer ${sessionId} already exists`);
      return peersRef.current.get(sessionId)!.pc;
    }

    console.log(`[WebRTC Broadcaster] Creating peer connection for ${sessionId}`);
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
          device_id: currentDeviceId,
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

    // Create and send offer
    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await supabaseShared.from("webrtc_signaling").insert({
        device_id: currentDeviceId,
        session_id: sessionId,
        type: "offer",
        sender_type: "broadcaster",
        data: { sdp: offer },
      });

      console.log(`[WebRTC Broadcaster] Sent offer to ${sessionId}`);
    } catch (err) {
      console.error("[WebRTC Broadcaster] Error creating offer:", err);
      cleanupPeer(sessionId);
      return null;
    }

    return pc;
  }, [cleanupPeer]);

  // Handle incoming answer from viewer
  const handleAnswer = useCallback(async (sessionId: string, answer: RTCSessionDescriptionInit) => {
    console.log(`[WebRTC Broadcaster] Received answer from ${sessionId}`);
    
    const peer = peersRef.current.get(sessionId);
    if (peer) {
      try {
        await peer.pc.setRemoteDescription(new RTCSessionDescription(answer));
        console.log(`[WebRTC Broadcaster] Set remote description for ${sessionId}`);
      } catch (err) {
        console.error("[WebRTC Broadcaster] Error setting remote description:", err);
        cleanupPeer(sessionId);
      }
    }
  }, [cleanupPeer]);

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
    const currentDeviceId = deviceIdRef.current;
    
    streamRef.current = stream;
    setError(null);

    // Clear old signaling data for this device
    await supabaseShared
      .from("webrtc_signaling")
      .delete()
      .eq("device_id", currentDeviceId);

    console.log(`[WebRTC Broadcaster] Subscribing to signaling for device: ${currentDeviceId}`);

    // Subscribe to signaling channel
    const channel = supabaseShared
      .channel(`webrtc-${currentDeviceId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "webrtc_signaling",
          filter: `device_id=eq.${currentDeviceId}`,
        },
        async (payload) => {
          console.log(`[WebRTC Broadcaster] Received signaling payload:`, payload);
          
          const record = payload.new as {
            session_id: string;
            type: string;
            sender_type: string;
            data: any;
          };

          // Only process messages from viewers
          if (record.sender_type !== "viewer") return;

          if (record.type === "viewer-join") {
            console.log(`[WebRTC Broadcaster] Viewer joined: ${record.session_id}`);
            await createPeerConnectionAndOffer(record.session_id);
          } else if (record.type === "answer") {
            await handleAnswer(record.session_id, record.data.sdp);
          } else if (record.type === "ice-candidate") {
            await handleIceCandidate(record.session_id, record.data.candidate);
          }
        }
      )
      .subscribe((status, err) => {
        console.log(`[WebRTC Broadcaster] Channel status: ${status}`, err || '');
        if (status === 'CHANNEL_ERROR') {
          console.error('[WebRTC Broadcaster] Channel error:', err);
        }
      });

    channelRef.current = channel;
    setIsBroadcasting(true);
    console.log("[WebRTC Broadcaster] Started broadcasting");
  }, [createPeerConnectionAndOffer, handleAnswer, handleIceCandidate]);

  // Stop broadcasting
  const stopBroadcasting = useCallback(async () => {
    const currentDeviceId = deviceIdRef.current;
    
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
      .eq("device_id", currentDeviceId);

    streamRef.current = null;
    setIsBroadcasting(false);
    setViewerCount(0);
    console.log("[WebRTC Broadcaster] Stopped broadcasting");
  }, []);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (channelRef.current) {
        supabaseShared.removeChannel(channelRef.current);
      }
      peersRef.current.forEach((peer) => {
        peer.pc.close();
      });
    };
  }, []);

  return {
    isBroadcasting,
    viewerCount,
    error,
    startBroadcasting,
    stopBroadcasting,
  };
}
