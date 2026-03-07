# 기기명 SSOT (Single Source of Truth) 가이드

## 개요

기기명 혼선 문제를 근본적으로 해결하기 위해, **`licenses.device_name`을 시리얼↔기기명 매핑의 유일한 진실의 원천(SSOT)**으로 사용합니다.

**핵심 원칙: 1 시리얼 키 = 1 기기명, licenses.device_name이 항상 최우선**

## 데이터 흐름

```
시리얼 키 → licenses.device_name (SSOT)
                    ↓ 동기화
              devices.device_name
              devices.name
```

## 변경 사항 요약

### 1. DB 스키마 (완료)
```sql
ALTER TABLE public.licenses ADD COLUMN device_name text;
```

### 2. register-device Edge Function (완료)
- **재접속 시**: licenses.device_name을 우선 참조하여 devices.name 동기화
- **새 등록 시**: devices에 삽입 후 licenses.device_name도 함께 저장
- **device_type 변경**: 재접속 시 device_type이 다르면 업데이트 (시리얼을 다른 종류 기기에서 사용하는 경우)

이름 결정 우선순위:
1. `licenses.device_name` (SSOT)
2. `devices.device_name` (기존 커스텀 이름)
3. 요청에서 전달된 `device_name`
4. 기본값 ("My Laptop")

### 3. update-device Edge Function (완료)
- 기기명 변경 시 `licenses.device_name`도 자동 동기화
- `devices.id` 기준으로 `licenses.device_id`와 매칭하여 업데이트

## 프로젝트별 필요 작업

### 🟢 스마트폰 앱 (완료)
- Edge Function 변경으로 자동 적용
- 추가 코드 변경 불필요

### 🔴 노트북 앱 (수정 필요)

#### 1. register-device 응답 처리
```typescript
// register-device 호출 후 반환된 device_name을 로컬에 반영
const result = await registerDeviceViaEdge({
  user_id, device_name, device_type, serial_key
});

// ★ 서버가 반환한 이름이 SSOT → 로컬 DB/UI에 반영
if (result?.device_name && result.device_name !== localDeviceName) {
  console.log(`[SSOT] 서버 이름 적용: "${result.device_name}" (로컬: "${localDeviceName}")`);
  // 로컬 DB 업데이트
  await updateLocalDeviceName(result.device_name);
  // UI 반영
  setDeviceName(result.device_name);
}
```

#### 2. 하트비트에서 이름 전송 금지
```typescript
// ❌ 하트비트에서 name을 보내면 SSOT 이름을 덮어쓸 수 있음
await updateDeviceViaEdge(deviceId, {
  status: "online",
  last_seen_at: new Date().toISOString(),
  // name: deviceName,  ← 절대 보내지 말 것!
});
```

#### 3. 기기명 변경 시 update-device 호출
```typescript
// update-device가 자동으로 licenses.device_name도 갱신
await updateDeviceViaEdge(deviceId, { name: newName });
// 추가 작업 불필요 — SSOT 동기화는 서버에서 처리
```

### 🟠 웹사이트 (검토 필요)

#### 옵션 A: 공유 DB licenses를 직접 조회
```typescript
// 스마트폰 앱이 authSerials에서 기기명을 표시할 때
// 웹사이트 DB serial_numbers.device_name 대신 공유 DB licenses.device_name 사용
const { data: licenses } = await fetch(
  `${UNIFIED_URL}/rest/v1/licenses?user_id=eq.${userId}&select=serial_key,device_name`,
  { headers: { apikey: UNIFIED_ANON_KEY, Authorization: `Bearer ${UNIFIED_ANON_KEY}` } }
).then(r => r.json());
```

#### 옵션 B: 양방향 동기화
노트북에서 기기명 변경 → 공유 DB licenses.device_name 갱신 → 웹사이트 DB serial_numbers.device_name도 업데이트

**권장: 옵션 A** (웹사이트가 공유 DB를 직접 조회)

## 데이터 흐름 시나리오

### 시나리오 1: 노트북 최초 등록
```
노트북 → register-device(serial_key=AAAA, device_name="woojoo")
  → devices: INSERT (name="woojoo")
  → licenses: UPSERT (serial_key=AAAA, device_name="woojoo")
```

### 시나리오 2: 노트북 재접속 (이름 보존)
```
노트북 → register-device(serial_key=AAAA, device_name="My Laptop")
  → licenses에서 조회: device_name="woojoo" (SSOT)
  → devices: UPDATE (name="woojoo", SSOT 이름 유지)
  → 응답: device_name="woojoo"
```

### 시나리오 3: 기기명 변경
```
노트북 → update-device(id=uuid, name="새이름")
  → devices: UPDATE (name="새이름")
  → licenses: UPDATE (device_name="새이름") ← 자동 SSOT 동기화
```

### 시나리오 4: 같은 시리얼을 다른 기기 타입에서 사용
```
스마트폰(기존) → device_type="smartphone", name="2221"
노트북(새 접속) → register-device(serial_key=AAAA, device_type="laptop", device_name="2233")
  → licenses에서 조회: device_name="2233" (있으면 SSOT)
  → devices: UPDATE (device_type="laptop", name="2233")
```

## 주의사항

- `licenses.device_name`이 NULL이면 아직 SSOT가 설정되지 않은 상태 → 기존 로직(devices.name)으로 폴백
- UNIQUE 제약: `(serial_key, device_type)` — 같은 시리얼로 laptop/smartphone 각각 등록 가능
- 기기명 중복 방지(deduplicateName)는 SSOT 이름 적용 후에도 동작
- 하트비트에서 name을 보내지 않도록 주의 (SSOT 덮어쓰기 방지)
