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

/** 사용자의 모든 기기 목록 조회 (공유 Supabase Edge Function) */
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
 * 기기 등록 — 로컬(Lovable Cloud) register-device 우선, 실패 시 외부 공유 프로젝트 폴백
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

  // 1) 로컬 Lovable Cloud Edge Function 시도
  const localUrl = `https://${import.meta.env.VITE_SUPABASE_PROJECT_ID || "dmvbwyfzueywuwxkjuuy"}.supabase.co/functions/v1/register-device`;
  const localAnonKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdmJ3eWZ6dWV5d3V3eGtqdXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTI2ODMsImV4cCI6MjA4NTg2ODY4M30.0lDX72JHWonW5fRRPve_cdfJrNVyDMzz5nzshJ0cEuI";

  try {
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
      console.log("[deviceApi] ✅ Device registered via local function:", data);
      return (data as any).device || (data as any);
    }
    const errText = await res.text();
    console.warn("[deviceApi] ⚠️ Local register-device failed:", res.status, errText);
  } catch (err) {
    console.warn("[deviceApi] ⚠️ Local register-device network error:", err);
  }

  // 2) 외부 공유 프로젝트 폴백
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
    console.warn("[deviceApi] ⚠️ Shared register-device failed:", res.status, errText);
  } catch (err) {
    console.warn("[deviceApi] ⚠️ Shared register-device network error:", err);
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