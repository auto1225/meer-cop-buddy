# 스마트폰 앱 - licenses 테이블 연동 가이드

## 개요

`licenses` 테이블은 **시리얼 키 → 기기 ID** 매핑의 유일한 진실의 원천(Single Source of Truth)입니다.
기존의 이름/순서/온라인 상태 기반 추측 로직을 모두 제거하고, 이 테이블만 조회하여 매칭합니다.

**핵심 원칙: 시리얼 키 1개 = 노트북 1대**

## 테이블 스키마

```sql
licenses (
  id          uuid PRIMARY KEY,
  serial_key  text NOT NULL,        -- 12자리 시리얼 키 (예: XXXX-XXXX-XXXX)
  user_id     text NOT NULL,        -- 사용자 ID
  device_id   uuid → devices(id),   -- 매핑된 기기의 UUID
  device_type text DEFAULT 'laptop', -- 기기 유형
  created_at  timestamptz,
  updated_at  timestamptz,
  UNIQUE(serial_key, device_type)
)
```

## device_id 생성 규칙

노트북이 `register-device`를 호출하면 다음과 같이 고유 `device_id`가 생성됩니다:

```
serial_key 있는 경우: ${user_id}_${serial_key}_laptop
serial_key 없는 경우: ${user_id}_laptop (레거시 호환)
```

이로 인해 **같은 유저가 서로 다른 시리얼 키로 여러 노트북을 등록**하면 각각 고유한 devices 레코드가 생성됩니다.

## 프로젝트 정보

- **DB 위치**: 로컬 통합 프로젝트 (`dmvbwyfzueywuwxkjuuy`)
- **접근 방식**: Edge Function 또는 직접 REST API 호출

## 스마트폰 앱에서 해야 할 일

### 1. 기기 관리 페이지에서 licenses 테이블 조회

기존의 이름/순서 기반 매칭 로직을 **제거**하고, `licenses` 테이블을 조회하여 시리얼 키 → 기기 매핑을 수행합니다.

```typescript
// 사용자의 모든 라이선스 조회
const { data: licenses } = await supabase
  .from("licenses")
  .select("serial_key, device_id, device_type, updated_at")
  .eq("user_id", userId);

// licenses를 devices와 JOIN하여 기기 정보 표시
// licenseMap: serial_key → device_id
const licenseMap = new Map(
  licenses?.map(l => [l.serial_key, l.device_id]) || []
);
```

### 2. 매칭 실패 시 처리

`licenseMap`에서 특정 시리얼 키에 대한 `device_id`가 없으면:
- **"기기 미연결"**로 명확히 표시
- 추측하지 않음 (이름, 순서, 온라인 상태 등으로 폴백하지 않음)

### 3. 폴백: metadata.serial_key 확인

`licenses` 테이블에 매핑이 없을 경우, 공유 DB의 `devices.metadata.serial_key`로 2차 매칭:

```typescript
// 1차: licenses 테이블
const license = licenses.find(l => l.serial_key === targetSerial);
if (license?.device_id) {
  return license.device_id; // 확정 매핑
}

// 2차: devices.metadata.serial_key (공유 DB에 serial_key가 metadata로 저장됨)
const device = devices.find(d => d.metadata?.serial_key === targetSerial);
if (device) {
  return device.id; // metadata 기반 매핑
}

// 매핑 실패 → "기기 미연결" 표시
```

### 4. Edge Function 호출 (대안)

직접 REST API 대신 Edge Function을 통해 조회하려면:

```typescript
const UNIFIED_URL = "https://dmvbwyfzueywuwxkjuuy.supabase.co";
const UNIFIED_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...";

// get-devices는 이미 존재하므로, licenses는 직접 REST API로 조회
const res = await fetch(
  `${UNIFIED_URL}/rest/v1/licenses?user_id=eq.${userId}&select=serial_key,device_id,device_type`,
  {
    headers: {
      apikey: UNIFIED_ANON_KEY,
      Authorization: `Bearer ${UNIFIED_ANON_KEY}`,
    },
  }
);
const licenses = await res.json();
```

### 5. 다중 노트북 관리 흐름

```
유저가 시리얼 A로 노트북1 등록:
  → device_id: "${user_id}_AAAA-BBBB-CCCC_laptop"
  → licenses: serial_key=AAAA-BBBB-CCCC → device_id=uuid1

유저가 시리얼 B로 노트북2 등록:
  → device_id: "${user_id}_DDDD-EEEE-FFFF_laptop"
  → licenses: serial_key=DDDD-EEEE-FFFF → device_id=uuid2

스마트폰에서 기기 목록 조회:
  → licenses 테이블에서 user_id로 조회
  → 시리얼 A → 노트북1 (uuid1)
  → 시리얼 B → 노트북2 (uuid2)
  → 각 기기에 독립적으로 명령 전송 가능
```

### 6. 데이터 흐름 요약

```
노트북 앱 접속
  → validateSerial(serial_key)
  → registerDeviceViaEdge({ ..., serial_key })
  → register-device Edge Function
    → devices 테이블에 device_id="${user_id}_${serial_key}_laptop" 으로 upsert
    → licenses 테이블에 serial_key → device_id upsert
    → metadata에도 serial_key 저장

스마트폰 앱 기기 관리 페이지
  → licenses 테이블 조회 (user_id 기준)
  → serial_key → device_id 매핑 획득
  → devices 테이블과 JOIN하여 기기 상태 표시
  → 매핑 없으면 "기기 미연결" 표시
```

## 주의사항

- `licenses` 테이블은 로컬 통합 DB(`dmvbwyfzueywuwxkjuuy`)에만 존재합니다
- 공유 프로젝트(`sltxwkdvaapyeosikegj`)에는 없으므로, 스마트폰 앱이 로컬 통합 DB를 직접 조회해야 합니다
- UNIQUE 제약: `(serial_key, device_type)` — 같은 시리얼로 laptop/smartphone 각각 등록 가능
- `device_id`가 NULL이면 기기가 아직 등록되지 않은 상태입니다
- 공유 DB에는 `metadata.serial_key`로 폴백 매핑 가능
