# MeerCOP 코드 개선 가이드 — 역할 분담 및 프로토콜 합의

> Version 1.0 | 2026-02-18 | 원본: MeerCOP_CodeImprovement.docx (32개 이슈)

---

## 📌 목차

1. [아키텍처 원칙 (변경 불가)](#1-아키텍처-원칙)
2. [공통 프로토콜 합의사항 (양쪽 필수 적용)](#2-공통-프로토콜-합의사항)
3. [랩탑 앱 작업 목록](#3-랩탑-앱-작업-목록)
4. [스마트폰 앱 작업 목록](#4-스마트폰-앱-작업-목록)
5. [우선순위별 로드맵](#5-우선순위별-로드맵)

---

## 1. 아키텍처 원칙

아래 원칙은 이번 개선에서도 **변경하지 않습니다.**

| 원칙 | 설명 |
|------|------|
| **Local-First** | 사진/동영상은 DB에 저장하지 않음. 각 디바이스의 IndexedDB에 로컬 저장 |
| **Broadcast 전송** | 사진은 Supabase Broadcast 채널로 실시간 전송 (DB 경유 X) |
| **통합 채널** | 사용자당 3개 고정 채널: `user-presence-{userId}`, `user-alerts-{userId}`, `user-photos-{userId}` |
| **공유 DB** | 양쪽 앱이 동일한 Supabase 프로젝트(`sltxwkdvaapyeosikegj`) 사용 |
| **시리얼 인증** | 랩탑은 시리얼 키 인증, 스마트폰은 JWT 인증 (서로 다른 인증 체계) |

---

## 2. 공통 프로토콜 합의사항

> ⚠️ **양쪽 앱 모두 반드시 적용해야 하는 변경사항입니다.**

### 2-1. PIN 해시 프로토콜 (이슈 1-4)

**결정:** SHA-256 해시 사용, 서버 검증 없이 클라이언트 해시 비교

**이유:** PIN은 4자리 숫자이므로 bcrypt까지는 불필요. SHA-256 + salt로 충분.
Edge Function 서버 검증은 랩탑이 오프라인일 때 사용 불가하므로 클라이언트 검증 유지.

```
저장 형식: SHA-256(pin + device_id)  ← device_id를 salt로 사용
DB 필드: metadata.alarm_pin_hash (기존 alarm_pin 대체)
```

**마이그레이션 순서:**
1. 스마트폰: PIN 설정 시 `alarm_pin_hash = SHA256(pin + device_id)` 저장, 기존 `alarm_pin` 필드도 병행 저장 (하위 호환)
2. 랩탑: PIN 검증 시 `alarm_pin_hash` 우선 확인, 없으면 `alarm_pin` 폴백
3. 안정화 후: `alarm_pin` 필드 제거

**구현 코드 (양쪽 동일):**
```typescript
async function hashPin(pin: string, deviceId: string): Promise<string> {
  const data = new TextEncoder().encode(pin + deviceId);
  const hash = await crypto.subtle.digest("SHA-256", data);
  return Array.from(new Uint8Array(hash))
    .map(b => b.toString(16).padStart(2, "0"))
    .join("");
}

// 저장 시
const hash = await hashPin("1234", deviceId);
metadata.alarm_pin_hash = hash;

// 검증 시
const inputHash = await hashPin(userInput, deviceId);
const isValid = inputHash === metadata.alarm_pin_hash;
```

### 2-2. 사진 전송 보안 (이슈 1-5)

**결정:** 현행 Broadcast Base64 전송 방식 유지, 암호화는 Phase 2에서 도입

**이유:**
- Supabase Storage 방식은 오프라인 전송 불가 + 비용 증가
- AES-GCM E2E 암호화는 키 교환 프로토콜이 필요하여 즉시 적용 어려움
- 현재 Broadcast 채널은 TLS 암호화된 WebSocket으로 전송되므로 중간자 공격 위험은 낮음

**Phase 2 계획 (추후):**
```
키 교환: 시리얼 등록 시 ECDH 키 쌍 생성 → 공개키를 DB에 저장
암호화: AES-256-GCM (Web Crypto API)
적용 범위: photo_alert_chunk 이벤트의 photos 배열만 암호화
```

### 2-3. 하트비트 통합 (이슈 3-2)

**결정:** DB 하트비트 주기를 줄이되 완전 제거하지 않음

**이유:** Presence 채널은 실시간성은 좋으나, 앱이 재시작되면 이전 상태를 복구할 수 없음.
DB에 `last_seen_at`을 기록해야 오프라인 판정의 근거가 됨.

```
변경 전: 랩탑 60초, 스마트폰 30초 → 합계 3~4 UPDATE/분
변경 후: 랩탑 120초, 스마트폰 120초 → 합계 1 UPDATE/분
        Presence leave 시 즉시 1회 last_seen_at 갱신
```

| 앱 | 변경 전 | 변경 후 |
|----|---------|---------|
| 랩탑 | 60초 간격 DB UPDATE | 120초 간격 + Presence leave 시 1회 |
| 스마트폰 | 30초 간격 DB UPDATE | 120초 간격 + Presence leave 시 1회 |

### 2-4. ChannelManager 패턴 (이슈 2-6, 3-4)

**결정:** 각 앱에서 독립적으로 ChannelManager 싱글톤 도입

**공통 인터페이스:**
```typescript
class ChannelManager {
  private channels = new Map<string, RealtimeChannel>();
  
  getOrCreate(name: string): RealtimeChannel {
    const existing = this.channels.get(name);
    if (existing) return existing;
    
    const ch = supabase.channel(name);
    this.channels.set(name, ch);
    return ch;
  }
  
  remove(name: string): void {
    const ch = this.channels.get(name);
    if (ch) {
      supabase.removeChannel(ch);
      this.channels.delete(name);
    }
  }
  
  removeAll(): void {
    this.channels.forEach(ch => supabase.removeChannel(ch));
    this.channels.clear();
  }
}

export const channelManager = new ChannelManager();
```

### 2-5. console.log 정리 (이슈 4-1)

**결정:** 빌드 타임에 자동 제거 + 개발 중에는 유지

**양쪽 동일 설정 (vite.config.ts):**
```typescript
build: {
  minify: 'terser',
  terserOptions: {
    compress: {
      drop_console: true,
      drop_debugger: true,
    },
  },
}
```

### 2-6. 매직 넘버 상수화 (이슈 4-2)

**결정:** 각 앱에 `src/lib/constants.ts` 파일 생성

**공통 상수 (양쪽 동일 값 사용):**
```typescript
// src/lib/constants.ts
export const HEARTBEAT_INTERVAL_MS = 120_000;    // 2분
export const GPS_TIMEOUT_MS = 5_000;
export const PHOTO_CHUNK_SIZE = 2;
export const PHOTO_CHUNK_DELAY_MS = 300;
export const DEFAULT_PIN = "1234";
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 300_000;            // 5분
export const MAX_PENDING_PHOTOS = 5;
export const PRESENCE_THROTTLE_MS = 1_000;
```

---

## 3. 랩탑 앱 작업 목록

> 🖥️ 이 섹션은 **랩탑 앱(현재 프로젝트)에서만** 수행하는 작업입니다.

### 🔴 CRITICAL

| # | 이슈 | 작업 내용 | 파일 |
|---|------|----------|------|
| L-1 | 1-1 | TURN credential을 환경변수로 이동. 하드코딩된 `username`, `credential` 제거 | `useWebRTCBroadcaster.ts` |
| L-2 | 1-6 | `supabase.ts`의 하드코딩 폴백값 제거. 환경변수 미설정 시 에러 throw | `src/lib/supabase.ts` |
| L-3 | 2-1 | `handleSecurityEvent` 순차 실행 리팩토링. GPS → DB → 알림 순서 보장 | `useSecuritySurveillance.ts` |

### 🟠 HIGH

| # | 이슈 | 작업 내용 | 파일 |
|---|------|----------|------|
| L-4 | 2-2 | Battery API 리스너를 명명된 핸들러로 변경 + cleanup 추가 | `useSecuritySurveillance.ts` |
| L-5 | 2-3 | `window.__meercop_*` 전역 변수 10개를 `useRef` 또는 모듈 스코프 변수로 교체 | `useSecuritySurveillance.ts` |
| L-6 | 2-8 | `catch {}` 15곳 중 랩탑 해당분 에러 분류 처리 | 다수 |
| L-7 | 1-4 | PIN 검증을 해시 비교로 변경 (§2-1 프로토콜) | `PinKeypad.tsx`, `useAlarmSystem.ts` |

### 🟡 MEDIUM

| # | 이슈 | 작업 내용 | 파일 |
|---|------|----------|------|
| L-8 | 3-1 | 사진 버퍼를 Blob으로 관리, Base64 변환은 전송 시점에만 수행 | `useCameraDetection.ts` |
| L-9 | 3-2 | 하트비트 주기 60초 → 120초 변경 (§2-3) | `useDeviceStatus.ts` |
| L-10 | 2-6 | ChannelManager 싱글톤 도입 (§2-4) | 신규 `src/lib/channelManager.ts` |
| L-11 | 3-5 | 모션 감지 적응형 임계값 도입 (현재 고정 15%) | `motionDetection.ts` |
| L-12 | 3-10 | 도난 복구 GPS 폴링 지수 증가 (30초→1분→2분→5분) + 배터리 20% 미만 시 중단 | `useStealRecovery.ts` |
| L-13 | 2-4 | `useEffect` 의존성 배열 정리, `eslint-disable` 제거 | `useDeviceStatus.ts`, `Index.tsx` |

### 🟢 LOW

| # | 이슈 | 작업 내용 | 파일 |
|---|------|----------|------|
| L-14 | 4-2 | 매직 넘버를 `constants.ts`로 이동 (§2-6) | 다수 |
| L-15 | 4-3 | `window as any` 10곳을 `window.d.ts` 타입 선언으로 교체 | 신규 `src/types/window.d.ts` |
| L-16 | 2-7 | WebRTC 자동 재연결 + 지수 백오프 (즉시→2초→4초, 최대 3회) | `useWebRTCBroadcaster.ts` |

---

## 4. 스마트폰 앱 작업 목록

> 📱 이 섹션은 **스마트폰 앱에서만** 수행하는 작업입니다.

### 🔴 CRITICAL

| # | 이슈 | 작업 내용 | 상세 |
|---|------|----------|------|
| S-1 | 1-2 | **RLS 정책 재설계** — 현재 `Anyone can *` 정책을 `auth.uid() = user_id` 기반으로 변경 | 아래 상세 참조 |
| S-2 | 1-3 | 시리얼 인증 레이트 리밋 — Edge Function에서 IP 기반 5회/15분 제한 구현 | `validate-serial` Edge Function |
| S-3 | 1-1 | TURN credential 환경변수 이동 (랩탑과 동일) | `useWebRTCViewer` 등 |

### S-1 상세: RLS 정책 재설계

현재 문제:
```sql
-- ❌ 현재 (위험)
CREATE POLICY "Anyone can view devices" ON public.devices FOR SELECT USING (true);
CREATE POLICY "Anyone can register devices" ON public.devices FOR INSERT WITH CHECK (true);
CREATE POLICY "Anyone can update devices" ON public.devices FOR UPDATE USING (true);
```

변경해야 할 정책:
```sql
-- ✅ 변경 후
-- 1. devices 테이블에 user_id 컬럼 추가 (이미 있으면 생략)
ALTER TABLE public.devices ADD COLUMN IF NOT EXISTS user_id UUID REFERENCES auth.users(id);

-- 2. 기존 정책 삭제
DROP POLICY IF EXISTS "Anyone can view devices" ON public.devices;
DROP POLICY IF EXISTS "Anyone can register devices" ON public.devices;
DROP POLICY IF EXISTS "Anyone can update devices" ON public.devices;

-- 3. 새 정책 (JWT 인증 사용자만 자기 기기 접근)
CREATE POLICY "Users can view own devices"
  ON public.devices FOR SELECT
  USING (auth.uid() = user_id);

CREATE POLICY "Users can register own devices"
  ON public.devices FOR INSERT
  WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update own devices"
  ON public.devices FOR UPDATE
  USING (auth.uid() = user_id);

-- 4. activity_logs도 동일 적용
DROP POLICY IF EXISTS "Anyone can insert activity logs" ON public.activity_logs;
CREATE POLICY "Users can view own logs"
  ON public.activity_logs FOR SELECT
  USING (device_id IN (SELECT id FROM devices WHERE user_id = auth.uid()));
```

**⚠️ 주의:** 랩탑 앱은 JWT 인증이 없으므로 RLS를 통과하지 못합니다.
랩탑의 모든 DB 접근은 이미 Edge Function(`get-devices`, `update-device`)을 경유하고 있으며,
Edge Function 내부에서 `service_role` 키를 사용하므로 RLS 영향을 받지 않습니다.
**따라서 RLS 변경은 스마트폰 측에서만 수행하면 됩니다.**

### 🟠 HIGH

| # | 이슈 | 작업 내용 | 상세 |
|---|------|----------|------|
| S-4 | 2-5 | 백그라운드 전환 시 Presence 상태 관리. `AppState` 이벤트로 foreground 복귀 시 채널 재구독 | React Native `AppState` API 사용 |
| S-5 | 2-8 | `catch {}` 에러 분류 처리 (스마트폰 해당분) | `usePushSubscription` 등 |
| S-6 | 1-4 | PIN 설정 시 해시 저장 구현 (§2-1 프로토콜). `alarm_pin_hash` 필드 추가 | Settings 관련 |

### 🟡 MEDIUM

| # | 이슈 | 작업 내용 | 상세 |
|---|------|----------|------|
| S-7 | 3-3 | Settings.tsx 859줄 → 5개 컴포넌트 분리 | `SerialManagement`, `SensorSettings`, `AlarmSettings`, `PinSettings`, `DeviceSettings` |
| S-8 | 3-8 | Index.tsx `useState` 15개 → `useReducer` 또는 상태 그룹화 | 리렌더링 최적화 |
| S-9 | 3-2 | 하트비트 주기 30초 → 120초 변경 (§2-3) | `useDeviceHeartbeat` |
| S-10 | 2-6 | ChannelManager 싱글톤 도입 (§2-4) | 신규 파일 |
| S-11 | 2-4 | `subscribePush`가 deps에 포함되어 무한 루프 위험 수정 | `Index.tsx` useEffect |
| S-12 | 2-7 | WebRTC Viewer 자동 재연결 + 지수 백오프 | `useWebRTCViewer` |

### 🟢 LOW

| # | 이슈 | 작업 내용 |
|---|------|----------|
| S-13 | 4-2 | 매직 넘버를 `constants.ts`로 이동 (§2-6, 양쪽 동일 값) |
| S-14 | 4-3 | `as any` 제거 + TypeScript strict 모드 |
| S-15 | 4-5 | 접근성(a11y) — ARIA 라벨, 키보드 내비게이션 |
| S-16 | 4-8 | i18n — `react-i18next` 도입 (한/영) |

---

## 5. 우선순위별 로드맵

### Phase 1 — 긴급 보안 패치 (1~2주)

| 순서 | 작업 ID | 담당 | 내용 | 의존성 |
|------|---------|------|------|--------|
| 1 | S-1 | 📱 | RLS 정책 재설계 | 없음 (랩탑은 Edge Function 경유하므로 영향 없음) |
| 2 | L-1 + S-3 | 🖥️📱 | TURN credential 환경변수 이동 | 동시 작업 가능 |
| 3 | L-2 | 🖥️ | Supabase 폴백값 제거 | 없음 |
| 4 | S-2 | 📱 | 시리얼 레이트 리밋 | 없음 |
| 5 | 공통 | 🖥️📱 | console.log 빌드 시 제거 (§2-5) | 없음 |

### Phase 2 — 안정성 개선 (2~4주)

| 순서 | 작업 ID | 담당 | 내용 | 의존성 |
|------|---------|------|------|--------|
| 1 | L-3 | 🖥️ | handleSecurityEvent 순차 실행 | 없음 |
| 2 | L-4 + L-5 | 🖥️ | Battery 리스너 + 전역 변수 정리 | 없음 |
| 3 | L-6 + S-5 | 🖥️📱 | catch {} 에러 분류 | 동시 작업 |
| 4 | L-7 + S-6 | 🖥️📱 | PIN 해시 마이그레이션 | **S-6 먼저** (스마트폰이 hash 저장 시작 → 랩탑이 hash 검증) |
| 5 | L-10 + S-10 | 🖥️📱 | ChannelManager 도입 | 동시 작업 |

### Phase 3 — 성능 최적화 (4~6주)

| 순서 | 작업 ID | 담당 | 내용 |
|------|---------|------|------|
| 1 | S-7 | 📱 | Settings.tsx 분리 |
| 2 | S-8 | 📱 | Index.tsx 상태 관리 최적화 |
| 3 | L-9 + S-9 | 🖥️📱 | 하트비트 주기 통합 (120초) |
| 4 | L-8 | 🖥️ | 사진 Blob 관리 |
| 5 | L-11 | 🖥️ | 모션 감지 개선 |
| 6 | L-12 | 🖥️ | GPS 폴링 최적화 |
| 7 | L-16 + S-12 | 🖥️📱 | WebRTC 자동 재연결 |

### Phase 4 — 코드 품질 (6주+)

| 작업 ID | 담당 | 내용 |
|---------|------|------|
| L-14 + S-13 | 🖥️📱 | 매직 넘버 상수화 |
| L-15 + S-14 | 🖥️📱 | TypeScript 엄격화 |
| S-15 | 📱 | 접근성 |
| S-16 | 📱 | i18n |
| L-13 + S-11 | 🖥️📱 | useEffect deps 정리 |

---

## 6. 작업 시 주의사항

### 6-1. RLS 변경 시 랩탑 영향 없음 확인

랩탑 앱의 DB 접근 경로:
```
랩탑 → Edge Function (get-devices, update-device) → service_role key → DB
                                                     ↑ RLS 우회
```

따라서 스마트폰에서 RLS를 `auth.uid() = user_id`로 변경해도 랩탑은 영향 없음.
단, **Edge Function 내부에서 요청자의 device_id가 해당 user의 소유인지 검증하는 로직**을 추가해야 함:

```typescript
// Edge Function 내부 검증 예시
const { device_id } = requestBody;
const { data: device } = await supabase
  .from("devices")
  .select("user_id")
  .eq("id", device_id)
  .single();

// serial_keys 테이블에서 해당 시리얼의 user_id와 대조
if (device.user_id !== authenticatedUserId) {
  return new Response("Forbidden", { status: 403 });
}
```

### 6-2. PIN 해시 마이그레이션 순서

```
Step 1: 📱 스마트폰 — PIN 설정 시 alarm_pin + alarm_pin_hash 둘 다 저장
Step 2: 🖥️ 랩탑 — PIN 검증 시 alarm_pin_hash 우선, alarm_pin 폴백
Step 3: (안정화 후) 📱 스마트폰 — alarm_pin 저장 중단
Step 4: (안정화 후) 🖥️ 랩탑 — alarm_pin 폴백 제거
```

### 6-3. 하트비트 변경 동기화

하트비트 주기를 양쪽에서 **동시에** 변경해야 합니다.
한쪽만 변경하면 온라인 판정 타이밍이 맞지 않을 수 있습니다.

```
현재: 랩탑 60초 + 스마트폰 30초 = 3~4 UPDATE/분
목표: 랩탑 120초 + 스마트폰 120초 = 1 UPDATE/분
```

### 6-4. TURN credential 교체

양쪽 앱에서 **동시에** 적용해야 WebRTC 연결이 유지됩니다.

```
1. Metered.ca 대시보드에서 새 API 키 발급
2. 양쪽 환경변수에 동시 설정:
   - VITE_TURN_USERNAME=새값
   - VITE_TURN_CREDENTIAL=새값
3. 기존 하드코딩 코드 제거
```

---

## 7. 이슈-역할 매핑 요약표

| 이슈 ID | 심각도 | 제목 | 랩탑 | 스마트폰 | 비고 |
|---------|--------|------|:----:|:-------:|------|
| 1-1 | 🔴 | TURN credential 하드코딩 | ✅ L-1 | ✅ S-3 | 동시 작업 |
| 1-2 | 🔴 | RLS 정책 무효화 | — | ✅ S-1 | 랩탑은 Edge Function 경유 |
| 1-3 | 🔴 | 시리얼 인증 취약점 | — | ✅ S-2 | Edge Function에서 구현 |
| 1-4 | 🟠 | PIN 평문 저장 | ✅ L-7 | ✅ S-6 | S-6 먼저 |
| 1-5 | 🟠 | 사진 비암호화 전송 | — | — | Phase 2 이후 (§2-2) |
| 1-6 | 🟠 | Supabase 폴백값 노출 | ✅ L-2 | — | 랩탑만 해당 |
| 2-1 | 🔴 | 경보 비동기 폭주 | ✅ L-3 | — | 랩탑만 해당 |
| 2-2 | 🟠 | Battery 리스너 미정리 | ✅ L-4 | — | 랩탑만 해당 |
| 2-3 | 🟠 | window 전역 오염 | ✅ L-5 | — | 랩탑만 해당 |
| 2-4 | 🟠 | useEffect deps 누락 | ✅ L-13 | ✅ S-11 | 각자 해당 파일 |
| 2-5 | 🟠 | 백그라운드 상태 불일치 | — | ✅ S-4 | 스마트폰만 해당 |
| 2-6 | 🟡 | 채널 중복 구독 | ✅ L-10 | ✅ S-10 | ChannelManager 도입 |
| 2-7 | 🟡 | WebRTC 재연결 부재 | ✅ L-16 | ✅ S-12 | 동시 작업 |
| 2-8 | 🟠 | catch {} 에러 삼킴 | ✅ L-6 | ✅ S-5 | 각자 해당 파일 |
| 3-1 | 🟡 | Base64 메모리 적재 | ✅ L-8 | — | 랩탑만 해당 |
| 3-2 | 🟡 | 이중 하트비트 | ✅ L-9 | ✅ S-9 | 동시 변경 필수 |
| 3-3 | 🟡 | Settings.tsx 비대 | — | ✅ S-7 | 스마트폰만 해당 |
| 3-4 | 🟡 | 채널 정리 안티패턴 | ✅ L-10 | ✅ S-10 | 2-6과 동일 |
| 3-5 | 🟡 | 모션 감지 오탐 | ✅ L-11 | — | 랩탑만 해당 |
| 3-6 | 🟡 | localStorage 과다 | — | — | Phase 3+ |
| 3-7 | 🟡 | 사진 전송 waterfall | — | — | 현행 유지 (안정성 우선) |
| 3-8 | 🟡 | 리렌더링 과다 | — | ✅ S-8 | 스마트폰만 해당 |
| 3-9 | 🟡 | Index.tsx 비대 | — | ✅ S-8 | 3-8과 통합 |
| 3-10 | 🟡 | GPS 폴링 배터리 | ✅ L-12 | — | 랩탑만 해당 |
| 4-1 | 🟢 | console.log 330건 | ✅ | ✅ | 빌드 설정 (§2-5) |
| 4-2 | 🟢 | 매직 넘버 | ✅ L-14 | ✅ S-13 | constants.ts |
| 4-3 | 🟢 | 타입 안전성 | ✅ L-15 | ✅ S-14 | 각자 |
| 4-4 | 🟢 | 에러 메시지 일관성 | — | — | Phase 4 |
| 4-5 | 🟢 | 접근성 | — | ✅ S-15 | 스마트폰만 |
| 4-6 | 🟢 | 테스트 부재 | — | — | Phase 4 |
| 4-7 | 🟢 | 환경변수 폴백 | ✅ L-2 | — | 1-6과 통합 |
| 4-8 | 🟢 | i18n 미구현 | — | ✅ S-16 | 스마트폰만 |

---

## 📊 작업 분량 요약

| 구분 | CRITICAL | HIGH | MEDIUM | LOW | 합계 |
|------|:--------:|:----:|:------:|:---:|:----:|
| 🖥️ 랩탑 전용 | 3 | 4 | 5 | 3 | **15** |
| 📱 스마트폰 전용 | 3 | 3 | 6 | 4 | **16** |
| 🔗 공통 (양쪽) | — | — | — | 1 | **1** (console.log) |

---

*이 문서는 `MeerCOP_CodeImprovement.docx` (32개 이슈)를 기반으로 작성되었습니다.*
*프로토콜 합의사항(§2)은 양쪽 앱에서 동일하게 적용되어야 합니다.*
