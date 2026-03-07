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

## 🔍 검증 체크리스트

- [ ] 스마트폰 `get-devices` API가 `dmvbwyfzueywuwxkjuuy` 엔드포인트를 호출하는지 확인
- [ ] 기기 목록에서 각 시리얼별 고유한 이름이 표시되는지 확인
- [ ] 외부 공유 DB의 오래된 devices 레코드가 삭제되었는지 확인
- [ ] 기기 이름 변경 시 로컬 DB에 정확히 반영되는지 확인
- [ ] 동일 이름 등록 시 자동 접미사가 추가되는지 확인 (예: "2221 (EE03)")
