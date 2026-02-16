# MeerCOP 스마트폰 앱 - WebRTC 실시간 카메라 뷰어 구현 가이드

## 개요

이 문서는 React Native 스마트폰 앱에서 노트북의 WebRTC 카메라 스트리밍을 수신하는 방법을 설명합니다.

## 필요한 패키지 설치

```bash
npm install react-native-webrtc
# 또는
yarn add react-native-webrtc

# iOS의 경우 추가 설정 필요
cd ios && pod install
```

## iOS 설정 (Info.plist)

```xml
<key>NSCameraUsageDescription</key>
<string>카메라 접근이 필요합니다</string>
<key>NSMicrophoneUsageDescription</key>
<string>마이크 접근이 필요합니다</string>
```

## Android 설정 (AndroidManifest.xml)

```xml
<uses-permission android:name="android.permission.CAMERA" />
<uses-permission android:name="android.permission.RECORD_AUDIO" />
<uses-permission android:name="android.permission.INTERNET" />
```

---

## WebRTC 뷰어 훅 구현

아래 코드를 `src/hooks/useWebRTCViewer.ts`로 저장하세요:

```typescript
import { useState, useRef, useCallback, useEffect } from "react";
import {
  RTCPeerConnection,
  RTCSessionDescription,
  RTCIceCandidate,
  MediaStream,
} from "react-native-webrtc";
import { supabase } from "../lib/supabase";

interface UseWebRTCViewerOptions {
  deviceId: string;
  onStream?: (stream: MediaStream) => void;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    // TURN 서버 (모바일 NAT 통과)
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
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  const sessionIdRef = useRef<string>("");
  const iceCandidateQueueRef = useRef<any[]>([]);
  const isConnectedRef = useRef(false);
  const isConnectingRef = useRef(false);
  const remoteDescriptionSetRef = useRef(false);
  const answerSentRef = useRef(false);
  // 스트림 변경 카운터 (React 리렌더링 강제)
  const streamVersionRef = useRef(0);

  const generateSessionId = useCallback(() => {
    return `viewer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // Answer/Offer의 remote description 처리 (중복 방지 — 이중 잠금)
  // ⚠️ 핵심: remoteDescriptionSetRef는 동기 플래그로 비동기 setRemoteDescription
  // 호출 전에 즉시 설정하여 Realtime 콜백 + 기존 offer 체크 두 경로에서의
  // 중복 실행을 완전히 차단합니다.
  const handleRemoteDescription = useCallback(async (sdp: any) => {
    if (!pcRef.current) return;

    // 이중 잠금: ref 플래그 + PeerConnection 상태 모두 체크
    if (remoteDescriptionSetRef.current) {
      console.log("[WebRTC Viewer] ⏭️ Remote description already set (flag), skipping");
      return;
    }
    if (pcRef.current.remoteDescription) {
      console.log("[WebRTC Viewer] ⏭️ Remote description already set (PC), skipping");
      remoteDescriptionSetRef.current = true;
      return;
    }

    // 즉시 잠금 (await 전에 설정하여 동시 호출 차단)
    remoteDescriptionSetRef.current = true;

    try {
      // Robust SDP parsing: 문자열 또는 중첩 객체 모두 지원
      let sdpObj = sdp;
      if (typeof sdp === "string") {
        sdpObj = JSON.parse(sdp);
      }
      if (sdpObj.sdp && typeof sdpObj.sdp === "object") {
        sdpObj = sdpObj.sdp; // 중첩된 { sdp: { type, sdp } } 형태 처리
      }

      const remoteDesc = new RTCSessionDescription(sdpObj);
      console.log(`[WebRTC Viewer] Setting remote description (SDP length: ${sdpObj.sdp?.length || 'N/A'})`);
      await pcRef.current.setRemoteDescription(remoteDesc);
      console.log("[WebRTC Viewer] ✅ Remote description 설정 완료");

      // 큐에 쌓인 ICE candidates 일괄 적용
      if (iceCandidateQueueRef.current.length > 0) {
        console.log(`[WebRTC Viewer] 🧊 Flushing ${iceCandidateQueueRef.current.length} queued ICE candidates`);
        for (const candidate of iceCandidateQueueRef.current) {
          try {
            await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
          } catch (e) {
            console.warn("[WebRTC Viewer] ICE candidate flush 실패:", e);
          }
        }
        iceCandidateQueueRef.current = [];
      }
    } catch (err) {
      console.error("[WebRTC Viewer] Remote description 설정 오류:", err);
      remoteDescriptionSetRef.current = false; // 재시도 가능하도록 리셋
      setError("연결에 실패했습니다");
    }
  }, []);

  // ICE Candidate 처리 (큐잉 지원)
  const handleIceCandidate = useCallback(async (candidate: any) => {
    if (!pcRef.current) return;

    if (pcRef.current.remoteDescription) {
      try {
        await pcRef.current.addIceCandidate(new RTCIceCandidate(candidate));
      } catch (err) {
        console.error("[WebRTC Viewer] ICE candidate 추가 오류:", err);
      }
    } else {
      // remoteDescription 설정 전 → 큐에 저장
      iceCandidateQueueRef.current.push(candidate);
      console.log(`[WebRTC Viewer] 🧊 ICE candidate 큐잉 (${iceCandidateQueueRef.current.length}개)`);
    }
  }, []);

  // 스트림 업데이트 헬퍼 (React 리렌더링 보장)
  const updateStream = useCallback((stream: MediaStream) => {
    streamVersionRef.current++;
    setRemoteStream(stream);
    onStream?.(stream);
    console.log(`[WebRTC Viewer] 📹 Stream updated (v${streamVersionRef.current}), tracks: ${stream.getTracks().length}`);
  }, [onStream]);

  const connect = useCallback(async () => {
    if (isConnectingRef.current || isConnectedRef.current) return;

    setIsConnecting(true);
    isConnectingRef.current = true;
    setError(null);
    remoteDescriptionSetRef.current = false;
    answerSentRef.current = false;
    iceCandidateQueueRef.current = [];

    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;

    console.log(`[WebRTC Viewer] 세션 ${sessionId}로 연결 시도`);

    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    // 🆕 트랙별 독립 MediaStream 생성 방식
    // event.streams[0]을 그대로 사용하면 재연결 시 모바일 브라우저가
    // "빈 껍데기 스트림"을 잡고 readyState: 0에 멈출 수 있습니다.
    // 대신 수신된 트랙으로 새 MediaStream을 직접 생성합니다.
    const receivedTracksRef: Record<string, any> = {};

    pc.ontrack = (event: any) => {
      console.log("[WebRTC Viewer] ✅ 트랙 수신:", event.track.kind);

      // 트랙 저장 (audio/video)
      receivedTracksRef[event.track.kind] = event.track;

      // unmute 대기 후 스트림 조립
      const assembleStream = () => {
        const tracks = Object.values(receivedTracksRef).filter(Boolean);
        if (tracks.length > 0) {
          // 🆕 핵심: 새로운 MediaStream을 직접 생성 (event.streams[0] 사용 금지)
          const freshStream = new MediaStream(tracks as MediaStreamTrack[]);
          updateStream(freshStream);
          console.log(`[WebRTC Viewer] 📤 새 MediaStream 생성 (${tracks.length}개 트랙)`);
        }
      };

      if (event.track.muted) {
        event.track.addEventListener("unmute", () => {
          console.log(`[WebRTC Viewer] ✅ Track unmuted: ${event.track.kind}`);
          assembleStream();
        }, { once: true });
      } else {
        assembleStream();
      }
    };

    // 스트림에 새 트랙 추가 감지
    pc.addEventListener?.("track", () => {}); // RN에서는 ontrack으로 충분

    pc.onicecandidate = async (event: any) => {
      if (event.candidate) {
        await supabase.from("webrtc_signaling").insert({
          device_id: deviceId,
          session_id: sessionId,
          type: "ice-candidate",
          sender_type: "viewer",
          data: { candidate: event.candidate.toJSON() },
        });
      }
    };

    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Viewer] 연결 상태: ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        setIsConnected(true);
        isConnectedRef.current = true;
        setIsConnecting(false);
        isConnectingRef.current = false;
      } else if (pc.connectionState === "disconnected" || pc.connectionState === "failed") {
        setIsConnected(false);
        isConnectedRef.current = false;
        setError("연결이 끊어졌습니다");
      }
    };

    const channel = supabase
      .channel(`webrtc-viewer-${sessionId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "webrtc_signaling",
          filter: `session_id=eq.${sessionId}`,
        },
        async (payload: any) => {
          const record = payload.new;
          if (record.sender_type !== "broadcaster") return;

          if (record.type === "answer" || record.type === "offer") {
            await handleRemoteDescription(record.data.sdp || record.data);
          } else if (record.type === "ice-candidate") {
            await handleIceCandidate(record.data.candidate);
          }
        }
      )
      .subscribe();

    channelRef.current = channel;

    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      await supabase.from("webrtc_signaling").insert({
        device_id: deviceId,
        session_id: sessionId,
        type: "offer",
        sender_type: "viewer",
        data: { sdp: { type: offer.type, sdp: offer.sdp } },
      });

      console.log("[WebRTC Viewer] Offer 전송 완료");

      setTimeout(() => {
        if (!isConnectedRef.current && isConnectingRef.current) {
          setError("노트북 카메라가 켜져 있지 않습니다");
          setIsConnecting(false);
          isConnectingRef.current = false;
          if (pcRef.current) { pcRef.current.close(); pcRef.current = null; }
          iceCandidateQueueRef.current = [];
          if (channelRef.current) { supabase.removeChannel(channelRef.current); channelRef.current = null; }
        }
      }, 15000);
    } catch (err) {
      console.error("[WebRTC Viewer] Offer 생성 오류:", err);
      setError("연결에 실패했습니다");
      setIsConnecting(false);
      isConnectingRef.current = false;
    }
  }, [deviceId, generateSessionId, handleRemoteDescription, handleIceCandidate, updateStream]);

  // ⚠️ 동기적으로 PeerConnection을 즉시 닫고 모든 상태를 초기화
  const disconnect = useCallback(async () => {
    // 1. PeerConnection 즉시 close (동기)
    if (pcRef.current) {
      pcRef.current.ontrack = null;
      pcRef.current.onicecandidate = null;
      pcRef.current.onconnectionstatechange = null;
      pcRef.current.close();
      pcRef.current = null;
    }
    iceCandidateQueueRef.current = [];

    // 2. Realtime 채널 해제
    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // 3. 시그널링 데이터 정리
    if (sessionIdRef.current) {
      await supabase
        .from("webrtc_signaling")
        .delete()
        .eq("session_id", sessionIdRef.current);
      sessionIdRef.current = "";
    }

    // 4. 모든 상태 플래그 리셋
    setRemoteStream(null);
    setIsConnected(false);
    isConnectedRef.current = false;
    setIsConnecting(false);
    isConnectingRef.current = false;
    remoteDescriptionSetRef.current = false;
    answerSentRef.current = false;
    console.log("[WebRTC Viewer] 연결 해제됨 (full cleanup)");
  }, []);

  // 🔄 재연결 함수 — disconnect → 디바운스 → connect 순서 보장
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const reconnect = useCallback(async () => {
    console.log("[WebRTC Viewer] 🔄 재연결 시작 — 기존 연결 정리 중...");

    // 이전 재연결 타이머 취소
    if (reconnectTimerRef.current) {
      clearTimeout(reconnectTimerRef.current);
      reconnectTimerRef.current = null;
    }

    // 1. 기존 연결 완전 정리
    await disconnect();

    // 2. 디바운스: 1초 대기 (좀비 시그널이 지나가도록)
    reconnectTimerRef.current = setTimeout(() => {
      reconnectTimerRef.current = null;
      console.log("[WebRTC Viewer] 🔄 디바운스 완료, 새 연결 시도");
      connect();
    }, 1000);
  }, [disconnect, connect]);

  useEffect(() => {
    return () => {
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      disconnect();
    };
  }, [disconnect]);

  return {
    isConnecting,
    isConnected,
    error,
    remoteStream,
    connect,
    disconnect,
    reconnect, // 🆕 재연결 함수 노출
  };
}
```

---

## 카메라 뷰어 컴포넌트 구현

아래 코드를 `src/components/CameraViewer.tsx`로 저장하세요:

```tsx
import React, { useEffect, useCallback } from "react";
import {
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
  ActivityIndicator,
} from "react-native";
import { RTCView } from "react-native-webrtc";
import { useWebRTCViewer } from "../hooks/useWebRTCViewer";

interface CameraViewerProps {
  deviceId: string;
  onClose: () => void;
}

export function CameraViewer({ deviceId, onClose }: CameraViewerProps) {
  const { isConnecting, isConnected, error, remoteStream, connect, disconnect, reconnect } =
    useWebRTCViewer({ deviceId });

  // 🆕 RTCView를 강제로 재생성하기 위한 key
  // reconnect 시 이 값을 증가시켜 기존 비디오 태그를 DOM에서 완전히 제거하고
  // 새로 생성합니다. 이렇게 하면 브라우저의 미디어 파이프라인이 완전히 리셋됩니다.
  const [streamKey, setStreamKey] = useState(0);

  // 컴포넌트 마운트 시 자동 연결
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []);

  // 🔄 카메라 재연결 감지 시: key 갱신 + reconnect
  const handleCameraReconnected = useCallback(() => {
    console.log("[CameraViewer] 📷 카메라 재연결 감지 → 비디오 태그 리셋 + reconnect");
    setStreamKey(prev => prev + 1); // 비디오 태그 강제 재생성
    reconnect(); // disconnect → 1초 디바운스 → connect
  }, [reconnect]);

  // broadcaster-ready 시그널 수신 시 handleCameraReconnected 호출
  useEffect(() => {
    // Supabase Realtime으로 broadcaster-ready 감지하는 로직에서
    // handleCameraReconnected()를 호출하세요
  }, [handleCameraReconnected]);

  // remoteStream이 변경될 때도 key 갱신 (재연결 후 새 스트림 수신 시)
  useEffect(() => {
    if (remoteStream) {
      setStreamKey(prev => prev + 1);
      console.log("[CameraViewer] 📹 새 스트림 수신 → 비디오 태그 재생성");
    }
  }, [remoteStream]);

  const handleClose = useCallback(() => {
    disconnect();
    onClose();
  }, [disconnect, onClose]);

  const streamURL = remoteStream?.toURL?.() || "";

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          <Text style={styles.title}>실시간 카메라</Text>
          {isConnected && (
            <View style={styles.liveBadge}>
              <View style={styles.liveIndicator} />
              <Text style={styles.liveText}>LIVE</Text>
            </View>
          )}
        </View>
        <TouchableOpacity onPress={handleClose} style={styles.closeButton}>
          <Text style={styles.closeButtonText}>✕</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.videoContainer}>
        {isConnecting && (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" color="#FFD700" />
            <Text style={styles.loadingText}>노트북에 연결 중...</Text>
          </View>
        )}

        {error && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
            <TouchableOpacity onPress={handleCameraReconnected} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 
          🆕 key={streamKey}: 재연결 시 RTCView를 완전히 파괴하고 새로 생성합니다.
          이렇게 하면 readyState: 0 상태에서 고착되는 문제가 해결됩니다.
          
          ⚠️ 웹뷰(브라우저) 기반이라면 <video> 태그에도 동일하게 적용:
          <video key={streamKey} autoPlay playsInline muted ref={videoRef} />
        */}
        {remoteStream && (
          <RTCView
            key={streamKey}
            streamURL={streamURL}
            style={styles.video}
            objectFit="contain"
            mirror={false}
            zOrder={0}
          />
        )}

        {!isConnecting && !isConnected && !error && (
          <View style={styles.placeholderContainer}>
            <Text style={styles.placeholderText}>
              노트북 카메라를 켜면 여기에 표시됩니다
            </Text>
            <TouchableOpacity onPress={connect} style={styles.connectButton}>
              <Text style={styles.connectButtonText}>연결하기</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>

      {isConnected && (
        <View style={styles.controls}>
          <TouchableOpacity style={styles.snapshotButton}>
            <Text style={styles.snapshotButtonText}>📷 스냅샷</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}
```

### CameraViewer 핵심 변경사항

1. **`key={streamKey}`로 비디오 태그 강제 재생성**: 재연결 시 `streamKey`를 증가시켜 RTCView를 DOM에서 완전히 제거하고 새로 생성합니다. 이렇게 하면 브라우저의 미디어 파이프라인이 완전히 리셋되어 `readyState: 0` 고착 문제가 해결됩니다.

2. **`remoteStream`을 직접 사용**: `videoRef`를 통한 간접 참조 대신, `useWebRTCViewer`가 반환하는 `remoteStream` 상태를 `RTCView`의 `streamURL`에 직접 전달합니다.

3. **`objectFit: "contain"`**: `cover` 대신 `contain`을 사용하여 영상 비율을 유지합니다.

4. **`remoteStream` 기반 조건부 렌더링**: `isConnected` 대신 `remoteStream`의 존재 여부로 RTCView를 렌더링합니다.

5. **불필요한 `attemptPlay` 제거**: RTCView는 `streamURL`이 유효하면 자동으로 재생하므로 수동 play 로직이 불필요합니다.

### ⚠️ 웹뷰(브라우저) 기반 앱인 경우 — 비디오 재생 타이밍

React Native의 `RTCView`가 아닌 웹 `<video>` 태그를 사용하는 경우, `loadedmetadata` 이벤트를 기다린 후 재생해야 합니다:

```typescript
// stream이 변경될 때마다 실행
useEffect(() => {
  const video = videoRef.current;
  if (!video || !stream) return;

  // 1. 기존 재생 중단
  video.pause();
  video.srcObject = stream;

  // 2. 데이터가 충분히 로드된 후 0.5초 딜레이 재생 (GPU 과부하 방지)
  const onLoadedData = () => {
    setTimeout(() => {
      video.play().catch(e => {
        if (e.name === 'NotAllowedError') {
          // 사용자 상호작용 필요 → "터치하여 재생" 버튼 표시
          setShowPlayButton(true);
        }
      });
    }, 500); // 모바일 GPU 안정화를 위한 딜레이
  };

  video.addEventListener("loadeddata", onLoadedData); // loadedmetadata 대신 loadeddata 사용
  video.load(); // 미디어 파이프라인 강제 리셋

  return () => {
    video.removeEventListener("loadeddata", onLoadedData);
  };
}, [stream]);

// JSX — key 속성으로 비디오 태그 강제 재생성
<video
  key={streamKey}
  ref={videoRef}
  autoPlay
  playsInline  // iOS 필수
  muted        // 자동재생 정책 우회
/>
```

### 2. 동작 흐름

1. **노트북**: 카메라 모달 열기 → 카메라 시작 → WebRTC 브로드캐스팅 시작
2. **스마트폰**: "노트북 카메라 보기" 버튼 클릭 → WebRTC 연결 → 실시간 영상 표시

### 3. 시그널링 과정

```
스마트폰 (Viewer)                    노트북 (Broadcaster)
       |                                    |
       |-------- Offer (SDP) -------------→|
       |                                    |
       |←------- Answer (SDP) -------------|
       |                                    |
       |←------ ICE Candidates -----------→|
       |                                    |
       |===== WebRTC 연결 (P2P) ===========|
       |                                    |
       |←----- 실시간 비디오 스트림 --------|
```

---

## 데이터베이스 스키마

시그널링에 사용되는 `webrtc_signaling` 테이블:

```sql
CREATE TABLE public.webrtc_signaling (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL CHECK (type IN ('offer', 'answer', 'ice-candidate')),
  sender_type TEXT NOT NULL CHECK (sender_type IN ('broadcaster', 'viewer')),
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT (now() + INTERVAL '5 minutes')
);
```

---

## 문제 해결

### 연결이 안 될 때

1. 노트북 앱에서 카메라가 켜져 있는지 확인
2. 같은 `device_id`를 사용하고 있는지 확인
3. 네트워크 연결 상태 확인
4. STUN 서버 접근 가능 여부 확인

### 재연결 시 readyState: 0 (영상 안 나옴) 해결

**원인**: 카메라 재연결 시 이전 세션의 좀비 시그널(Offer, ICE)이 새 연결과 충돌하여 `setRemoteDescription`이 중복 실행되고 PeerConnection 트랙 상태가 손상됩니다.

**해결 3단계** (반드시 이 순서로):

1. **즉시 정리 (동기적)**: 카메라 끊김 감지 시 `RTCPeerConnection.close()` + `srcObject = null` + `video.load()` 즉시 실행
2. **디바운스 대기**: 1초간 대기하여 좀비 시그널이 지나가도록 함
3. **새 세션으로 연결**: 새 `sessionId` 발급 후 `connect()` 호출

```javascript
// ❌ 잘못된 방법 (즉시 재연결)
onCameraReconnected → connect()

// ✅ 올바른 방법 (정리 → 대기 → 연결)
onCameraReconnected → disconnect() → setTimeout(1000) → connect()
```

**`reconnect()` 함수를 사용하세요** — 위 3단계가 모두 내장되어 있습니다.

### 영상이 끊길 때

1. 네트워크 대역폭 확인
2. WiFi vs LTE 전환 시 `reconnect()` 호출 필요
3. 배터리 절전 모드 해제

### iOS에서 작동하지 않을 때

```ruby
# Podfile에 추가
pod 'react-native-webrtc', :path => '../node_modules/react-native-webrtc'
```

```bash
cd ios && pod install
```

---

## 참고 자료

- [react-native-webrtc 공식 문서](https://github.com/react-native-webrtc/react-native-webrtc)
- [WebRTC 표준 사양](https://webrtc.org/)
- [Supabase Realtime 문서](https://supabase.com/docs/guides/realtime)
