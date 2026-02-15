# 도난 복구 시스템 (Steal Recovery) 가이드

## 📋 개요

경보 발생 후 노트북이 도난되어 네트워크 범위를 벗어난 경우,
다시 네트워크에 연결되면 자동으로 복구 시퀀스를 실행합니다.

---

## 1️⃣ 동작 흐름

```
경보 발생 → localStorage에 상태 저장
     ↓
네트워크 끊김 → lostAt 타임스탬프 기록
     ↓
네트워크 재연결 → 복구 시퀀스 실행
  1. GPS 위치 확인 → DB 업데이트
  2. Presence로 경보 재전송
  3. 푸시 알림 전송 (위치 포함)
  4. 스트리밍 자동 시작 (is_streaming_requested = true)
  5. 30초 간격 위치 추적 시작
```

---

## 2️⃣ 스마트폰 경보 화면 표시 순서

경보 수신 시 스마트폰 앱은 아래 순서로 표시:

1. **동영상 스트리밍** (WebRTC 자동 연결)
2. **위치 정보 지도** (latitude/longitude 좌표)
3. **캡처 사진** (photo_alert 프로토콜)

---

## 3️⃣ 경보 페이로드 변경사항

### Presence alert 데이터 (event_data 확장)

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
      "change_percent": 25.3,
      "latitude": 37.5665,
      "longitude": 126.9780,
      "auto_streaming": true
    },
    "created_at": "2026-02-15T10:00:00.000Z"
  }
}
```

### 복구 시 추가 필드

```json
{
  "event_data": {
    "is_recovery": true,
    "lost_at": "2026-02-15T09:50:00.000Z",
    "recovered_at": "2026-02-15T10:05:00.000Z",
    "latitude": 37.5700,
    "longitude": 126.9800,
    "auto_streaming": true
  }
}
```

---

## 4️⃣ 사진 전송 종료 메시지 변경

`photo_alert_end` 이벤트에 위치 + 스트리밍 정보 추가:

```json
{
  "event": "photo_alert_end",
  "payload": {
    "id": "alert-id",
    "total_photos": 10,
    "latitude": 37.5665,
    "longitude": 126.9780,
    "auto_streaming": true
  }
}
```

### 스마트폰 처리 예시

```typescript
photoChannel.on("broadcast", { event: "photo_alert_end" }, (payload) => {
  const data = payload.payload;
  
  // 1. 위치 정보 → 지도 표시
  if (data.latitude && data.longitude) {
    showLocationMap(data.latitude, data.longitude);
  }
  
  // 2. 스트리밍 자동 시작
  if (data.auto_streaming) {
    startWebRTCViewer(deviceId);
  }
});
```

---

## 5️⃣ 비활성화 조건

- ✅ 스마트폰에서 경보 해제 → 복구 비활성화
- ✅ 노트북에서 PIN으로 경보 해제 → 복구 비활성화
- ❌ 단순 네트워크 끊김 (경보 없음) → 해당 없음

---

## 6️⃣ localStorage 키

| 키 | 설명 |
|----|------|
| `meercop_stolen_state` | 도난 복구 상태 JSON |

```json
{
  "isActive": true,
  "alertEventType": "alert_camera_motion",
  "alertMessage": "카메라 모션 감지",
  "alertCreatedAt": "2026-02-15T10:00:00.000Z",
  "lostAt": "2026-02-15T10:01:00.000Z"
}
```
