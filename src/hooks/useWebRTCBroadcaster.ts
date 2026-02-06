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
  const processedViewerJoinsRef = useRef<Set<string>>(new Set());
  const processedAnswersRef = useRef<Set<string>>(new Set()); // Track processed answers
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

    // Add local stream tracks with logging
    const tracks = streamRef.current.getTracks();
    console.log(`[WebRTC Broadcaster] 📹 Adding ${tracks.length} tracks to peer connection`);
    tracks.forEach((track) => {
      console.log(`[WebRTC Broadcaster] 📹 Adding track: ${track.kind} (${track.label}) enabled=${track.enabled} readyState=${track.readyState}`);
      pc.addTrack(track, streamRef.current!);
    });

    // Handle ICE candidates
    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        const candidateJson = event.candidate.toJSON();
        console.log("[WebRTC Broadcaster] Sending ICE candidate:", candidateJson.candidate?.substring(0, 50));
        await supabaseShared.from("webrtc_signaling").insert({
          device_id: currentDeviceId,
          session_id: sessionId,
          type: "ice-candidate",
          sender_type: "broadcaster",
          data: { candidate: candidateJson },
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

      // Send SDP as plain object with type and sdp string
      await supabaseShared.from("webrtc_signaling").insert({
        device_id: currentDeviceId,
        session_id: sessionId,
        type: "offer",
        sender_type: "broadcaster",
        data: { sdp: { type: offer.type, sdp: offer.sdp } },
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
  const handleAnswer = useCallback(async (sessionId: string, answerData: any) => {
    // Skip duplicate answers
    if (processedAnswersRef.current.has(sessionId)) {
      console.log(`[WebRTC Broadcaster] ⏭️ Skipping duplicate answer for ${sessionId}`);
      return;
    }
    
    const peer = peersRef.current.get(sessionId);
    if (!peer) {
      console.log(`[WebRTC Broadcaster] No peer found for ${sessionId}`);
      return;
    }
    
    // Check if remote description is already set
    if (peer.pc.remoteDescription) {
      console.log(`[WebRTC Broadcaster] ⏭️ Remote description already set for ${sessionId}`);
      return;
    }
    
    console.log(`[WebRTC Broadcaster] Processing answer from ${sessionId}`, answerData);
    processedAnswersRef.current.add(sessionId);
    
    try {
      // Handle both formats: { type, sdp } or just sdp string
      const sdp = typeof answerData === 'string' 
        ? answerData 
        : (answerData?.sdp || answerData);
      
      const sdpString = typeof sdp === 'string' ? sdp : sdp?.sdp;
      
      console.log(`[WebRTC Broadcaster] Extracted SDP type:`, typeof sdpString, sdpString?.substring(0, 50));
      
      await peer.pc.setRemoteDescription(new RTCSessionDescription({
        type: "answer",
        sdp: sdpString,
      }));
      console.log(`[WebRTC Broadcaster] ✅ Set remote description for ${sessionId}`);
    } catch (err) {
      console.error("[WebRTC Broadcaster] ❌ Error setting remote description:", err);
      processedAnswersRef.current.delete(sessionId); // Allow retry on error
      cleanupPeer(sessionId);
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
          const record = payload.new as {
            session_id: string;
            type: string;
            sender_type: string;
            data: any;
          };

          console.log(`[WebRTC Broadcaster] Received signaling:`, {
            type: record.type,
            sender_type: record.sender_type,
            session_id: record.session_id,
            hasData: !!record.data,
            dataKeys: record.data ? Object.keys(record.data) : [],
          });

          // Only process messages from viewers
          if (record.sender_type !== "viewer") {
            console.log(`[WebRTC Broadcaster] Ignoring non-viewer message (sender_type: ${record.sender_type})`);
            return;
          }

          if (record.type === "viewer-join") {
            const viewerSessionId = record.session_id;
            
            // 🔒 중복 방지 로직 - 순서 중요!
            // 1. 이미 처리 중인 viewer-join 스킵
            if (processedViewerJoinsRef.current.has(viewerSessionId)) {
              console.log(`[WebRTC Broadcaster] ⏭️ Skipping duplicate viewer-join: ${viewerSessionId}`);
              return;
            }
            
            // 2. 이미 연결된 viewer 스킵
            if (peersRef.current.has(viewerSessionId)) {
              console.log(`[WebRTC Broadcaster] ⏭️ Viewer already has connection: ${viewerSessionId}`);
              return;
            }
            
            // 3. 먼저 Set에 추가하여 동시 호출 방지
            processedViewerJoinsRef.current.add(viewerSessionId);
            
            console.log(`[WebRTC Broadcaster] 👋 Viewer joined: ${viewerSessionId}`);
            await createPeerConnectionAndOffer(viewerSessionId);
          } else if (record.type === "answer") {
            console.log(`[WebRTC Broadcaster] ✅ Received answer from viewer: ${record.session_id}`, record.data);
            await handleAnswer(record.session_id, record.data.sdp);
          } else if (record.type === "ice-candidate") {
            console.log(`[WebRTC Broadcaster] ✅ Received ICE candidate from viewer: ${record.session_id}`);
            await handleIceCandidate(record.session_id, record.data.candidate);
          } else {
            console.log(`[WebRTC Broadcaster] Unknown message type: ${record.type}`);
          }
        }
      )
      .subscribe(async (status, err) => {
        console.log(`[WebRTC Broadcaster] Channel status: ${status}`, err || '');
        if (status === 'SUBSCRIBED') {
          // Only mark as ready AFTER subscription is confirmed
          setIsBroadcasting(true);
          
          // Update device to signal we're ready for viewers
          await supabaseShared
            .from("devices")
            .update({ 
              is_camera_connected: true,
              updated_at: new Date().toISOString()
            })
            .eq("id", currentDeviceId);
            
          console.log("[WebRTC Broadcaster] Ready for viewers - is_camera_connected set to true");
        } else if (status === 'CHANNEL_ERROR') {
          console.error('[WebRTC Broadcaster] Channel error:', err);
          setError('Failed to subscribe to signaling channel');
        }
      });

    channelRef.current = channel;
    console.log("[WebRTC Broadcaster] Started broadcasting (waiting for SUBSCRIBED)");
  }, [createPeerConnectionAndOffer, handleAnswer, handleIceCandidate]);

  // Stop broadcasting
  const stopBroadcasting = useCallback(async () => {
    const currentDeviceId = deviceIdRef.current;
    
    // Close all peer connections
    peersRef.current.forEach((peer) => {
      peer.pc.close();
    });
    peersRef.current.clear();
    processedViewerJoinsRef.current.clear();
    processedAnswersRef.current.clear(); // Clear processed answers

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
