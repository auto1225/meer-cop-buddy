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
import { supabase } from "../lib/supabase"; // 기존 Supabase 클라이언트 사용

interface UseWebRTCViewerOptions {
  deviceId: string;
  onStream?: (stream: MediaStream) => void;
}

const ICE_SERVERS = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
  ],
};

export function useWebRTCViewer({ deviceId, onStream }: UseWebRTCViewerOptions) {
  const [isConnecting, setIsConnecting] = useState(false);
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const channelRef = useRef<any>(null);
  const sessionIdRef = useRef<string>("");

  // 고유 세션 ID 생성
  const generateSessionId = useCallback(() => {
    return `viewer-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }, []);

  // 브로드캐스터로부터 Answer 처리
  const handleAnswer = useCallback(async (answer: any) => {
    if (!pcRef.current) return;

    try {
      const remoteDesc = new RTCSessionDescription(answer);
      await pcRef.current.setRemoteDescription(remoteDesc);
      console.log("[WebRTC Viewer] Remote description 설정 완료");
    } catch (err) {
      console.error("[WebRTC Viewer] Remote description 설정 오류:", err);
      setError("연결에 실패했습니다");
    }
  }, []);

  // 브로드캐스터로부터 ICE Candidate 처리
  const handleIceCandidate = useCallback(async (candidate: any) => {
    if (!pcRef.current || !pcRef.current.remoteDescription) return;

    try {
      const iceCandidate = new RTCIceCandidate(candidate);
      await pcRef.current.addIceCandidate(iceCandidate);
      console.log("[WebRTC Viewer] ICE candidate 추가됨");
    } catch (err) {
      console.error("[WebRTC Viewer] ICE candidate 추가 오류:", err);
    }
  }, []);

  // 브로드캐스터에 연결
  const connect = useCallback(async () => {
    if (isConnecting || isConnected) return;

    setIsConnecting(true);
    setError(null);

    const sessionId = generateSessionId();
    sessionIdRef.current = sessionId;

    console.log(`[WebRTC Viewer] 세션 ${sessionId}로 연결 시도`);

    // Peer Connection 생성
    const pc = new RTCPeerConnection(ICE_SERVERS);
    pcRef.current = pc;

    // 수신 전용 트랜시버 추가
    pc.addTransceiver("video", { direction: "recvonly" });
    pc.addTransceiver("audio", { direction: "recvonly" });

    // 원격 스트림 수신 처리
    pc.ontrack = (event: any) => {
      console.log("[WebRTC Viewer] 트랙 수신:", event.track.kind);
      if (event.streams && event.streams[0]) {
        setRemoteStream(event.streams[0]);
        onStream?.(event.streams[0]);
      }
    };

    // ICE Candidate 전송
    pc.onicecandidate = async (event: any) => {
      if (event.candidate) {
        console.log("[WebRTC Viewer] ICE candidate 전송");
        await supabase.from("webrtc_signaling").insert({
          device_id: deviceId,
          session_id: sessionId,
          type: "ice-candidate",
          sender_type: "viewer",
          data: { candidate: event.candidate.toJSON() },
        });
      }
    };

    // 연결 상태 변경 처리
    pc.onconnectionstatechange = () => {
      console.log(`[WebRTC Viewer] 연결 상태: ${pc.connectionState}`);
      if (pc.connectionState === "connected") {
        setIsConnected(true);
        setIsConnecting(false);
      } else if (
        pc.connectionState === "disconnected" ||
        pc.connectionState === "failed"
      ) {
        setIsConnected(false);
        setError("연결이 끊어졌습니다");
      }
    };

    // 시그널링 채널 구독
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

          // 브로드캐스터의 메시지만 처리
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

    // Offer 생성 및 전송
    try {
      const offer = await pc.createOffer({});
      await pc.setLocalDescription(offer);

      await supabase.from("webrtc_signaling").insert({
        device_id: deviceId,
        session_id: sessionId,
        type: "offer",
        sender_type: "viewer",
        data: { sdp: offer },
      });

      console.log("[WebRTC Viewer] Offer 전송 완료");

      // 연결 타임아웃 (15초)
      setTimeout(() => {
        if (!isConnected && isConnecting) {
          setError("노트북 카메라가 켜져 있지 않습니다");
          setIsConnecting(false);
          disconnect();
        }
      }, 15000);
    } catch (err) {
      console.error("[WebRTC Viewer] Offer 생성 오류:", err);
      setError("연결에 실패했습니다");
      setIsConnecting(false);
    }
  }, [
    deviceId,
    isConnecting,
    isConnected,
    generateSessionId,
    handleAnswer,
    handleIceCandidate,
    onStream,
  ]);

  // 연결 해제
  const disconnect = useCallback(async () => {
    if (pcRef.current) {
      pcRef.current.close();
      pcRef.current = null;
    }

    if (channelRef.current) {
      await supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }

    // 시그널링 데이터 정리
    if (sessionIdRef.current) {
      await supabase
        .from("webrtc_signaling")
        .delete()
        .eq("session_id", sessionIdRef.current);
    }

    setRemoteStream(null);
    setIsConnected(false);
    setIsConnecting(false);
    console.log("[WebRTC Viewer] 연결 해제됨");
  }, []);

  // 언마운트 시 정리
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
import React, { useRef, useEffect } from "react";
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

  const handleClose = () => {
    disconnect();
    onClose();
  };

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

        {isConnected && remoteStream && (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={styles.video}
            objectFit="cover"
            mirror={false}
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

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#1a1a2e",
  },
  header: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    borderBottomWidth: 1,
    borderBottomColor: "rgba(255, 255, 255, 0.2)",
  },
  headerLeft: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: "bold",
    color: "#fff",
  },
  liveBadge: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "rgba(239, 68, 68, 0.2)",
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    gap: 4,
  },
  liveIndicator: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: "#ef4444",
  },
  liveText: {
    fontSize: 10,
    fontWeight: "bold",
    color: "#ef4444",
  },
  closeButton: {
    padding: 8,
  },
  closeButtonText: {
    fontSize: 20,
    color: "#fff",
  },
  videoContainer: {
    flex: 1,
    backgroundColor: "#000",
    justifyContent: "center",
    alignItems: "center",
  },
  video: {
    width: "100%",
    height: "100%",
  },
  loadingContainer: {
    alignItems: "center",
    gap: 16,
  },
  loadingText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
  },
  errorContainer: {
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  errorText: {
    color: "rgba(255, 255, 255, 0.7)",
    fontSize: 14,
    textAlign: "center",
  },
  retryButton: {
    backgroundColor: "rgba(255, 255, 255, 0.1)",
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: "rgba(255, 255, 255, 0.2)",
  },
  retryButtonText: {
    color: "#fff",
    fontSize: 14,
  },
  placeholderContainer: {
    alignItems: "center",
    padding: 24,
    gap: 16,
  },
  placeholderText: {
    color: "rgba(255, 255, 255, 0.5)",
    fontSize: 14,
    textAlign: "center",
  },
  connectButton: {
    backgroundColor: "#FFD700",
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  connectButtonText: {
    color: "#1a1a2e",
    fontSize: 14,
    fontWeight: "bold",
  },
  controls: {
    padding: 16,
    borderTopWidth: 1,
    borderTopColor: "rgba(255, 255, 255, 0.2)",
  },
  snapshotButton: {
    backgroundColor: "#FFD700",
    padding: 16,
    borderRadius: 12,
    alignItems: "center",
  },
  snapshotButtonText: {
    color: "#1a1a2e",
    fontSize: 16,
    fontWeight: "bold",
  },
});
```

---

## 사용 방법

### 1. 스마트폰 앱에서 카메라 뷰어 열기

```tsx
import { CameraViewer } from "./components/CameraViewer";

function DeviceScreen({ device }) {
  const [showCamera, setShowCamera] = useState(false);

  return (
    <View>
      {/* 카메라 보기 버튼 */}
      <TouchableOpacity onPress={() => setShowCamera(true)}>
        <Text>📹 노트북 카메라 보기</Text>
      </TouchableOpacity>

      {/* 카메라 뷰어 모달 */}
      <Modal visible={showCamera} animationType="slide">
        <CameraViewer
          deviceId={device.id}
          onClose={() => setShowCamera(false)}
        />
      </Modal>
    </View>
  );
}
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
