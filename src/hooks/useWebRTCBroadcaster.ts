import { useState, useRef, useCallback, useEffect } from "react";
import { supabaseShared } from "@/lib/supabase";
import { updateDeviceViaEdge } from "@/lib/deviceApi";
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
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
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

// ── Direct Supabase signaling helpers (no Edge Function dependency) ──

async function fetchSignaling(deviceId: string, type?: string, senderType?: string) {
  let query = supabaseShared
    .from("webrtc_signaling")
    .select("*")
    .eq("device_id", deviceId);
  if (type) query = query.eq("type", type);
  if (senderType) query = query.eq("sender_type", senderType);

  const { data, error } = await query;
  if (error) {
    console.warn("[Broadcaster] fetchSignaling error:", error.message);
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
    console.error("[Broadcaster] insertSignaling error:", error.message);
  }
}

async function deleteSignaling(deviceId: string, senderType?: string) {
  let query = supabaseShared
    .from("webrtc_signaling")
    .delete()
    .eq("device_id", deviceId);
  if (senderType) query = query.eq("sender_type", senderType);

  const { error, count } = await query;
  if (error) {
    console.warn("[Broadcaster] deleteSignaling error:", error.message);
  } else {
    console.log(`[Broadcaster] 🧹 Deleted signaling for ${deviceId} (sender: ${senderType || 'all'})`);
  }
}

export function useWebRTCBroadcaster({ deviceId }: UseWebRTCBroadcasterOptions) {
  const [isBroadcasting, setIsBroadcasting] = useState(false);
  const [viewerCount, setViewerCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const streamRef = useRef<MediaStream | null>(null);
  const peersRef = useRef<Map<string, PeerConnection>>(new Map());
  const channelRef = useRef<RealtimeChannel | null>(null);
  const processedViewerJoinsRef = useRef<Set<string>>(new Set());
  const processedAnswersRef = useRef<Set<string>>(new Set());
  const iceCandidateQueueRef = useRef<Map<string, RTCIceCandidateInit[]>>(new Map());
  const deviceIdRef = useRef(deviceId);
  const pollingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const creatingPeerRef = useRef<Set<string>>(new Set()); // Mutex for peer creation
  const disconnectTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map()); // Grace period timers

  useEffect(() => {
    deviceIdRef.current = deviceId;
  }, [deviceId]);

  const cleanupPeer = useCallback((sessionId: string) => {
    // Clear any pending disconnect timer
    const timer = disconnectTimersRef.current.get(sessionId);
    if (timer) {
      clearTimeout(timer);
      disconnectTimersRef.current.delete(sessionId);
    }

    const peer = peersRef.current.get(sessionId);
    if (peer) {
      peer.pc.close();
      peersRef.current.delete(sessionId);
      creatingPeerRef.current.delete(sessionId);
      // Also remove from processed sets so session can be retried if needed
      processedViewerJoinsRef.current.delete(sessionId);
      processedAnswersRef.current.delete(sessionId);
      iceCandidateQueueRef.current.delete(sessionId);
      setViewerCount(peersRef.current.size);
      console.log(`[Broadcaster] ❌ Peer ${sessionId} cleaned up`);
      
      // Clean up signaling records for this session asynchronously
      supabaseShared.from("webrtc_signaling").delete()
        .eq("session_id", sessionId)
        .then(({ error }) => {
          if (error) console.warn("[Broadcaster] Failed to clean signaling for", sessionId);
          else console.log(`[Broadcaster] 🧹 Signaling cleaned for ${sessionId}`);
        });
    }
  }, []);

  // Proactively clean up all dead/failed peers
  const cleanupDeadPeers = useCallback(() => {
    let cleaned = 0;
    const deadStates = ["failed", "closed"];
    peersRef.current.forEach((peer, sessionId) => {
      if (deadStates.includes(peer.pc.connectionState)) {
        cleanupPeer(sessionId);
        cleaned++;
      }
    });
    if (cleaned > 0) {
      console.log(`[Broadcaster] 🧹 Cleaned ${cleaned} dead peers`);
    }
    return cleaned;
  }, [cleanupPeer]);

  const createPeerConnectionAndOffer = useCallback(async (sessionId: string) => {
    const currentDeviceId = deviceIdRef.current;

    if (!streamRef.current) {
      console.error("[Broadcaster] No stream available");
      return null;
    }

    // Mutex: prevent concurrent creation for the same session
    if (creatingPeerRef.current.has(sessionId)) {
      console.log(`[Broadcaster] ⏭️ Already creating peer for ${sessionId}`);
      return null;
    }

    if (peersRef.current.has(sessionId)) {
      console.log(`[Broadcaster] Peer ${sessionId} already exists`);
      return peersRef.current.get(sessionId)!.pc;
    }

    creatingPeerRef.current.add(sessionId);
    console.log(`[Broadcaster] Creating peer connection for ${sessionId}`);

    // Clear any pending disconnect timer for this session (reconnection case)
    const existingTimer = disconnectTimersRef.current.get(sessionId);
    if (existingTimer) {
      clearTimeout(existingTimer);
      disconnectTimersRef.current.delete(sessionId);
    }

    const pc = new RTCPeerConnection(ICE_SERVERS);

    const tracks = streamRef.current.getTracks();
    console.log(`[Broadcaster] 📹 Adding ${tracks.length} tracks`);
    tracks.forEach((track) => {
      pc.addTrack(track, streamRef.current!);
    });

    pc.onicecandidate = async (event) => {
      if (event.candidate) {
        await insertSignaling({
          device_id: currentDeviceId,
          session_id: sessionId,
          type: "ice-candidate",
          sender_type: "broadcaster",
          data: { candidate: event.candidate.toJSON() },
        });
      }
    };

    // 🆕 ICE 연결 시 키프레임 강제 생성 — 트랙 토글 (가장 확실한 방법)
    pc.oniceconnectionstatechange = () => {
      console.log(`[Broadcaster] [${sessionId.slice(-8)}] ICE state: ${pc.iceConnectionState}`);
      
      if (pc.iceConnectionState === "connected") {
        console.log(`[Broadcaster] [${sessionId.slice(-8)}] 🔥 뷰어 ICE 연결! Track Toggle로 키프레임 강제 생성`);
        
        const senders = pc.getSenders();
        const videoSender = senders.find(s => s.track && s.track.kind === "video");
        
        if (videoSender && videoSender.track && videoSender.track.readyState === "live") {
          const track = videoSender.track;
          // 트랙을 1초 껐다 켜기 → 인코더 확실히 리셋 → I-Frame 발생
          track.enabled = false;
          setTimeout(() => {
            track.enabled = true;
            console.log(`[Broadcaster] [${sessionId.slice(-8)}] ✅ Keyframe forced via track toggle (1000ms)`);
            // 추가: 화질 설정도 건드려서 인코더를 한번 더 자극
            const constraints = track.getConstraints();
            track.applyConstraints({ ...constraints, frameRate: 30 })
              .catch(e => console.warn(`[Broadcaster] [${sessionId.slice(-8)}] applyConstraints after toggle:`, e));
          }, 1000);
        }
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[Broadcaster] [${sessionId.slice(-8)}] Connection state: ${pc.connectionState}`);
      
      if (pc.connectionState === "connected") {
        // Clear any pending disconnect timer — connection recovered
        const timer = disconnectTimersRef.current.get(sessionId);
        if (timer) {
          clearTimeout(timer);
          disconnectTimersRef.current.delete(sessionId);
          console.log(`[Broadcaster] [${sessionId.slice(-8)}] ✅ Connection recovered from disconnected`);
        }
      } else if (pc.connectionState === "disconnected") {
        // "disconnected" is NOT terminal — WebRTC can auto-recover
        // Give it 10 seconds grace period before cleanup
        console.log(`[Broadcaster] [${sessionId.slice(-8)}] ⚠️ Disconnected — waiting 10s for recovery...`);
        const timer = setTimeout(() => {
          disconnectTimersRef.current.delete(sessionId);
          const currentPeer = peersRef.current.get(sessionId);
          if (currentPeer && currentPeer.pc.connectionState !== "connected") {
            console.log(`[Broadcaster] [${sessionId.slice(-8)}] ❌ No recovery after 10s — cleaning up`);
            cleanupPeer(sessionId);
          }
        }, 10000);
        disconnectTimersRef.current.set(sessionId, timer);
      } else if (pc.connectionState === "failed") {
        // "failed" IS terminal — cleanup immediately
        cleanupPeer(sessionId);
      }
    };

    peersRef.current.set(sessionId, { sessionId, pc });
    creatingPeerRef.current.delete(sessionId);
    setViewerCount(peersRef.current.size);

    try {
      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);

      await insertSignaling({
        device_id: currentDeviceId,
        session_id: sessionId,
        type: "offer",
        sender_type: "broadcaster",
        data: { sdp: { type: offer.type, sdp: offer.sdp } },
      });

      console.log(`[Broadcaster] ✅ Sent offer to ${sessionId}`);
    } catch (err) {
      console.error("[Broadcaster] Error creating offer:", err);
      cleanupPeer(sessionId);
      return null;
    }

    return pc;
  }, [cleanupPeer]);

  const handleAnswer = useCallback(async (sessionId: string, answerData: any) => {
    if (processedAnswersRef.current.has(sessionId)) return;

    const peer = peersRef.current.get(sessionId);
    if (!peer) return;
    if (peer.pc.remoteDescription) return;

    console.log(`[Broadcaster] Processing answer from ${sessionId}`);
    processedAnswersRef.current.add(sessionId);

    try {
      const sdp = typeof answerData === "string"
        ? answerData
        : answerData?.sdp || answerData;
      const sdpString = typeof sdp === "string" ? sdp : sdp?.sdp;

      await peer.pc.setRemoteDescription(
        new RTCSessionDescription({ type: "answer", sdp: sdpString })
      );
      console.log(`[Broadcaster] ✅ Remote description set for ${sessionId}`);

      // Flush queued ICE candidates
      const queued = iceCandidateQueueRef.current.get(sessionId) || [];
      for (const candidate of queued) {
        try {
          await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
        } catch (e) {
          console.warn("[Broadcaster] Failed to add queued ICE:", e);
        }
      }
      iceCandidateQueueRef.current.delete(sessionId);
    } catch (err) {
      console.error("[Broadcaster] ❌ Error setting remote description:", err);
      processedAnswersRef.current.delete(sessionId);
      cleanupPeer(sessionId);
    }
  }, [cleanupPeer]);

  const handleIceCandidate = useCallback(async (sessionId: string, candidate: RTCIceCandidateInit) => {
    const peer = peersRef.current.get(sessionId);
    if (!peer) return;

    if (peer.pc.remoteDescription) {
      try {
        await peer.pc.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[Broadcaster] Error adding ICE:", err);
      }
    } else {
      if (!iceCandidateQueueRef.current.has(sessionId)) {
        iceCandidateQueueRef.current.set(sessionId, []);
      }
      iceCandidateQueueRef.current.get(sessionId)!.push(candidate);
    }
  }, []);

  // Poll for viewer signals (answers + ICE candidates from viewer)
  const pollViewerSignals = useCallback(async () => {
    const currentDeviceId = deviceIdRef.current;
    if (!streamRef.current) return;

    // Proactively clean up dead peers before processing new signals
    cleanupDeadPeers();

    // Check if stream tracks are still alive
    const activeTracks = streamRef.current.getTracks().filter(t => t.readyState === "live");
    if (activeTracks.length === 0) {
      console.warn("[Broadcaster] ⚠️ All stream tracks ended — stream is stale, requesting restart");
      window.dispatchEvent(new CustomEvent("broadcast-needs-restart"));
      return;
    }

    // Check if video track is muted (producing no frames)
    const videoTrack = streamRef.current.getVideoTracks()[0];
    const isVideoStale = videoTrack && (videoTrack.muted || !videoTrack.enabled);

    try {
      // 1. Check for new viewer-joins (with mutex guard)
      const joins = await fetchSignaling(currentDeviceId, "viewer-join", "viewer");
      
      // Detect new unprocessed viewer-joins
      const newJoins = joins.filter(join => 
        !processedViewerJoinsRef.current.has(join.session_id) &&
        !peersRef.current.has(join.session_id) &&
        !creatingPeerRef.current.has(join.session_id)
      );

      // Only restart if video track is actually stale (muted/disabled),
      // NOT just because there are no active peers (that's normal for first viewer)
      if (newJoins.length > 0 && isVideoStale) {
        console.log(`[Broadcaster] 🔄 New viewer detected with stale video track — requesting full restart`);
        window.dispatchEvent(new CustomEvent("broadcast-needs-restart"));
        return;
      }

      for (const join of newJoins) {
        const sid = join.session_id;
        processedViewerJoinsRef.current.add(sid);
        console.log(`[Broadcaster] 👋 New viewer (poll): ${sid}`);
        await createPeerConnectionAndOffer(sid);
      }

      // 2. Check for answers
      const answers = await fetchSignaling(currentDeviceId, "answer", "viewer");
      for (const ans of answers) {
        await handleAnswer(ans.session_id, ans.data?.sdp);
      }

      // 3. Check for ICE candidates from viewer
      const candidates = await fetchSignaling(currentDeviceId, "ice-candidate", "viewer");
      for (const cand of candidates) {
        if (cand.data?.candidate) {
          await handleIceCandidate(cand.session_id, cand.data.candidate);
        }
      }
    } catch (e) {
      console.warn("[Broadcaster] Poll error:", e);
    }
  }, [createPeerConnectionAndOffer, handleAnswer, handleIceCandidate, cleanupDeadPeers]);

  const startBroadcasting = useCallback(async (stream: MediaStream) => {
    const currentDeviceId = deviceIdRef.current;

    streamRef.current = stream;
    setError(null);

    // Clear ALL old signaling data (both broadcaster and viewer)
    await deleteSignaling(currentDeviceId);

    processedViewerJoinsRef.current.clear();
    processedAnswersRef.current.clear();
    iceCandidateQueueRef.current.clear();

    // Set broadcasting state immediately
    setIsBroadcasting(true);

    // Insert broadcaster-ready signal so smartphone viewer knows to reconnect
    await insertSignaling({
      device_id: currentDeviceId,
      session_id: `ready-${Date.now()}`,
      type: "broadcaster-ready",
      sender_type: "broadcaster",
      data: { timestamp: Date.now() },
    });

    console.log("[Broadcaster] ✅ Broadcasting started + broadcaster-ready signal sent");

    // Also try Realtime subscription as bonus (may or may not work)
    const channelName = `webrtc-${currentDeviceId}`;
    const existingChannel = supabaseShared
      .getChannels()
      .find((ch) => ch.topic === `realtime:${channelName}`);
    if (existingChannel) {
      await supabaseShared.removeChannel(existingChannel);
    }

    const channel = supabaseShared
      .channel(channelName)
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
          if (record.sender_type !== "viewer") return;

          if (record.type === "viewer-join") {
            const sid = record.session_id;
            if (
              !processedViewerJoinsRef.current.has(sid) &&
              !peersRef.current.has(sid) &&
              !creatingPeerRef.current.has(sid)
            ) {
              processedViewerJoinsRef.current.add(sid);
              console.log(`[Broadcaster] 👋 Realtime viewer: ${sid}`);
              await createPeerConnectionAndOffer(sid);
            }
          } else if (record.type === "answer") {
            await handleAnswer(record.session_id, record.data?.sdp);
          } else if (record.type === "ice-candidate") {
            await handleIceCandidate(record.session_id, record.data?.candidate);
          }
        }
      )
      .subscribe((status) => {
        console.log(`[Broadcaster] Realtime channel: ${status}`);
      });

    channelRef.current = channel;

    // Do NOT immediately poll — wait for viewer to send fresh viewer-join
    // after receiving broadcaster-ready. Start polling after a grace period.
    console.log("[Broadcaster] ⏳ Waiting 4s for viewer to send fresh viewer-join...");
    
    // Delay BOTH the first poll and the interval start
    setTimeout(() => {
      // Double-check we're still broadcasting before starting polls
      if (!streamRef.current) return;
      
      console.log("[Broadcaster] ▶️ Starting polling for viewer signals");
      pollViewerSignals();
      pollingIntervalRef.current = setInterval(pollViewerSignals, 3000);
    }, 4000);
  }, [createPeerConnectionAndOffer, handleAnswer, handleIceCandidate, pollViewerSignals]);

  const stopBroadcasting = useCallback(async () => {
    const currentDeviceId = deviceIdRef.current;

    if (pollingIntervalRef.current) {
      clearInterval(pollingIntervalRef.current);
      pollingIntervalRef.current = null;
    }

    // Clear all disconnect grace period timers
    disconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
    disconnectTimersRef.current.clear();

    const wasActive = channelRef.current !== null || peersRef.current.size > 0;

    peersRef.current.forEach((peer) => peer.pc.close());
    peersRef.current.clear();
    creatingPeerRef.current.clear();
    processedViewerJoinsRef.current.clear();
    processedAnswersRef.current.clear();
    iceCandidateQueueRef.current.clear();

    if (channelRef.current) {
      await supabaseShared.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (wasActive) {
      await deleteSignaling(currentDeviceId);
    }

    streamRef.current = null;
    setIsBroadcasting(false);
    setViewerCount(0);
    console.log("[Broadcaster] Stopped broadcasting");
  }, []);

  useEffect(() => {
    return () => {
      if (pollingIntervalRef.current) clearInterval(pollingIntervalRef.current);
      if (channelRef.current) supabaseShared.removeChannel(channelRef.current);
      disconnectTimersRef.current.forEach((timer) => clearTimeout(timer));
      disconnectTimersRef.current.clear();
      peersRef.current.forEach((peer) => peer.pc.close());
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
