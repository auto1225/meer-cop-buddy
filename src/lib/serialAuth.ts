import { fetchDevicesViaEdge, registerDeviceViaEdge } from "./deviceApi";

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

async function callVerifySerial(serialKey: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-serial`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: "verify", serial_key: serialKey }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || "시리얼 검증 실패");
  return data;
}

async function callRegisterDevice(serialKey: string, deviceName: string) {
  const res = await fetch(`${SUPABASE_URL}/functions/v1/verify-serial`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      apikey: SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({
      action: "register_device",
      serial_key: serialKey,
      device_name: deviceName,
      device_type: "laptop",
    }),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error((data as any)?.error || "기기 등록 실패");
  return data;
}

// 시리얼 넘버 검증 & 기기 등록
export async function validateSerial(
  serialKey: string,
  deviceName: string = "My Laptop"
): Promise<SerialAuthData> {
  const key = serialKey.trim().toUpperCase();

  // 1) 시리얼 검증
  const data = await callVerifySerial(key);
  if (!data.valid) {
    throw new Error(data.error || "유효하지 않은 시리얼입니다.");
  }

  // 2) 웹사이트 DB에 기기 등록 (실패해도 공유 DB 등록으로 계속 진행)
  try {
    await callRegisterDevice(key, deviceName);
  } catch (err) {
    console.warn("[serialAuth] ⚠️ 웹사이트 DB 기기 등록 실패 (계속 진행):", err);
  }

  // 3) 공유 DB에 기기 등록 (로컬 Edge Function → 외부 폴백)
  const s = data.serial || data;
  const userId = s.user_id || "";

  try {
    const registered = await registerDeviceViaEdge({
      user_id: userId,
      device_name: deviceName,
      device_type: "laptop",
    });
    console.log("[serialAuth] ✅ 공유 DB 기기 등록 완료:", registered);
  } catch (err) {
    console.warn("[serialAuth] ⚠️ 공유 DB 기기 등록 실패 (계속 진행):", err);
  }

  const authData: SerialAuthData = {
    serial_key: s.serial_key || key,
    device_id: s.id || s.device_id || "",
    user_id: s.user_id || "",
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

// 공유 DB 기기 등록 보정
async function ensureSharedDeviceRegistration(
  userId: string,
  deviceName: string,
  currentDeviceId: string
): Promise<string> {
  if (!userId) return currentDeviceId;

  try {
    const devices = await fetchDevicesViaEdge(userId);
    const exists = devices.find(
      (d) => d.id === currentDeviceId || d.device_id === currentDeviceId
    );

    if (exists) {
      return exists.id || currentDeviceId;
    }

    // 로컬 Edge Function으로 등록 시도
    const registered = await registerDeviceViaEdge({
      user_id: userId,
      device_name: deviceName || "My Laptop",
      device_type: "laptop",
    });

    console.log("[serialAuth] ✅ 재검증 중 공유 DB 기기 등록 결과:", registered);
    return registered?.id || registered?.device_id || currentDeviceId;
  } catch (err) {
    console.warn("[serialAuth] ⚠️ 공유 DB 기기 등록 보정 실패 (계속 진행):", err);
    return currentDeviceId;
  }
}

// 시리얼 재검증 (플랜 정보 갱신)
export async function revalidateSerial(): Promise<SerialAuthData | null> {
  const saved = getSavedAuth();
  if (!saved) return null;

  try {
    const data = await callVerifySerial(saved.serial_key);
    const s = data.serial || data;

    const ensuredDeviceId = await ensureSharedDeviceRegistration(
      s.user_id || saved.user_id,
      s.device_name || saved.device_name || "My Laptop",
      s.id || s.device_id || saved.device_id
    );

    const normalizedDeviceId =
      typeof ensuredDeviceId === "string" && ensuredDeviceId.startsWith("local-")
        ? (saved.device_id && !saved.device_id.startsWith("local-")
            ? saved.device_id
            : (s.id || s.device_id || ""))
        : ensuredDeviceId;

    const updated: SerialAuthData = {
      ...saved,
      plan_type: s.plan_type || saved.plan_type,
      expires_at: s.expires_at ?? saved.expires_at,
      remaining_days: s.remaining_days ?? saved.remaining_days,
      device_id: normalizedDeviceId,
      user_id: s.user_id || saved.user_id,
      device_name: s.device_name || saved.device_name,
    };

    localStorage.setItem(STORAGE_KEY, JSON.stringify(updated));
    return updated;
  } catch (err) {
    console.warn("[revalidateSerial] Network error:", err);
    return null;
  }
}
