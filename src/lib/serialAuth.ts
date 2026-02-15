import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "./supabase";

const SUPABASE_URL = SHARED_SUPABASE_URL;
const SUPABASE_ANON_KEY = SHARED_SUPABASE_ANON_KEY;

const STORAGE_KEY = "meercop_serial_auth";

export interface SerialAuthData {
  serial_key: string;
  device_id: string;
  user_id: string;
  device_name: string;
  authenticated_at: string;
}

// 시리얼 넘버 검증 & 기기 등록
export async function validateSerial(
  serialKey: string,
  deviceName: string = "My Laptop"
): Promise<SerialAuthData> {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/validate-serial`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      serial_key: serialKey.trim().toUpperCase(),
      device_name: deviceName,
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
    device_name: data.device_name || deviceName,
    authenticated_at: new Date().toISOString(),
  };

  localStorage.setItem(STORAGE_KEY, JSON.stringify(authData));

  return authData;
}

// 저장된 인증 정보 가져오기
export function getSavedAuth(): SerialAuthData | null {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
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
