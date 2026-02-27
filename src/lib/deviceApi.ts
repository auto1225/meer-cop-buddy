import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "./supabase";

/**
 * Edge Function을 통한 디바이스 API (RLS 우회)
 * 조회: 공유 Supabase의 get-devices Edge Function 호출
 * 업데이트: 공유 Supabase PostgREST 직접 PATCH (CORS OK for REST API)
 */

interface DeviceRow {
  id: string;
  device_id?: string;
  device_name?: string;
  name?: string;
  device_type: string;
  status: string;
  is_monitoring?: boolean;
  is_camera_connected: boolean | null;
  is_network_connected: boolean | null;
  is_streaming_requested: boolean | null;
  battery_level: number | null;
  last_seen_at: string | null;
  metadata: Record<string, unknown> | null;
  user_id?: string;
  latitude?: number | null;
  longitude?: number | null;
  location_updated_at?: string | null;
  created_at: string;
  updated_at: string;
}

const SHARED_REGISTER_COOLDOWN_KEY = "meercop_shared_register_cooldown_until";
const SHARED_REGISTER_COOLDOWN_MS = 5 * 60 * 1000;

function isSharedRegisterCooldownActive(): boolean {
  try {
    const raw = localStorage.getItem(SHARED_REGISTER_COOLDOWN_KEY);
    const until = raw ? Number(raw) : 0;
    return Number.isFinite(until) && until > Date.now();
  } catch {
    return false;
  }
}

function activateSharedRegisterCooldown(): void {
  try {
    localStorage.setItem(
      SHARED_REGISTER_COOLDOWN_KEY,
      String(Date.now() + SHARED_REGISTER_COOLDOWN_MS)
    );
  } catch {
    // noop
  }
}

export async function fetchDevicesViaEdge(userId: string): Promise<DeviceRow[]> {
  const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-devices`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SHARED_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ user_id: userId }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `get-devices failed: ${res.status}`);
  }

  const data = await res.json();
  return data.devices || data || [];
}

/** 특정 기기 1건 조회 */
export async function fetchDeviceViaEdge(deviceId: string, userId: string): Promise<DeviceRow | null> {
  const devices = await fetchDevicesViaEdge(userId);
  return devices.find(d => d.id === deviceId) || null;
}

/** WebRTC 시그널링 데이터 조회 (공유 Supabase get-signaling Edge Function) */
export async function fetchSignalingViaEdge(
  deviceId: string,
  type?: string,
  senderType?: string
): Promise<any[]> {
  const body: Record<string, string> = { device_id: deviceId };
  if (type) body.type = type;
  if (senderType) body.sender_type = senderType;

  const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-signaling`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SHARED_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    console.warn(`[deviceApi] get-signaling failed: ${res.status}`);
    return [];
  }

  const data = await res.json();
  return data.signals || [];
}

/** WebRTC 시그널링 데이터 삽입 (공유 Supabase manage-signaling Edge Function) */
export async function insertSignalingViaEdge(
  record: {
    device_id: string;
    session_id: string;
    type: string;
    sender_type: string;
    data: Record<string, unknown>;
  }
): Promise<void> {
  const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/manage-signaling`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SHARED_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: "insert", record }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[deviceApi] insert-signaling failed: ${res.status} ${err}`);
  }
}

/** WebRTC 시그널링 데이터 삭제 (공유 Supabase manage-signaling Edge Function) */
export async function deleteSignalingViaEdge(
  deviceId: string,
  senderType?: string
): Promise<void> {
  const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/manage-signaling`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": SHARED_SUPABASE_ANON_KEY,
    },
    body: JSON.stringify({ action: "delete", device_id: deviceId, sender_type: senderType }),
  });

  if (!res.ok) {
    const err = await res.text();
    console.error(`[deviceApi] delete-signaling failed: ${res.status} ${err}`);
  }
}

/**
 * 기기 등록 — 공유 프로젝트 우선, 실패 시 로컬(Lovable Cloud) 폴백
 */
export async function registerDeviceViaEdge(
  params: {
    user_id: string;
    device_name: string;
    device_type: string;
  },
  options?: { throwOnFailure?: boolean }
): Promise<DeviceRow | null> {
  const body = {
    user_id: params.user_id,
    name: params.device_name,
    device_name: params.device_name,
    device_type: params.device_type,
    status: "offline",
    metadata: {},
  };

  // 1) 공유 프로젝트 Edge Function 우선 시도 (스마트폰 동기화 대상)
  if (!isSharedRegisterCooldownActive()) {
    try {
      const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/register-device`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          apikey: SHARED_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      });

      if (res.ok) {
        const data = await res.json();
        console.log("[deviceApi] ✅ Device registered via shared function:", data);
        return (data as any).device || (data as any);
      }

      const errText = await res.text();
      activateSharedRegisterCooldown();
      console.warn("[deviceApi] ⚠️ Shared register-device failed:", res.status, errText);
    } catch (err) {
      activateSharedRegisterCooldown();
      console.warn("[deviceApi] ⚠️ Shared register-device network error:", err);
    }
  }

  // 2) 로컬 Lovable Cloud Edge Function 폴백 (앱 크래시 방지용)
  try {
    const localUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID || "dmvbwyfzueywuwxkjuuy"}.supabase.co/functions/v1/register-device`;
    const localAnonKey =
      import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
      "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdmJ3eWZ6dWV5d3V3eGtqdXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTI2ODMsImV4cCI6MjA4NTg2ODY4M30.0lDX72JHWonW5fRRPve_cdfJrNVyDMzz5nzshJ0cEuI";

    const res = await fetch(localUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: localAnonKey,
      },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      console.log("[deviceApi] ✅ Device registered via local fallback:", data);
      return (data as any).device || (data as any);
    }

    const errText = await res.text();
    const message = `local register-device failed: ${res.status} ${errText}`;
    if (options?.throwOnFailure) throw new Error(message);
    console.warn("[deviceApi] ⚠️", message);
  } catch (err) {
    if (options?.throwOnFailure) throw err;
    console.warn("[deviceApi] ⚠️ Local register-device network error:", err);
  }

  return null;
}

/** 기기 정보 업데이트 (공유 Supabase update-device Edge Function) */
export async function updateDeviceViaEdge(
  deviceId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const res = await fetch(
    `${SHARED_SUPABASE_URL}/functions/v1/update-device`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SHARED_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify({ device_id: deviceId, updates }),
    }
  );

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`update-device failed: ${res.status} ${err}`);
  }

  const data = await res.json();
  console.log(`[deviceApi] ✅ Edge Function updated device ${deviceId}:`, data);
}