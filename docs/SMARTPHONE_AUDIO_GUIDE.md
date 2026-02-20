# 🔊 스마트폰 앱 오디오 구현 가이드

## 📋 개요

랩탑 앱(브로드캐스터)은 WebRTC 스트리밍 시 **비디오 + 오디오 트랙을 함께 송출**합니다.  
스마트폰 앱(뷰어)에서 이 오디오를 재생하고, 녹화 시 오디오를 포함하려면 아래 지침을 따르세요.

---

## 1️⃣ 실시간 스트리밍 오디오 재생

### 문제점
브라우저/WebView의 **자동재생 정책(Autoplay Policy)** 때문에 `muted` 없이는 자동 재생이 차단됩니다.

### 해결 방법

#### React Native (react-native-webrtc)
```tsx
import { RTCView } from 'react-native-webrtc';

// ❌ 기존 (소리 안 남)
<RTCView streamURL={remoteStream.toURL()} muted />

// ✅ 수정 (소리 남)
<RTCView streamURL={remoteStream.toURL()} muted={false} />
```

#### WebView 기반 뷰어 (HTML `<video>`)
```tsx
// 1단계: 초기에는 muted로 자동재생 허용
<video 
  ref={videoRef}
  autoPlay 
  playsInline
  muted          // 초기에는 음소거로 자동재생 허용
/>

// 2단계: 사용자 터치 이벤트 후 음소거 해제
const handleUserInteraction = () => {
  if (videoRef.current) {
    videoRef.current.muted = false;
    videoRef.current.volume = 1.0;
    videoRef.current.play().catch(console.error);
  }
};

// 화면 터치 시 음소거 해제
<TouchableOpacity onPress={handleUserInteraction}>
  <Text>🔊 소리 켜기</Text>
</TouchableOpacity>
```

### 중요 사항
- **최초 1회 사용자 상호작용(터치/클릭)이 반드시 필요**합니다
- iOS Safari/WebView는 특히 엄격하므로, `muted` → 사용자 터치 → `muted = false` 패턴을 권장합니다
- `playsInline` 속성이 없으면 iOS에서 전체화면으로 전환될 수 있습니다

---

## 2️⃣ 스트리밍 녹화 시 오디오 포함

### 핵심 원리
`MediaRecorder`에 전달하는 `MediaStream`에 **비디오 트랙 + 오디오 트랙 모두 포함**해야 합니다.

### React Native (react-native-webrtc)
```tsx
// remoteStream에서 오디오/비디오 트랙 확인
const videoTracks = remoteStream.getVideoTracks();
const audioTracks = remoteStream.getAudioTracks();
console.log('Video tracks:', videoTracks.length); // 1 이상이어야 함
console.log('Audio tracks:', audioTracks.length);  // 1 이상이어야 함

// 모든 트랙이 enabled 상태인지 확인
audioTracks.forEach(track => {
  track.enabled = true;  // 반드시 true
});
```

### WebView 기반 뷰어 (MediaRecorder API)
```javascript
// ✅ 올바른 녹화 방법 — remoteStream에서 비디오+오디오 트랙 모두 사용
const startRecording = () => {
  // remoteStream = WebRTC로 수신한 원격 스트림
  const recordingStream = new MediaStream([
    ...remoteStream.getVideoTracks(),
    ...remoteStream.getAudioTracks(),   // ← 오디오 트랙 반드시 포함!
  ]);

  // 코덱 지원 확인 (오디오 코덱 포함)
  const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
    ? "video/webm;codecs=vp9,opus"     // VP9 비디오 + Opus 오디오
    : MediaRecorder.isTypeSupported("video/webm;codecs=vp8,opus")
      ? "video/webm;codecs=vp8,opus"   // VP8 비디오 + Opus 오디오  
      : "video/webm";                  // 기본값

  const recorder = new MediaRecorder(recordingStream, { mimeType });
  const chunks = [];

  recorder.ondataavailable = (e) => {
    if (e.data.size > 0) chunks.push(e.data);
  };

  recorder.onstop = () => {
    const blob = new Blob(chunks, { type: mimeType });
    // 다운로드 또는 서버 업로드 처리
    const url = URL.createObjectURL(blob);
    // ...
  };

  recorder.start(1000); // 1초 간격으로 데이터 수집
  return recorder;
};
```

---

## 3️⃣ 오디오 트랙 디버깅

스트리밍은 되는데 소리가 안 나올 때, 아래 로그로 원인을 확인하세요:

```javascript
// WebRTC 연결 후 수신 스트림 검사
peerConnection.ontrack = (event) => {
  const stream = event.streams[0];
  
  console.log('[Audio Debug] 전체 트랙 수:', stream.getTracks().length);
  console.log('[Audio Debug] 비디오 트랙:', stream.getVideoTracks().length);
  console.log('[Audio Debug] 오디오 트랙:', stream.getAudioTracks().length);
  
  stream.getAudioTracks().forEach((track, i) => {
    console.log(`[Audio Debug] 오디오 트랙 ${i}:`, {
      id: track.id,
      enabled: track.enabled,    // true여야 함
      muted: track.muted,        // false여야 함
      readyState: track.readyState, // "live"여야 함
      label: track.label,
    });
  });
};
```

### 체크리스트

| 항목 | 정상 값 | 확인 방법 |
|---|---|---|
| 오디오 트랙 수 | ≥ 1 | `stream.getAudioTracks().length` |
| 트랙 enabled | `true` | `track.enabled` |
| 트랙 muted | `false` | `track.muted` |
| 트랙 readyState | `"live"` | `track.readyState` |
| 비디오 엘리먼트 muted | `false` | `videoElement.muted` |
| 비디오 엘리먼트 volume | `> 0` | `videoElement.volume` |

---

## 4️⃣ 랩탑 앱(브로드캐스터) 오디오 송출 구조

참고: 랩탑 앱은 아래와 같이 오디오를 포함하여 송출합니다.

```
┌─────────────────────────────────────────────┐
│ 랩탑 (Broadcaster)                          │
│                                             │
│  카메라 → video track ──┐                    │
│                         ├→ combinedStream → WebRTC 송출
│  마이크 → audio track ──┘                    │
│    (echoCancellation: true)                  │
│    (noiseSuppression: true)                  │
│    (autoGainControl: true)                   │
└─────────────────────────────────────────────┘
         │
         ▼
┌─────────────────────────────────────────────┐
│ 스마트폰 (Viewer)                            │
│                                             │
│  remoteStream ──→ <video muted={false} />   │
│                     └→ 스피커 출력            │
│                                             │
│  녹화 시: remoteStream의 video+audio 트랙     │
│          → MediaRecorder → .webm 파일       │
└─────────────────────────────────────────────┘
```

---

## 5️⃣ 플랫폼별 주의사항

### iOS (Safari / WKWebView)
- `playsInline` 필수 (없으면 전체화면 전환)
- `webkit-playsinline` 속성도 추가 권장
- 사용자 터치 없이 `muted = false` 설정 시 재생 자체가 차단될 수 있음
- **권장 패턴**: 초기 `muted={true}` → 화면 터치 시 `muted = false` + `play()`

### Android (Chrome / WebView)
- Chrome은 사용자 상호작용 후 자동재생 허용
- `autoplay` + `playsInline`으로 대부분 동작
- 일부 구형 기기에서 `volume = 0`으로 초기화될 수 있으므로 명시적으로 `volume = 1.0` 설정

### React Native (react-native-webrtc)
- `RTCView`에 `muted={false}` 전달
- 오디오 세션(Audio Session) 설정 필요할 수 있음 (iOS):
  ```tsx
  import { mediaDevices } from 'react-native-webrtc';
  // iOS 오디오 카테고리 설정이 필요한 경우
  // Info.plist에 NSMicrophoneUsageDescription 추가
  ```

---

## ⚠️ 흔한 실수와 해결법

| 증상 | 원인 | 해결 |
|---|---|---|
| 영상은 나오는데 소리가 안 남 | `<video muted>` 또는 사용자 상호작용 없음 | `muted={false}` + 터치 후 `play()` |
| 녹화 파일에 소리가 없음 | `MediaRecorder`에 오디오 트랙 미포함 | `remoteStream.getAudioTracks()` 포함하여 녹화 |
| 오디오 트랙이 0개 | 랩탑에서 마이크 권한 거부 또는 마이크 미연결 | 랩탑 카메라 모달에서 마이크 상태 확인 |
| 소리가 끊김 | 네트워크 불안정 또는 ICE 재협상 | 연결 상태 모니터링 + 자동 재연결 |
| iOS에서 재생 안 됨 | Autoplay Policy 위반 | `muted` 시작 → 터치 후 음소거 해제 |
