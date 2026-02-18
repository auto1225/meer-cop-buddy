# WebRTC 스트리밍 가이드

## 📋 개요

랩탑(Broadcaster) → 스마트폰(Viewer) 방향의 실시간 카메라 스트리밍 구현 가이드입니다.
Supabase DB(`webrtc_signaling` 테이블)를 시그널링 서버로 사용합니다.

---

## 1️⃣ 아키텍처

```
랩탑 (Broadcaster)                    스마트폰 (Viewer)
    │                                      │
    │  ← viewer-join (DB)                 │
    │                                      │
    │  → offer (DB)                       │
    │  ← answer (DB)                      │
    │  ⇄ ICE candidates (DB)             │
    │                                      │
    │  ═══ WebRTC P2P Stream ═══          │
    │  (카메라 비디오 + 오디오)              │
```

## 2️⃣ STUN 서버 설정

```typescript
const ICE_SERVERS: RTCConfiguration = {
  iceServers: [
    { urls: "stun:stun.l.google.com:19302" },
    { urls: "stun:stun1.l.google.com:19302" },
    { urls: "stun:stun2.l.google.com:19302" },
    { urls: "stun:stun3.l.google.com:19302" },
    { urls: "stun:stun4.l.google.com:19302" },
  ],
  iceCandidatePoolSize: 10,
};
```

> ⚠️ TURN 서버 미사용 — NAT 관통이 필요한 환경에서는 별도 TURN 서버 추가 필요

## 3️⃣ 시그널링 테이블 구조

```sql
CREATE TABLE public.webrtc_signaling (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  device_id TEXT NOT NULL,
  session_id TEXT NOT NULL,
  type TEXT NOT NULL,         -- 'viewer-join' | 'offer' | 'answer' | 'ice-candidate' | 'broadcaster-ready'
  sender_type TEXT NOT NULL,  -- 'broadcaster' | 'viewer'
  data JSONB NOT NULL,
  created_at TIMESTAMPTZ DEFAULT now(),
  expires_at TIMESTAMPTZ DEFAULT now() + interval '5 minutes'
);
```

## 4️⃣ 시그널링 흐름

### 4.1 Broadcaster 시작
1. `is_streaming_requested` = true 감지 (DB Realtime)
2. 카메라 스트림 획득 (`getUserMedia`)
3. `broadcaster-ready` 시그널 삽입 → Viewer에게 알림
4. `viewer-join` 폴링 시작

### 4.2 Viewer 참여
1. `viewer-join` 시그널 삽입 (session_id 포함)
2. Broadcaster가 감지 → `offer` 생성 및 삽입
3. Viewer가 `offer` 수신 → `answer` 생성 및 삽입
4. 양쪽 ICE candidates 교환
5. P2P 연결 수립 → 스트리밍 시작

### 4.3 SDP 직렬화 규칙

```typescript
// ✅ 올바른 직렬화 (일반 JSON 객체)
const offerData = {
  type: offer.type,
  sdp: offer.sdp,
};

// ❌ 잘못된 직렬화 (RTCSessionDescription 직접 저장)
// RTCSessionDescription은 JSON.stringify 시 문제 발생 가능
```

### 4.4 수신 측 파싱 (Robust Parsing)

```typescript
// Web과 React Native 호환을 위한 유연한 파싱
function parseSDP(data: any): RTCSessionDescriptionInit {
  if (typeof data === "string") {
    return JSON.parse(data);
  }
  if (data.sdp && data.type) {
    return { type: data.type, sdp: data.sdp };
  }
  // 중첩 객체 형태 대응
  if (data.data?.sdp) {
    return { type: data.data.type, sdp: data.data.sdp };
  }
  throw new Error("Invalid SDP format");
}
```

## 5️⃣ 자동 재연결 (Auto-Reconnect)

랩탑 측 `AutoBroadcaster` 컴포넌트가 관리:

| 상황 | 동작 |
|------|------|
| `broadcaster-ready` 수신 | Viewer는 기존 연결 정리 → 1초 debounce → `viewer-join` 재전송 |
| ICE 연결 실패 | 지수 백오프 (1s → 2s → 4s) 재시도, 최대 5회 |
| 네트워크 복구 | `online` 이벤트 감지 → 자동 재연결 |

## 6️⃣ 레이스 컨디션 방지

1. **싱글톤 가드**: `globalBroadcastingDevice` 변수로 동시 브로드캐스팅 인스턴스 1개 제한
2. **세션 만료**: 시그널링 레코드는 5분 후 자동 만료 (`expires_at`)
3. **Debounce**: `broadcaster-ready` 수신 후 1초 대기 → 이전 시그널 소거 확인
4. **연결 상태 가드**: `isConnecting` / `isConnected` 상태 체크로 중복 연결 시도 차단

## 7️⃣ 성능 권장사항

| 항목 | 권장값 |
|------|--------|
| 비디오 해상도 | 640×480 (모바일 환경 고려) |
| 프레임레이트 | 15fps |
| 비디오 코덱 | VP8 (호환성) / H.264 (품질) |
| 시그널링 폴링 | 2초 간격 |
| ICE 후보 풀 | 10개 |

```typescript
// 카메라 제약 조건 예시
const constraints = {
  video: {
    width: { ideal: 640 },
    height: { ideal: 480 },
    frameRate: { ideal: 15 },
    facingMode: "user",
  },
  audio: true,
};
```

## ⚠️ 주의사항

1. **React StrictMode**: 개발 모드에서 컴포넌트 이중 마운트 시 싱글톤 가드로 보호
2. **브라우저 권한**: 카메라/마이크 접근 권한이 필요 (HTTPS 필수)
3. **방화벽**: STUN만 사용하므로 Symmetric NAT 환경에서는 연결 불가
4. **대역폭**: 모바일 네트워크 고려 시 적응적 비트레이트 조절 권장
