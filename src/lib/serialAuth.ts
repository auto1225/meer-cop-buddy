// 시리얼 검증은 웹사이트 프로젝트(peqgmuicrorjvvburqly)의 Edge Function을 사용
const SUPABASE_URL = "https://peqgmuicrorjvvburqly.supabase.co";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InBlcWdtdWljcm9yanZ2YnVycWx5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzE5NDA1NzQsImV4cCI6MjA4NzUxNjU3NH0.e5HYG3dSMqhm4ahT-en-nNX2mD95KM_TdKIlfuzdMc4";

const STORAGE_KEY = "meercop_serial_auth";

export interface SerialAuthData {
  serial_key: string;
  device_id: string;
  user_id: string;
  device_name: string;
  authenticated_at: string;
  plan_type: "free" | "basic" | "premium";
  expires_at: string | null;
  remaining_days: number | null;
}

const SERIAL_VERIFY_ENDPOINTS = ["validate-serial", "verify-serial"] as const;

async function callSerialVerify(payload: {
  serial_key: string;
  device_name: string;
  device_type: "laptop";
}) {
  let lastError = "시리얼 검증 실패";

  for (const endpoint of SERIAL_VERIFY_ENDPOINTS) {
    try {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${endpoint}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(payload),
      });

      const data = await res.json().catch(() => ({}));

      if (res.ok) return data;
      lastError = (data as any)?.error || lastError;
    } catch {
      // 네트워크/함수 미배포 오류 시 다음 엔드포인트로 폴백
    }
  }

  throw new Error(lastError);
}

// 시리얼 넘버 검증 & 기기 등록
export async function validateSerial(
  serialKey: string,
  deviceName: string = "My Laptop"
): Promise<SerialAuthData> {
  const data = await callSerialVerify({
    serial_key: serialKey.trim().toUpperCase(),
    device_name: deviceName,
    device_type: "laptop",
  });

  // validate-serial은 flat 구조, verify-serial은 data.serial.* 구조
  const s = data.serial || data;

  const authData: SerialAuthData = {
    serial_key: s.serial_key || serialKey.trim().toUpperCase(),
    device_id: s.device_id || data.device_id,
    user_id: s.user_id || data.user_id,
    device_name: s.device_name || deviceName,
    authenticated_at: new Date().toISOString(),
    plan_type: s.plan_type || "free",
    expires_at: s.expires_at || null,
    remaining_days: s.remaining_days ?? null,
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

// 시리얼 재검증 (플랜 정보 갱신)
export async function revalidateSerial(): Promise<SerialAuthData | null> {
  const saved = getSavedAuth();
  if (!saved) return null;

  try {
    const data = await callSerialVerify({
      serial_key: saved.serial_key,
      device_name: saved.device_name,
      device_type: "laptop",
    });

    // validate-serial은 flat, verify-serial은 data.serial.* 구조
    const s = data.serial || data;

    const updated: SerialAuthData = {
      ...saved,
      plan_type: s.plan_type || saved.plan_type,
      expires_at: s.expires_at ?? saved.expires_at,
      remaining_days: s.remaining_days ?? saved.remaining_days,
      device_id: s.device_id || data.device_id || saved.device_id,
      user_id: s.user_id || data.user_id || saved.user_id,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("[revalidateSerial] Network error:", err);
    return null;
  }
}
