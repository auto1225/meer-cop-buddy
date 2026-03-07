# 📡 통합 명령 프로토콜 (Unified Command Protocol)

## ⚠️ 핵심 원칙

**모든 실시간 명령은 `user-commands-${userId}` 채널 하나로 통일합니다.**

기존 `device-commands-${deviceId}` 방식은 공유DB/로컬DB 간 UUID 불일치로 명령 유실이 발생했습니다.
`userId`는 시리얼 인증 시 발급된 고유 값으로, 양쪽 앱에서 항상 동일하므로 절대 어긋나지 않습니다.

---

## 1️⃣ 통신 방식 분류

| 기능 | 방식 | 채널/경로 | 방향 |
|------|------|-----------|------|
| 감시 ON/OFF | **Broadcast** | `user-commands-${userId}` | 📱→💻 |
| 위장모드 | **Broadcast** | `user-commands-${userId}` | 📱→💻 |
| 설정 변경 | **Broadcast** | `user-commands-${userId}` | 📱→💻 |
| 경보 해제 | **Broadcast** | `user-commands-${userId}` | 📱→💻 |
| 잠금 명령 | **Broadcast** | `user-commands-${userId}` | 📱→💻 |
| 메시지 전송 | **Broadcast** | `user-commands-${userId}` | 📱→💻 |
| 위치 요청 | **DB metadata** | `devices.metadata.locate_requested` | 📱→💻 |
| 네트워크 요청 | **DB metadata** | `devices.metadata.network_info_requested` | 📱→💻 |
| 경보 발생/해제 | **Presence** | `user-alerts-${userId}` | 💻→📱 |
| 사진 전송 | **Broadcast** | `user-photos-${userId}` | 💻→📱 |
| 기기 접속 상태 | **Presence** | `user-presence-${userId}` | 양방향 |
| WebRTC 시그널링 | **DB** | `webrtc_signaling` 테이블 | 양방향 |

---

## 2️⃣ 스마트폰 → 노트북 명령 (Broadcast)

### 채널 연결
```typescript
const userId = savedAuth.user_id; // 시리얼 인증에서 획득한 user_id
const commandChannel = supabaseShared.channel(`user-commands-${userId}`);
commandChannel.subscribe();
```

### 감시 ON/OFF
```typescript
await commandChannel.send({
  type: 'broadcast',
  event: 'monitoring_toggle',
  payload: { is_monitoring: true }  // true: ON, false: OFF
});

// DB에도 반드시 동기화 (영속성)
await updateDeviceViaEdge(deviceId, { is_monitoring: true });
```

### 위장모드
```typescript
await commandChannel.send({
  type: 'broadcast',
  event: 'camouflage_toggle',
  payload: { camouflage_mode: true }
});
```

### 설정 변경
```typescript
await commandChannel.send({
  type: 'broadcast',
  event: 'settings_updated',
  payload: {
    settings: {
      sensorSettings: {
        camera: true,
        lidClosed: false,
        keyboard: true,
        mouse: true,
        power: true,
        microphone: false,
        usb: false,
      },
      motionSensitivity: "normal",    // "sensitive" | "normal" | "insensitive"
      mouseSensitivity: "normal",     // "sensitive" | "normal" | "insensitive"
      alarm_pin: "1234",
      alarm_sound_id: "police-siren",
      require_pc_pin: true,
      camouflage_mode: false,
      language: "ko",                 // 17개 언어 코드
      device_type: "laptop",          // "laptop" | "desktop" | "tablet"
    }
  }
});

// DB metadata에도 동기화 (영속성)
await updateDeviceViaEdge(deviceId, {
  metadata: { ...currentMeta, ...settingsForDB }
});
```

### 경보 해제
```typescript
await commandChannel.send({
  type: 'broadcast',
  event: 'remote_alarm_off',
  payload: { device_id: deviceId, dismissed_at: new Date().toISOString() }
});
```

### 잠금 명령
```typescript
await commandChannel.send({
  type: 'broadcast',
  event: 'lock_command',
  payload: {}
});
```

### 메시지 전송
```typescript
await commandChannel.send({
  type: 'broadcast',
  event: 'message_command',
  payload: { title: "📩 메시지", message: "여기 있어요?" }
});
```

### 마스코트(캐릭터) 보기/숨기기
```typescript
await commandChannel.send({
  type: 'broadcast',
  event: 'mascot_toggle',
  payload: { mascot_visible: false }  // true: 표시, false: 숨김
});

// DB metadata에도 동기화 (영속성)
await updateDeviceViaEdge(deviceId, {
  metadata: { ...currentMeta, mascot_visible: false }
});
```

**노트북 수신 처리:**
- `mascot_visible` 값을 `localStorage('meercop-mascot-visible')`에 저장
- `LaptopMascotSection` 컴포넌트의 `mascotVisible` 상태를 즉시 갱신
- 마스코트 이미지와 말풍선이 함께 숨겨지거나 표시됨
- 숨김 상태에서도 하단 상태바를 통해 보안 상태 확인 가능

---

## 3️⃣ 위치/네트워크 요청 (DB metadata 방식)

이 두 기능은 DB 메타데이터 변경을 감지하는 방식이므로 **별도 채널이 필요 없습니다**.

### 위치 요청
```typescript
await updateDeviceViaEdge(deviceId, {
  metadata: { ...currentMeta, locate_requested: new Date().toISOString() }
});
// 결과: devices.latitude, devices.longitude에 기록됨
```

### 네트워크 정보 요청
```typescript
await updateDeviceViaEdge(deviceId, {
  metadata: { ...currentMeta, network_info_requested: new Date().toISOString() }
});
// 결과: devices.metadata.network_info에 기록됨
```

---

## 4️⃣ 노트북이 하는 일 (이미 구현됨)

| 기능 | 구독 채널 | 처리 |
|------|-----------|------|
| 모든 명령 수신 | `user-commands-${userId}` | 페이로드에서 즉시 상태 반영 |
| 위치 요청 감지 | DB 폴링 (metadata) | GPS/WiFi/IP로 좌표 수집 후 DB 업데이트 |
| 네트워크 요청 감지 | DB 폴링 (metadata) | Navigator API로 수집 후 DB 업데이트 |
| 경보 브로드캐스트 | `user-alerts-${userId}` | Presence로 경보 상태 공유 |
| 사진 전송 | `user-photos-${userId}` | Broadcast로 base64 사진 전송 |

---

## 5️⃣ 스마트폰이 해야 할 변경 사항

### ✅ 필수 변경
1. **명령 채널 변경**: `device-commands-${deviceId}` → `user-commands-${userId}`
   - `userId`는 시리얼 인증 시 받은 `user_id` 사용
2. **DB 동기화**: Broadcast 전송 후 반드시 `updateDeviceViaEdge`로 DB에도 저장 (앱 재시작 시 복원용)

### ⚠️ 하위 호환
- 노트북은 `device-commands-${localId}`, `device-commands-${sharedId}`, `user-commands-${userId}` 세 채널 모두 구독 중
- 스마트폰이 `user-commands-${userId}`로 전환 완료 후, 기존 채널은 제거 예정

---

## 6️⃣ Edge Function 엔드포인트

모든 DB 업데이트는 아래 엔드포인트를 사용합니다:

| 기능 | URL | Method |
|------|-----|--------|
| 기기 등록 | `https://dmvbwyfzueywuwxkjuuy.supabase.co/functions/v1/register-device` | POST |
| 기기 조회 | `https://dmvbwyfzueywuwxkjuuy.supabase.co/functions/v1/get-devices` | POST |
| 기기 업데이트 | `https://dmvbwyfzueywuwxkjuuy.supabase.co/functions/v1/update-device` | POST |

**Anon Key**: `.env`의 `VITE_SUPABASE_PUBLISHABLE_KEY` 참조

---

## 7️⃣ 디버깅 체크리스트

명령이 전달되지 않을 때:

1. ✅ `userId`가 양쪽 앱에서 동일한지 확인
2. ✅ 채널이 `user-commands-${userId}`인지 확인
3. ✅ `subscribe()` 상태가 `SUBSCRIBED`인지 확인
4. ✅ `send()` 반환값에 에러가 없는지 확인
5. ✅ 노트북 콘솔에 `[Index] 📲 Broadcast ... received` 로그가 찍히는지 확인
