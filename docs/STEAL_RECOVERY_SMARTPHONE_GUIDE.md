# 도난 복구 & 경보 강화 — 스마트폰 앱 구현 가이드

## 📋 개요

컴퓨터(랩탑)에 도난 복구 시스템이 추가되었습니다.
경보 발생 시 **위치 정보**와 **자동 스트리밍** 데이터가 함께 전송됩니다.
스마트폰 앱은 경보 화면에서 아래 순서로 콘텐츠를 표시해야 합니다:

1. **동영상 스트리밍** (WebRTC 자동 연결)
2. **위치 정보 지도** (GPS 좌표)
3. **캡처 사진** (photo_alert 프로토콜)

---

## 1️⃣ 변경된 Presence 경보 페이로드

### 기존

```json
{
  "active_alert": {
    "id": "...",
    "event_type": "alert_camera_motion",
    "event_data": {
      "alert_type": "camera_motion",
      "message": "카메라 모션 감지",
      "photo_count": 10,
      "change_percent": 25.3
    }
  }
}
```

### 변경 후 (신규 필드 ✅ 표시)

```json
{
  "active_alert": {
    "id": "...",
    "device_id": "...",
    "event_type": "alert_camera_motion",
    "event_data": {
      "alert_type": "camera_motion",
      "message": "카메라 모션 감지 (변화율: 25.3%)",
      "photo_count": 10,
      "change_percent": 25.3,
      "latitude": 37.5665,         // ✅ GPS 위도
      "longitude": 126.9780,       // ✅ GPS 경도
      "auto_streaming": true       // ✅ 스트리밍 자동 시작 플래그
    },
    "created_at": "2026-02-15T10:00:00.000Z"
  }
}
```

### 도난 복구 시 추가 필드

```json
{
  "active_alert": {
    "event_data": {
      "is_recovery": true,          // ✅ 도난 복구 경보
      "lost_at": "2026-02-15T09:50:00.000Z",    // ✅ 네트워크 끊긴 시각
      "recovered_at": "2026-02-15T10:05:00.000Z", // ✅ 네트워크 복구 시각
      "latitude": 37.5700,
      "longitude": 126.9800,
      "auto_streaming": true,
      "message": "🔄 네트워크 복구 — 카메라 모션 감지"
    }
  }
}
```

---

## 2️⃣ 사진 전송 종료 메시지 변경 (`photo_alert_end`)

`photo_alert_end` 이벤트에 위치 + 스트리밍 정보가 추가됩니다.

### 기존

```json
{
  "event": "photo_alert_end",
  "payload": {
    "id": "alert-id",
    "total_photos": 10
  }
}
```

### 변경 후

```json
{
  "event": "photo_alert_end",
  "payload": {
    "id": "alert-id",
    "total_photos": 10,
    "latitude": 37.5665,       // ✅ 위치 정보
    "longitude": 126.9780,     // ✅ 위치 정보
    "auto_streaming": true     // ✅ 스트리밍 자동 시작
  }
}
```

---

## 3️⃣ 스마트폰 앱 수정 사항

### 3-1. `useAlerts.tsx` — 경보 수신 시 위치/스트리밍 데이터 전달

`ActiveAlert` 인터페이스에 새 필드를 추가합니다:

```typescript
export interface ActiveAlert {
  id: string;
  type: LocalAlertType;
  title: string;
  message: string | null;
  created_at: string;
  // ✅ 신규 필드
  latitude?: number;
  longitude?: number;
  auto_streaming?: boolean;
  is_recovery?: boolean;
  lost_at?: string;
  recovered_at?: string;
}
```

Presence sync 핸들러에서 새 필드를 매핑합니다:

```typescript
// 기존 handleAlert 내부에서 ActiveAlert 변환 시:
const alert: ActiveAlert = {
  id: foundAlert.id,
  type: foundAlert.event_type || foundAlert.type,
  title: foundAlert.event_data?.message || foundAlert.title || "경보 발생",
  message: foundAlert.event_data?.message || foundAlert.message,
  created_at: foundAlert.created_at,
  // ✅ 위치 + 스트리밍 정보
  latitude: foundAlert.event_data?.latitude,
  longitude: foundAlert.event_data?.longitude,
  auto_streaming: foundAlert.event_data?.auto_streaming,
  is_recovery: foundAlert.event_data?.is_recovery,
  lost_at: foundAlert.event_data?.lost_at,
  recovered_at: foundAlert.event_data?.recovered_at,
};
```

### 3-2. `usePhotoReceiver.ts` — `photo_alert_end`에서 위치/스트리밍 수신

`PhotoAlert` 인터페이스에 위치 필드를 추가합니다:

```typescript
export interface PhotoAlert {
  // ... 기존 필드
  latitude?: number;       // ✅
  longitude?: number;      // ✅
  auto_streaming?: boolean; // ✅
}
```

`photo_alert_end` 핸들러에서 데이터를 저장합니다:

```typescript
.on("broadcast", { event: "photo_alert_end" }, ({ payload }) => {
  const pending = pendingRef.current;
  if (!pending || pending.id !== payload.id) return;

  const completed: PhotoAlert = {
    id: pending.id,
    device_id: pending.device_id,
    event_type: pending.event_type,
    total_photos: pending.photos.length,
    change_percent: pending.change_percent,
    photos: pending.photos,
    created_at: pending.created_at,
    is_read: false,
    // ✅ 위치 + 스트리밍
    latitude: payload.latitude,
    longitude: payload.longitude,
    auto_streaming: payload.auto_streaming ?? false,
  };

  savePhotoAlert(completed);
  // ...
})
```

### 3-3. `AlertMode.tsx` — 경보 화면 레이아웃 변경

경보 화면 표시 순서: **동영상 → 지도 → 사진 → 해제 버튼**

```tsx
import { useWebRTCViewer } from "@/hooks/useWebRTCViewer";
import { LocationMapModal } from "@/components/LocationMapModal";

const AlertMode = ({ device, activeAlert, onDismiss, onSendRemoteAlarmOff }: AlertModeProps) => {
  // ✅ WebRTC 자동 연결 (auto_streaming이 true일 때)
  const { videoRef, isConnected } = useWebRTCViewer(
    activeAlert.auto_streaming ? device.id : null
  );
  
  return (
    <div className="fixed inset-0 bg-red-800/60 backdrop-blur-2xl z-50 flex flex-col overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4">
        <span className="text-white font-black text-xl">
          {activeAlert.is_recovery ? "🔄 도난 기기 복구!" : "🚨 보안 경보"}
        </span>
      </div>
      
      {/* 1️⃣ 동영상 스트리밍 (최상단) */}
      {activeAlert.auto_streaming && (
        <div className="px-4 pb-2">
          <div className="bg-black/40 rounded-2xl overflow-hidden border border-white/20">
            <div className="flex items-center gap-2 px-3 py-2">
              <span className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
              <span className="text-white/80 text-xs font-semibold">실시간 스트리밍</span>
            </div>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full aspect-video object-cover"
            />
            {!isConnected && (
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-white/60 text-sm">연결 중...</span>
              </div>
            )}
          </div>
        </div>
      )}
      
      {/* 2️⃣ 위치 정보 지도 */}
      {activeAlert.latitude && activeAlert.longitude && (
        <div className="px-4 pb-2">
          <div className="bg-black/40 rounded-2xl overflow-hidden border border-white/20 p-3">
            <div className="flex items-center gap-2 mb-2">
              <span className="text-white/80 text-xs font-semibold">📍 기기 위치</span>
            </div>
            {/* LocationMapModal을 인라인 지도로 표시하거나 
                leaflet 지도를 직접 렌더링 */}
            <div className="w-full h-48 rounded-xl overflow-hidden">
              {/* Leaflet 지도 컴포넌트 삽입 */}
              <iframe
                src={`https://www.openstreetmap.org/export/embed.html?bbox=${activeAlert.longitude - 0.005},${activeAlert.latitude - 0.003},${activeAlert.longitude + 0.005},${activeAlert.latitude + 0.003}&layer=mapnik&marker=${activeAlert.latitude},${activeAlert.longitude}`}
                className="w-full h-full border-0"
                title="Device location"
              />
            </div>
            <p className="text-white/60 text-xs mt-2 text-center">
              위도: {activeAlert.latitude.toFixed(6)}, 경도: {activeAlert.longitude.toFixed(6)}
            </p>
          </div>
        </div>
      )}
      
      {/* 3️⃣ 캡처 사진 (기존 capturedImages) */}
      {capturedImages.length > 0 && (
        <div className="flex gap-2 px-4 overflow-x-auto py-2">
          {capturedImages.map((img, index) => (
            <div key={index} className="relative flex-shrink-0">
              <img src={img} alt={`캡처 ${index + 1}`}
                className="w-24 h-24 object-cover rounded-xl border border-white/20" />
            </div>
          ))}
        </div>
      )}
      
      {/* 복구 정보 배너 */}
      {activeAlert.is_recovery && (
        <div className="mx-4 mb-2 bg-yellow-500/20 border border-yellow-400/30 rounded-xl p-3">
          <p className="text-yellow-200 text-xs font-semibold">
            🔄 도난 기기가 네트워크에 다시 연결되었습니다
          </p>
          {activeAlert.lost_at && (
            <p className="text-yellow-200/60 text-xs mt-1">
              연결 끊김: {new Date(activeAlert.lost_at).toLocaleTimeString()}
              → 복구: {activeAlert.recovered_at ? new Date(activeAlert.recovered_at).toLocaleTimeString() : "방금"}
            </p>
          )}
        </div>
      )}
      
      {/* 경보 메시지 + 해제 버튼 (기존) */}
      {/* ... 기존 코드 유지 ... */}
    </div>
  );
};
```

---

## 4️⃣ 도난 복구 시나리오 흐름

```
[경보 발생]
노트북 센서 감지 → 경보 + GPS + 스트리밍 + 사진
  ↓
스마트폰: 동영상 → 지도 → 사진 순서로 경보 화면 표시

[네트워크 끊김 (도난 이동)]
노트북 localStorage에 경보 상태 저장
  ↓
스마트폰: "기기 오프라인" 상태 표시

[네트워크 복구]
노트북 자동 실행:
  1. GPS 위치 수집
  2. DB 업데이트 (위치 + is_streaming_requested=true)
  3. Presence 경보 재전송 (is_recovery=true)
  4. 푸시 알림 전송 (위치 포함)
  5. 30초 간격 위치 추적 시작
  ↓
스마트폰: 경보 재수신 → 새 위치 + 스트리밍 표시

[경보 해제]
스마트폰에서 해제 → 노트북 복구 모드 종료 + 추적 중단
```

---

## 5️⃣ DB 변경사항 (devices 테이블)

경보 발생 시 자동으로 업데이트되는 필드:

| 필드 | 경보 시 | 복구 시 |
|------|---------|---------|
| `latitude` | GPS 좌표 | 새 GPS 좌표 |
| `longitude` | GPS 좌표 | 새 GPS 좌표 |
| `location_updated_at` | 현재 시각 | 현재 시각 |
| `is_streaming_requested` | `true` | `true` |
| `metadata.last_location_source` | `"alert_triggered"` | `"steal_recovery"` |
| `metadata.steal_recovery` | — | `{ recovered_at, lost_at, alert_type }` |

---

## ⚠️ 중요 사항

1. **스마트폰에서 경보 해제 시** → 노트북의 도난 복구 모드가 자동 비활성화됩니다 (추적 중단)
2. `auto_streaming: true`일 때 WebRTC Viewer를 **자동으로** 시작해야 합니다
3. `is_recovery: true`일 때는 "🔄 도난 기기 복구!" 타이틀을 표시합니다
4. 위치 정보가 없을 수 있습니다 (GPS 불가 환경) — `latitude`/`longitude`가 없으면 지도 섹션을 숨깁니다
5. `photo_alert_end` 메시지에도 위치/스트리밍 정보가 포함됩니다 — 사진 수신 완료 후 지도+스트리밍을 표시하는 데 활용할 수 있습니다
