# 기기 이름 중복 문제 수정 가이드

## 📋 문제 요약

스마트폰 앱에서 서로 다른 시리얼 키를 가진 기기들이 동일한 이름("2221")으로 표시되는 문제.

### 근본 원인
스마트폰 앱이 **외부 공유 DB** (`sltxwkdvaapyeosikegj`)에서 기기 목록을 조회하고 있었으나,  
노트북 앱은 **로컬 통합 DB** (`dmvbwyfzueywuwxkjuuy`)에서 이름을 업데이트하고 있어  
두 DB 간의 이름 데이터가 불일치합니다.

| 시리얼 | 로컬 DB (정확) | 공유 DB (오래됨) | 스마트폰 표시 |
|--------|---------------|-----------------|--------------|
| TEST-MNTH-EE03 | 9900 | 2221 | ❌ 2221 |
| TEST-YEAR-FF01 | 2221 | 2221 | 2221 |
| TEST-MNTH-EE02 | 3344 | 5555 | ❌ 5555 |

---

## ✅ 수정 사항

### 1. `register-device` Edge Function 개선 (노트북 앱 - 완료)

**자동 이름 중복 방지 로직 추가:**
- 동일 `user_id` 내에서 같은 이름의 기기가 이미 존재하면 시리얼 키 접미사를 자동 추가
- 예: `"2221"` → `"2221 (EE03)"`
- 새 기기 등록 및 기존 기기 재등록 시 모두 적용

```typescript
// 중복 발견 시 시리얼 키 마지막 4자리를 접미사로 추가
const suffix = serialKey.slice(-4).toUpperCase();
const newName = `${candidateName} (${suffix})`; // "2221 (EE03)"
```

---

## 📱 스마트폰 앱 필수 수정 사항

### ⚠️ 최우선: 기기 목록 조회 소스 변경

스마트폰 앱이 기기 목록을 조회하는 API 엔드포인트를 **반드시** 로컬 통합 DB로 변경해야 합니다.

#### 변경 전 (❌ 오래된 데이터)
```typescript
// 외부 공유 DB → 이름 데이터가 동기화되지 않음
const SUPABASE_URL = "https://sltxwkdvaapyeosikegj.supabase.co";
const response = await fetch(`${SUPABASE_URL}/functions/v1/get-devices`, { ... });
```

#### 변경 후 (✅ 정확한 데이터)
```typescript
// 로컬 통합 DB → 노트북 앱과 동일한 DB 사용
const SUPABASE_URL = "https://dmvbwyfzueywuwxkjuuy.supabase.co";
const ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdmJ3eWZ6dWV5d3V3eGtqdXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTI2ODMsImV4cCI6MjA4NTg2ODY4M30.0lDX72JHWonW5fRRPve_cdfJrNVyDMzz5nzshJ0cEuI";

const response = await fetch(`${SUPABASE_URL}/functions/v1/get-devices`, {
  method: "POST",
  headers: {
    "Content-Type": "application/json",
    "apikey": ANON_KEY,
    "Authorization": `Bearer ${ANON_KEY}`,
  },
  body: JSON.stringify({ user_id: userId }),
});
```

### 적용해야 하는 API 목록

| API | 용도 | 엔드포인트 |
|-----|------|-----------|
| `get-devices` | 기기 목록 조회 | `POST /functions/v1/get-devices` |
| `register-device` | 기기 등록 | `POST /functions/v1/register-device` |
| `update-device` | 기기 상태 업데이트 | `POST /functions/v1/update-device` |

**모든 API의 base URL을 `https://dmvbwyfzueywuwxkjuuy.supabase.co`로 통일하세요.**

---

### 2. 외부 공유 DB 오래된 데이터 정리

스마트폰 앱이 로컬 DB로 전환된 후, 외부 공유 DB(`sltxwkdvaapyeosikegj`)의 `devices` 테이블에서  
해당 `user_id`의 기기 레코드를 **영구 삭제**하여 혼선을 방지합니다.

```sql
-- 외부 공유 DB에서 실행 (sltxwkdvaapyeosikegj)
DELETE FROM devices WHERE user_id = 'cdf717ae-d25e-4a29-b635-0780ecc8aab4';
```

### 3. Realtime 채널도 로컬 DB 기준으로 변경

기기 명령(command), 상태(presence), 알림(alerts) 채널도 로컬 DB 클라이언트를 사용해야 합니다.

```typescript
import { createClient } from '@supabase/supabase-js';

// 로컬 통합 DB 클라이언트
const supabaseLocal = createClient(
  "https://dmvbwyfzueywuwxkjuuy.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdmJ3eWZ6dWV5d3V3eGtqdXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTI2ODMsImV4cCI6MjA4NTg2ODY4M30.0lDX72JHWonW5fRRPve_cdfJrNVyDMzz5nzshJ0cEuI"
);

// 채널 구독도 이 클라이언트 사용
const channel = supabaseLocal.channel(`user-presence-${userId}`);
```

---

### 4. ⚠️ 스마트폰 Presence 연결 (스마트폰 "연결됨" 표시 필수)

랩탑 앱은 **공유 DB(`sltxwkdvaapyeosikegj`)**의 `user-alerts-${userId}` 채널에서 `role === "phone"` Presence를 감지하여 스마트폰 연결 상태를 판단합니다.

**스마트폰이 "미연결"로 표시되는 원인:**
- 스마트폰이 다른 DB의 채널에 접속하고 있음
- 스마트폰이 `role: "phone"`을 Presence에 포함하지 않음
- 채널명이 `user-alerts-${userId}`가 아닌 다른 이름 사용

#### 스마트폰에서 반드시 구현해야 할 코드

```typescript
import { createClient } from '@supabase/supabase-js';

// ⚠️ 반드시 공유 DB 클라이언트 사용 (랩탑과 동일한 Realtime 서버)
const supabaseShared = createClient(
  "https://sltxwkdvaapyeosikegj.supabase.co",
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdHh3a2R2YWFweWVvc2lrZWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNjg4MjQsImV4cCI6MjA4NTg0NDgyNH0.hj6A8YDTRMQkPid9hfw6vnGC2eQLTmv2JPmQRLv4sZ4"
);

// 채널명: user-alerts-${userId} (랩탑과 동일)
const alertChannel = supabaseShared.channel(`user-alerts-${userId}`, {
  config: { presence: { key: `phone-${userId}` } },  // key는 자유롭게 설정
});

alertChannel
  .on("presence", { event: "sync" }, () => {
    // 랩탑의 알림 상태 감지 등
  })
  .on("broadcast", { event: "active_alert" }, (payload) => {
    // 경보 수신
  })
  .subscribe(async (status) => {
    if (status === "SUBSCRIBED") {
      // ⚠️ 핵심: role: "phone" 반드시 포함!
      await alertChannel.track({
        role: "phone",                          // ← 이 값이 없으면 랩탑에서 감지 불가
        device_type: "smartphone",
        user_id: userId,
        online_at: new Date().toISOString(),
      });
      console.log("✅ Phone presence tracked on user-alerts channel");
    }
  });
```

#### 감지 로직 (랩탑 측 - 이미 구현됨)
```typescript
// src/hooks/useAlerts.ts 에서:
const hasPhone = Object.values(state).some((presences) =>
  (presences as Record<string, unknown>[]).some((p) => p.role === "phone")
);
// → hasPhone이 true이면 스마트폰 아이콘이 "연결됨"으로 표시
```

#### DB API vs Realtime 채널 사용 구분

| 기능 | 사용할 DB | 이유 |
|------|----------|------|
| `get-devices` API | **로컬 DB** (`dmvbwyfzueywuwxkjuuy`) | 기기 이름/설정 정확성 |
| `register-device` API | **로컬 DB** (`dmvbwyfzueywuwxkjuuy`) | 기기 등록 |
| `update-device` API | **로컬 DB** (`dmvbwyfzueywuwxkjuuy`) | 기기 상태 업데이트 |
| Presence 채널 (`user-alerts-*`) | **공유 DB** (`sltxwkdvaapyeosikegj`) | 실시간 Presence/알림 |
| Presence 채널 (`user-presence-*`) | **공유 DB** (`sltxwkdvaapyeosikegj`) | 기기 온라인 상태 |
| Broadcast 채널 (`user-photos-*`) | **공유 DB** (`sltxwkdvaapyeosikegj`) | 사진 전송 |
| Broadcast 채널 (`user-commands-*`) | **공유 DB** (`sltxwkdvaapyeosikegj`) | 원격 명령 |

---

## 🔍 검증 체크리스트

- [ ] 스마트폰 `get-devices` API가 `dmvbwyfzueywuwxkjuuy` 엔드포인트를 호출하는지 확인
- [ ] 기기 목록에서 각 시리얼별 고유한 이름이 표시되는지 확인
- [ ] 외부 공유 DB의 오래된 devices 레코드가 삭제되었는지 확인
- [ ] 기기 이름 변경 시 로컬 DB에 정확히 반영되는지 확인
- [ ] 동일 이름 등록 시 자동 접미사가 추가되는지 확인 (예: "2221 (EE03)")
- [ ] **스마트폰이 `sltxwkdvaapyeosikegj`의 `user-alerts-${userId}` 채널에 `role: "phone"` Presence를 track하는지 확인**
- [ ] **랩탑 화면에서 스마트폰 아이콘이 "연결됨"으로 표시되는지 확인**
