import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "./supabase";

/**
 * Edge Function을 통한 디바이스 API (RLS 우회)
 * 조회: 공유 Supabase의 get-devices Edge Function 직접 호출
 * 업데이트: 로컬 proxy-update-device Edge Function 경유 (CORS 우회)
 */

const LOCAL_SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL;
const LOCAL_SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

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

/** 사용자의 모든 기기 목록 조회 (공유 Supabase 직접) */
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

/** 기기 정보 업데이트 (로컬 프록시 Edge Function 경유 → CORS 우회) */
export async function updateDeviceViaEdge(
  deviceId: string,
  updates: Record<string, unknown>
): Promise<void> {
  const res = await fetch(`${LOCAL_SUPABASE_URL}/functions/v1/proxy-update-device`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "apikey": LOCAL_SUPABASE_KEY,
    },
    body: JSON.stringify({ device_id: deviceId, updates }),
  });

  if (!res.ok) {
    const err = await res.json().catch(() => ({}));
    throw new Error(err.error || `update-device failed: ${res.status}`);
  }
}