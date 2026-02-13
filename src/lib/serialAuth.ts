const SUPABASE_URL = "https://sltxwkdvaapyeosikegj.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdHh3a2R2YWFweWVvc2lrZWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNjg4MjQsImV4cCI6MjA4NTg0NDgyNH0.hj6A8YDTRMQkPid9hfw6vnGC2eQLTmv2JPmQRLv4sZ4";

const STORAGE_KEY = "meercop_serial_auth";

export interface SerialAuthData {
  serial_key: string;
  device_id: string;
  user_id: string;
  authenticated_at: string;
}

// 시리얼 넘버 검증 & 기기 등록
export async function validateSerial(serialKey: string): Promise<SerialAuthData> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-serial`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      serial_key: serialKey.trim().toUpperCase(),
      device_name: "My Laptop",
      device_type: "laptop",
    }),
  });

  const data = await res.json();

  if (!res.ok) {
    throw new Error(data.error || "시리얼 검증 실패");
  }

  const authData: SerialAuthData = {
    serial_key: data.serial_key,
    device_id: data.device_id,
    user_id: data.user_id,
    authenticated_at: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));

  return authData;
}

// 저장된 인증 정보 가져오기
export function getSavedAuth(): SerialAuthData | null {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (!saved) return null;
  try {
    return JSON.parse(saved) as SerialAuthData;
  } catch {
    return null;
  }
}

// 인증 정보 삭제 (로그아웃)
export function clearAuth(): void {
  localStorage.removeItem(STORAGE_KEY);
}

// 인증 여부 확인
export function isSerialAuthenticated(): boolean {
  return getSavedAuth() !== null;
}
