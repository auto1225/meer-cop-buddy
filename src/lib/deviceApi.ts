import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "./supabase";
import { getSharedDeviceId } from "./sharedDeviceIdMap";
import { getSavedAuth } from "./serialAuth";

/**
 * Edge Function을 통한 디바이스 API
 * 로컬 Lovable Cloud DB 우선, 공유 프로젝트 폴백
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

// ── 로컬 Lovable Cloud 헬퍼 ──
function getLocalFunctionUrl(fnName: string): string {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "dmvbwyfzueywuwxkjuuy";
  return `https://${projectId}.supabase.co/functions/v1/${fnName}`;
}

function getLocalAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdmJ3eWZ6dWV5d3V3eGtqdXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTI2ODMsImV4cCI6MjA4NTg2ODY4M30.0lDX72JHWonW5fRRPve_cdfJrNVyDMzz5nzshJ0cEuI";
}

// ── Cooldown for shared project (fallback) ──
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

/** 사용자의 모든 기기 목록 조회 */
export async function fetchDevicesViaEdge(userId: string): Promise<DeviceRow[]> {
  // 1) 로컬 우선
  try {
    const res = await fetch(getLocalFunctionUrl("get-devices"), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: getLocalAnonKey() },
      body: JSON.stringify({ user_id: userId }),
    });
    if (res.ok) {
      const data = await res.json();
      return data.devices || data || [];
    }
  } catch (e) {
    console.warn("[deviceApi] Local get-devices failed:", e);
  }

  // 2) 공유 프로젝트 폴백
  const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-devices`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
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

/** WebRTC 시그널링 데이터 조회 */
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
    headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    console.warn(`[deviceApi] get-signaling failed: ${res.status}`);
    return [];
  }
  const data = await res.json();
  return data.signals || [];
}

/** WebRTC 시그널링 데이터 삽입 */
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
    headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: "insert", record }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[deviceApi] insert-signaling failed: ${res.status} ${err}`);
  }
}

/** WebRTC 시그널링 데이터 삭제 */
export async function deleteSignalingViaEdge(
  deviceId: string,
  senderType?: string
): Promise<void> {
  const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/manage-signaling`, {
    method: "POST",
    headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
    body: JSON.stringify({ action: "delete", device_id: deviceId, sender_type: senderType }),
  });
  if (!res.ok) {
    const err = await res.text();
    console.error(`[deviceApi] delete-signaling failed: ${res.status} ${err}`);
  }
}

/**
 * 기기 등록 — 로컬 Lovable Cloud 우선, 공유 프로젝트 폴백
 */
export async function registerDeviceViaEdge(
  params: {
    user_id: string;
    device_name: string;
    device_type: string;
    serial_key?: string;
    is_revalidation?: boolean;
  },
  options?: { throwOnFailure?: boolean }
): Promise<DeviceRow | null> {
  // Guard: user_id is required
  if (!params.user_id) {
    console.warn("[deviceApi] ⚠️ registerDeviceViaEdge called without user_id, skipping");
    return null;
  }
  const metadata: Record<string, unknown> = {};
  if (params.serial_key) {
    metadata.serial_key = params.serial_key;
  }

  const body: Record<string, unknown> = {
    user_id: params.user_id,
    name: params.device_name,
    device_name: params.device_name,
    device_type: params.device_type,
    status: "online",
    metadata,
  };
  if (params.serial_key) {
    body.serial_key = params.serial_key;
  }
  if (params.is_revalidation) {
    body.is_revalidation = true;
  }

  // 1) 로컬 Lovable Cloud 우선 (이 프로젝트의 DB)
  let localResult: DeviceRow | null = null;
  try {
    const res = await fetch(getLocalFunctionUrl("register-device"), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: getLocalAnonKey() },
      body: JSON.stringify(body),
    });

    if (res.ok) {
      const data = await res.json();
      console.log("[deviceApi] ✅ Device registered via local function:", data);
      localResult = (data as any).device || (data as any);
    } else {
      const errData = await res.json().catch(() => ({}));
      // 시리얼 중복 사용 에러는 즉시 throw
      if (res.status === 409 || (errData as any)?.error === "serial_in_use") {
        throw new Error((errData as any)?.message || "이 시리얼은 현재 다른 기기에서 사용 중입니다.");
      }
      console.warn("[deviceApi] ⚠️ Local register-device failed:", res.status, errData);
    }
  } catch (err: any) {
    // 시리얼 중복 사용 에러는 반드시 상위로 전달
    if (err?.message?.includes("serial_in_use") || err?.message?.includes("사용 중")) {
      throw err;
    }
    console.warn("[deviceApi] ⚠️ Local register-device network error:", err);
  }

  // 2) 공유 프로젝트에도 항상 등록 (스마트폰 동기화용)
  // ★ 공유 DB register-device가 이름을 보존(덮어쓰기 방지)하므로, 반환된 이름이 다르면 즉시 update-device로 보정
  if (!isSharedRegisterCooldownActive()) {
    fetch(`${SHARED_SUPABASE_URL}/functions/v1/register-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
      body: JSON.stringify(body),
    })
      .then(async (res) => {
        if (!res.ok) {
          const t = await res.text();
          console.warn("[deviceApi] ⚠️ Shared register failed:", t);
          return;
        }
        const data = await res.json().catch(() => ({}));
        console.log("[deviceApi] ✅ Shared DB register OK:", data);

        // 공유 DB가 반환한 이름과 요청한 이름이 다르면 → 즉시 이름 보정
        const returnedName = (data as any)?.device_name || (data as any)?.name || "";
        const requestedName = params.device_name;
        const sharedDeviceId = (data as any)?.device_id || (data as any)?.id;
        const isDefault = (n: string) => !n || /^(Laptop\d*|My Laptop|Unknown)$/i.test(n.trim());

        if (sharedDeviceId && requestedName && !isDefault(requestedName) && returnedName !== requestedName) {
          console.log(`[deviceApi] 🔧 Shared DB name mismatch: "${returnedName}" → "${requestedName}", patching...`);
          fetch(`${SHARED_SUPABASE_URL}/functions/v1/update-device`, {
            method: "POST",
            headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
            body: JSON.stringify({ device_id: sharedDeviceId, name: requestedName }),
          })
            .then(r => r.ok
              ? console.log("[deviceApi] ✅ Shared DB name patched to:", requestedName)
              : r.text().then(t => console.warn("[deviceApi] ⚠️ Shared name patch failed:", t)))
            .catch(e => console.warn("[deviceApi] ⚠️ Shared name patch error:", e));
        }
      })
      .catch(err => console.warn("[deviceApi] ⚠️ Shared register error:", err));
  }

  if (localResult) return localResult;

  if (options?.throwOnFailure) throw new Error("All register-device attempts failed");
  return null;
}

/** 기기 정보 업데이트 — 로컬 우선, 공유 폴백 */
export async function updateDeviceViaEdge(
  deviceId: string,
  updates: Record<string, unknown>
): Promise<void> {
  // Skip virtual/synthetic devices (non-UUID IDs from Presence fallback)
  if (deviceId.startsWith("presence-")) {
    console.log(`[deviceApi] ⏭️ Skipping update for virtual device: ${deviceId}`);
    return;
  }

  // Normalize updates for cross-project compatibility
  const localUpdates: Record<string, unknown> = { ...updates };
  if (localUpdates.device_name && !localUpdates.name) {
    localUpdates.name = localUpdates.device_name;
  }
  if (localUpdates.name && !localUpdates.device_name) {
    localUpdates.device_name = localUpdates.name;
  }

  // Shared project must avoid device_name (schema cache mismatch in legacy project)
  const sharedUpdates: Record<string, unknown> = { ...localUpdates };
  delete sharedUpdates.device_name;

  // 1) 로컬 우선
  let localOk = false;
  try {
    const res = await fetch(getLocalFunctionUrl("update-device"), {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: getLocalAnonKey() },
      body: JSON.stringify({ device_id: deviceId, updates: localUpdates }),
    });
    if (res.ok) {
      console.log(`[deviceApi] ✅ Local updated device ${deviceId}`);
      localOk = true;
    }
  } catch (err) {
    console.warn("[deviceApi] Local update-device error:", err);
  }

  // 2) 공유 DB에도 항상 동기화 (fire-and-forget)
  // 공유DB에서는 매핑된 shared ID를 사용 (로컬 ID와 다를 수 있음)
  // 매핑이 없으면 복합 device_id 패턴으로 폴백 (UUID 불일치 방지)
  let sharedId = getSharedDeviceId(deviceId);
  if (!sharedId) {
    const savedAuth = getSavedAuth();
    if (savedAuth?.user_id && savedAuth?.serial_key) {
      // 복합 ID는 공유 update-device(legacy UUID 매칭)에서 500을 유발할 수 있으므로 매핑 전송 금지
      const compositeCandidate = `${savedAuth.user_id}_${savedAuth.serial_key}_laptop`;
      const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(compositeCandidate);
      if (isUuid) {
        sharedId = compositeCandidate;
      }
    } else if (/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(deviceId)) {
      sharedId = deviceId;
    }
  }

  if (!sharedId) {
    console.warn(`[deviceApi] ⏭️ Skip shared update-device (no mapped shared UUID): ${deviceId}`);
  } else {
    fetch(`${SHARED_SUPABASE_URL}/functions/v1/update-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
      body: JSON.stringify({ device_id: sharedId, updates: sharedUpdates }),
    })
      .then(res => res.ok
        ? console.log(`[deviceApi] ✅ Shared updated device ${sharedId}${sharedId !== deviceId ? ` (local: ${deviceId})` : ""}`)
        : res.text().then(t => console.warn("[deviceApi] ⚠️ Shared update failed:", t)))
      .catch(() => {});
  }

  if (localOk) return;

  throw new Error("update-device failed: all attempts failed");
}
