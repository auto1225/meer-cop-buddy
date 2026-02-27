# 스마트폰 앱 ↔ 랩탑 앱 DB 통합 가이드

## ⚠️ 현재 문제
랩탑 앱과 스마트폰 앱이 서로 다른 Supabase 프로젝트(DB)를 사용하고 있어 기기를 상호 인식하지 못합니다.

## ✅ 해결 방법
**스마트폰 앱(`meercop_smartphone`)을 이 프로젝트의 Lovable Cloud DB로 연결합니다.**

### 이 프로젝트 (랩탑) 정보
- **Project ID**: `dmvbwyfzueywuwxkjuuy`
- **Supabase URL**: `https://dmvbwyfzueywuwxkjuuy.supabase.co`
- **Anon Key**: `.env`의 `VITE_SUPABASE_PUBLISHABLE_KEY` 참조

### 스마트폰 앱에서 변경 필요 사항

#### 1. `src/integrations/supabase/client.ts` → 공유 DB 클라이언트 추가
```typescript
// 랩탑 앱과 동일한 DB를 바라보는 공유 클라이언트
import { createClient } from '@supabase/supabase-js';

export const supabaseShared = createClient(
  "https://dmvbwyfzueywuwxkjuuy.supabase.co",
  "<anon_key_from_laptop_project>"
);
```

#### 2. `src/hooks/useSmartphoneRegistration.ts`
- `supabase` 대신 `supabaseShared` 사용
- `name` → `device_name`도 함께 전송 (호환성)

#### 3. `src/hooks/useDevices.tsx`
- `get-devices` Edge Function 호출 시 랩탑 프로젝트 URL 사용

### DB 스키마 호환성
이 프로젝트의 `devices` 테이블에 다음 컬럼이 추가되었습니다:
- `user_id` (text) — 스마트폰 앱 호환
- `is_monitoring` (boolean) — 감시 상태
- `name` (text) — `device_name`과 동기화

### Edge Functions 사용 가능
- `POST /functions/v1/register-device` — 기기 등록
- `POST /functions/v1/get-devices` — 기기 조회
- `POST /functions/v1/update-device` — 기기 업데이트

모든 함수는 `verify_jwt = false`로 시리얼 인증과 호환됩니다.
