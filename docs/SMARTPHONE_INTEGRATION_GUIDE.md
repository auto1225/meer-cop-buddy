# 스마트폰 앱 통합 가이드

## 📋 개요

컴퓨터(랩탑) 앱과 스마트폰 앱 간의 실시간 통신 가이드입니다.
Supabase Presence 채널과 DB Realtime을 사용합니다.

---

## 1️⃣ 경보 수신 및 해제 (Presence 채널)

### 채널: `user-alerts-${userId}` (v2 통합 채널)

```typescript
// v2 통합 채널: user-alerts-${userId} (기기별 → 사용자별)
const channel = supabase.channel(`user-alerts-${userId}`, {
  config: { presence: { key: DEVICE_ID } },
});
```

### 랩탑이 보내는 Presence 데이터 형식

경보 발생 시:
```json
{
  "active_alert": {
    "id": "uuid-...",
    "device_id": "uuid-...",
    "event_type": "alert_camera_motion",
    "event_data": {
      "alert_type": "camera_motion",
      "message": "카메라 모션 감지 (변화율: 25.3%)",
      "photo_count": 3,
      "change_percent": 25.3
    },
    "created_at": "2026-02-12T19:30:00.000Z"
  },
  "updated_at": "2026-02-12T19:30:00.000Z"
}
```

경보 해제 시:
```json
{
  "active_alert": null,
  "updated_at": "2026-02-12T19:30:30.000Z"
}
```

### 스마트폰에서 경보 수신 구현

```typescript
channel
  .on("presence", { event: "sync" }, () => {
    const state = channel.presenceState();
    
    for (const key of Object.keys(state)) {
      const entries = state[key];
      for (const entry of entries) {
        if (entry.active_alert) {
          // 🚨 경보 발생! UI에 경보 표시
          const alert = entry.active_alert;
          showAlertNotification({
            type: alert.event_type,        // "alert_camera_motion", "alert_keyboard" 등
            message: alert.event_data?.message,
            createdAt: alert.created_at,
          });
        } else if (entry.active_alert === null) {
          // ✅ 경보 해제됨 (랩탑에서 자체 해제)
          hideAlertNotification();
        }
      }
    }
  })
  .subscribe();
```

### 스마트폰에서 원격 경보 해제 전송

```typescript
// "경보 해제" 버튼 클릭 시
async function dismissAlarmRemotely() {
  await channel.track({
    remote_alarm_off: true,        // 경보음 즉시 중지
    active_alert: null,            // 전체 경보 해제
    dismissed_at: new Date().toISOString(),
  });
}
```

### 경보 이벤트 타입 목록

| event_type | 설명 |
|------------|------|
| `alert_camera_motion` | 카메라 모션 감지 |
| `alert_keyboard` | 키보드 입력 감지 |
| `alert_mouse` | 마우스 움직임 감지 |
| `alert_lid` | 덮개(리드) 열림/닫힘 감지 |
| `alert_power` | 전원 케이블 변화 감지 |
| `alert_shock` | 충격/진동 감지 |
| `alert_movement` | 기기 이동 감지 |

---

## 2️⃣ 사진 수신 (Broadcast 채널)

### 채널: `user-photos-${userId}` (v2 통합 채널)

랩탑이 경보 발생 시 촬영한 사진을 Broadcast로 전송합니다.

```typescript
const photoChannel = supabase.channel(`user-photos-${userId}`);

photoChannel
  .on("broadcast", { event: "photo_data" }, (payload) => {
    const data = payload.payload;
    // data.id: 경보 ID
    // data.device_id: 장치 ID
    // data.event_type: 이벤트 타입
    // data.photos: string[] (base64 이미지 배열)
    // data.change_percent: 모션 변화율
    // data.created_at: 생성 시각
    
    displayPhotos(data.photos); // base64 이미지 표시
  })
  .subscribe();
```

---

## 3️⃣ 설정 변경 (DB metadata)

스마트폰에서 설정 변경 시 `devices` 테이블의 `metadata` JSONB를 업데이트합니다.
랩탑은 Realtime으로 즉시 반영합니다.

### 설정 업데이트 방법

```typescript
// 예: 센서 설정 변경
await supabase
  .from("devices")
  .update({
    metadata: {
      ...currentMetadata,
      alarm_pin: "1234",
      alarm_sound_id: "police",
      require_pc_pin: true,
      camouflage_mode: false,
      sensorSettings: {
        deviceType: "laptop",
        camera: true,
        lidClosed: false,
        keyboard: true,
        mouse: true,
        usb: true,
        power: true,
        microphone: false,
      },
      motionSensitivity: "normal",  // "sensitive" | "normal" | "insensitive"
    },
  })
  .eq("id", DEVICE_ID);
```

### metadata 필드 전체 구조

| 키 | 타입 | 설명 | 기본값 |
|----|------|------|--------|
| `alarm_pin` | string | 경보 해제 PIN (4자리) | `"1234"` |
| `alarm_sound_id` | string | 경보음 ID | `"police-siren"` |
| `require_pc_pin` | boolean | PC에서 해제 시 PIN 필요 | `true` |
| `camouflage_mode` | boolean | 위장 모드 (화면 검게) | `false` |
| `sensorSettings` | object | 센서별 ON/OFF | 아래 참조 |
| `motionSensitivity` | string | 카메라 민감도 | `"normal"` |

---

## 4️⃣ 감시 시작/중지 (DB is_monitoring)

```typescript
// 감시 시작
await supabase
  .from("devices")
  .update({ is_monitoring: true })
  .eq("id", DEVICE_ID);

// 감시 중지
await supabase
  .from("devices")
  .update({ is_monitoring: false })
  .eq("id", DEVICE_ID);
```

---

## 5️⃣ 장치 상태 확인 (Presence 채널)

### 채널: `user-presence-${userId}` (v2 통합 채널)

```typescript
const presenceChannel = supabase.channel(`user-presence-${userId}`, {
  config: { presence: { key: DEVICE_ID } },
});

presenceChannel
  .on("presence", { event: "sync" }, () => {
    const state = presenceChannel.presenceState();
    const entries = state[DEVICE_ID];
    
    if (entries && entries.length > 0) {
      // 랩탑 온라인
      const latest = entries[entries.length - 1];
      console.log("Network:", latest.is_network_connected);
      console.log("Last seen:", latest.last_seen_at);
    } else {
      // 랩탑 오프라인
    }
  })
  .subscribe();
```

---

## 6️⃣ 원격 명령 (DB metadata 플래그)

### 위치 확인 요청

```typescript
await supabase
  .from("devices")
  .update({
    metadata: {
      ...currentMetadata,
      locate_requested: new Date().toISOString(),  // ⚠️ "locate_requested" 정확히 사용
    },
  })
  .eq("id", DEVICE_ID);

// 결과: devices.latitude, devices.longitude, devices.location_updated_at 에 기록됨
// 완료 후 locate_requested는 null로 초기화됨
```

### 네트워크 정보 요청

```typescript
await supabase
  .from("devices")
  .update({
    metadata: {
      ...currentMetadata,
      network_info_requested: new Date().toISOString(),  // ⚠️ "network_info_requested" 정확히 사용
    },
  })
  .eq("id", DEVICE_ID);

// 결과: devices.metadata.network_info 에 기록됨
// 완료 후 network_info_requested는 null로 초기화됨
```

---

## ⚠️ 중요 사항

1. **동일 Supabase 프로젝트** 사용 필수 (project ref: `sltxwkdvaapyeosikegj`)
2. **DEVICE_ID**는 `devices` 테이블의 `id` (UUID) - 양쪽 앱이 동일한 값 사용
3. **Presence key**는 항상 `DEVICE_ID`로 설정
4. 설정 변경 시 기존 metadata를 spread(`...currentMetadata`)하여 덮어쓰기 방지
5. `is_monitoring` 컬럼은 metadata가 아닌 **별도 컬럼**으로 관리
