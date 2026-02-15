import { createClient } from '@supabase/supabase-js';

// MeerCOP 공유 프로젝트 설정 (환경변수 우선, 폴백으로 기본값)
export const SHARED_SUPABASE_URL = import.meta.env.VITE_SHARED_SUPABASE_URL || 'https://sltxwkdvaapyeosikegj.supabase.co';
export const SHARED_SUPABASE_ANON_KEY = import.meta.env.VITE_SHARED_SUPABASE_ANON_KEY || 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdHh3a2R2YWFweWVvc2lrZWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNjg4MjQsImV4cCI6MjA4NTg0NDgyNH0.hj6A8YDTRMQkPid9hfw6vnGC2eQLTmv2JPmQRLv4sZ4';

// 공유 Supabase 클라이언트 (meercop 프로젝트와 동일한 DB)
export const supabaseShared = createClient(SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  }
});
