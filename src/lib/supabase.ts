import { createClient } from '@supabase/supabase-js';

// MeerCOP 공유 프로젝트 (sltxwkdvaapyeosikegj)
export const SHARED_SUPABASE_URL = "https://sltxwkdvaapyeosikegj.supabase.co";
export const SHARED_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdHh3a2R2YWFweWVvc2lrZWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NDk5NTI2MzAsImV4cCI6MjA2NTUyODYzMH0.LcJMEpnFLFKNbJpFBBa-2BuXbJq4n4Jw-lODq80sfwM";

// 공유 Supabase 클라이언트 (meercop 프로젝트와 동일한 DB)
export const supabaseShared = createClient(SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY, {
  auth: {
    storage: localStorage,
    persistSession: true,
    autoRefreshToken: true,
  },
});
