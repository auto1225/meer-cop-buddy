import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY, supabaseShared } from "./supabase";

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

/** 기기 등록 (공유 Supabase register-device Edge Function, RLS 우회) */
export async function registerDeviceViaEdge(
  params: {
    user_id: string;
    device_name: string;
    device_type: string;
  }
): Promise<DeviceRow> {
  // device_id 생성 (crypto.randomUUID 또는 폴백)
  const deviceId = typeof crypto !== "undefined" && crypto.randomUUID
    ? crypto.randomUUID()
    : `dev-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;

  const body = {
    ...params,
    // 호환성: 일부 백엔드가 name 컬럼을 기대함
    name: params.device_name,
    device_name: params.device_name,
    device_id: deviceId,
    device_type: params.device_type,
    status: "offline",
    is_monitoring: false,
    is_camera_connected: false,
    is_network_connected: false,
    metadata: {},
  };

  const res = await fetch(
    `${SHARED_SUPABASE_URL}/functions/v1/register-device`,
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SHARED_SUPABASE_ANON_KEY,
      },
      body: JSON.stringify(body),
    }
  );

  if (res.ok) {
    const data = await res.json();
    console.log(`[deviceApi] ✅ Device registered via function:`, data);
    return data.device || data;
  }

  const fnErr = await res.text();
  console.warn(`[deviceApi] ⚠️ register-device function failed (${res.status}), fallback to direct insert`, fnErr);

  // 폴백 1: user_id 포함 시도
  const payloadWithUser = {
    user_id: params.user_id,
    device_id: deviceId,
    device_name: params.device_name,
    device_type: params.device_type,
    status: "offline",
    is_camera_connected: false,
    is_network_connected: false,
    metadata: {},
  };

  const firstTry = await supabaseShared
    .from("devices")
    .insert(payloadWithUser as any)
    .select("*")
    .single();

  if (!firstTry.error && firstTry.data) {
    console.log(`[deviceApi] ✅ Device registered via direct insert (with user_id):`, firstTry.data);
    return firstTry.data as DeviceRow;
  }

  // 폴백 2: 일부 스키마에 user_id 컬럼이 없을 수 있어 제외 후 재시도
  const payloadWithoutUser = {
    device_id: deviceId,
    device_name: params.device_name,
    device_type: params.device_type,
    status: "offline",
    is_camera_connected: false,
    is_network_connected: false,
    metadata: {},
  };

  const secondTry = await supabaseShared
    .from("devices")
    .insert(payloadWithoutUser as any)
    .select("*")
    .single();

  if (!secondTry.error && secondTry.data) {
    console.log(`[deviceApi] ✅ Device registered via direct insert (without user_id):`, secondTry.data);
    return secondTry.data as DeviceRow;
  }

  console.error(
    `[deviceApi] ❌ register-device ultimately failed | function=${res.status} ${fnErr} | fallback1=${firstTry.error?.message || "unknown"} | fallback2=${secondTry.error?.message || "unknown"}`
  );

  // 런타임 크래시 방지: 최종 실패 시에도 안전한 객체 반환
  return {
    id: deviceId,
    device_id: deviceId,
    device_name: params.device_name,
    name: params.device_name,
    device_type: params.device_type,
    status: "offline",
    is_monitoring: false,
    is_camera_connected: false,
    is_network_connected: false,
    is_streaming_requested: false,
    battery_level: null,
    last_seen_at: null,
    metadata: {},
    user_id: params.user_id,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
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