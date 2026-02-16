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

  // Answer/Offer의 remote description 처리 (중복 방지)
  const handleRemoteDescription = useCallback(async (sdp: any) => {
    if (!pcRef.current) return;

    if (remoteDescriptionSetRef.current) {
      console.log("[WebRTC Viewer] ⏭️ Remote description already set, skipping");
      return;
    }
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

    // 트랙 수신 처리 — unmute 후 디바운스로 1회만 스트림 전달
    let streamDeliverTimer: ReturnType<typeof setTimeout> | null = null;

    const deliverStream = () => {
      if (streamDeliverTimer) clearTimeout(streamDeliverTimer);
      streamDeliverTimer = setTimeout(() => {
        const currentPC = pcRef.current;
        if (!currentPC) return;
        // 현재 수신 중인 모든 트랙으로 새 MediaStream 생성
        const receivers = currentPC.getReceivers?.() || [];
        const tracks = receivers.map((r: any) => r.track).filter(Boolean);
        if (tracks.length > 0) {
          const wrapped = new MediaStream(tracks);
          updateStream(wrapped);
          console.log("[WebRTC Viewer] 📤 디바운스 스트림 전달 완료");
        }
      }, 150);
    };

    pc.ontrack = (event: any) => {
      console.log("[WebRTC Viewer] 트랙 수신:", event.track.kind);

      // muted 트랙은 unmute 대기, unmuted 트랙은 즉시 전달 예약
      if (event.track.muted) {
        event.track.addEventListener("unmute", () => {
          console.log(`[WebRTC Viewer] ✅ Track unmuted: ${event.track.kind}`);
          deliverStream();
        }, { once: true });
      } else {
        deliverStream();
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

  const disconnect = useCallback(async () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }
    iceCandidateQueueRef.current = [];

    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    if (sessionIdRef.current) {
      await supabase
        .from("webrtc_signaling")
        .delete()
        .eq("session_id", sessionIdRef.current);
    }

    setRemoteStream(null);
    setIsConnected(false);
    isConnectedRef.current = false;
    setIsConnecting(false);
    isConnectingRef.current = false;
    remoteDescriptionSetRef.current = false;
    answerSentRef.current = false;
    console.log("[WebRTC Viewer] 연결 해제됨");
  }, []);

  useEffect(() => {
    return () => {
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
  const { isConnecting, isConnected, error, remoteStream, connect, disconnect } =
    useWebRTCViewer({ deviceId });

  // 컴포넌트 마운트 시 자동 연결
  useEffect(() => {
    connect();
    return () => {
      disconnect();
    };
  }, []);

  const handleClose = useCallback(() => {
    disconnect();
    onClose();
  }, [disconnect, onClose]);

  // RTCView의 streamURL — remoteStream이 변경될 때마다 자동 갱신됨
  // react-native-webrtc의 RTCView는 streamURL 변경 시 자동으로 영상을 재생하므로
  // 별도의 play() 호출이나 srcObject 재할당이 불필요합니다.
  const streamURL = remoteStream?.toURL?.() || "";

  return (
    <View style={styles.container}>
      {/* 헤더 */}
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

      {/* 비디오 영역 */}
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
            <TouchableOpacity onPress={connect} style={styles.retryButton}>
              <Text style={styles.retryButtonText}>다시 시도</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* 
          RTCView 핵심 설정:
          - streamURL: remoteStream.toURL()로 직접 전달
          - objectFit: "contain"으로 영상 비율 유지 (cover는 찌그러짐 유발)
          - RTCView는 streamURL이 변경되면 자동으로 재생을 시작함
        */}
        {remoteStream && (
          <RTCView
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

      {/* 컨트롤 영역 */}
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

1. **`remoteStream`을 직접 사용**: `videoRef`를 통한 간접 참조 대신, `useWebRTCViewer`가 반환하는 `remoteStream` 상태를 `RTCView`의 `streamURL`에 직접 전달합니다. 이렇게 하면 stream이 변경될 때 React가 자동으로 컴포넌트를 리렌더링하여 RTCView가 새 streamURL을 인식합니다.

2. **`objectFit: "contain"`**: `cover` 대신 `contain`을 사용하여 영상 비율을 유지합니다. `cover`는 컨테이너에 맞추기 위해 영상을 잘라내거나 찌그러뜨릴 수 있습니다.

3. **`remoteStream` 기반 조건부 렌더링**: `isConnected` 대신 `remoteStream`의 존재 여부로 RTCView를 렌더링합니다. 이렇게 하면 연결 상태와 스트림 수신이 동기화되지 않는 경우에도 안정적으로 동작합니다.

4. **불필요한 `attemptPlay` 제거**: RTCView는 `streamURL`이 유효하면 자동으로 재생하므로 수동 play 로직이 불필요합니다.

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

### 영상이 끊길 때

1. 네트워크 대역폭 확인
2. WiFi vs LTE 전환 시 재연결 필요
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
