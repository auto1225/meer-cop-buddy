import { createClient } from '@supabase/supabase-js';

// MeerCOP 공유 프로젝트 설정 (환경변수 필수)
const _url = import.meta.env.VITE_SHARED_SUPABASE_URL;
const _key = import.meta.env.VITE_SHARED_SUPABASE_ANON_KEY;

if (!_url || !_key) {
  throw new Error(
    "[MeerCOP] VITE_SHARED_SUPABASE_URL 및 VITE_SHARED_SUPABASE_ANON_KEY 환경변수가 필요합니다. .env 파일을 확인하세요."
  );
}

export const SHARED_SUPABASE_URL: string = _url;
export const SHARED_SUPABASE_ANON_KEY: string = _key;

// 공유 Supabase 클라이언트 (meercop 프로젝트와 동일한 DB)
export const supabaseShared = createClient(SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
