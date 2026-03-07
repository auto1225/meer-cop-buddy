import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// 기본값(디폴트) 이름인지 판별
function isDefaultName(name: string | null | undefined): boolean {
  if (!name) return true;
  const n = name.trim().toLowerCase();
  return !n || ["my laptop", "my smartphone", "unknown", "laptop", "laptop1"].includes(n);
}

/**
 * 동일 user_id 내에서 이름 중복을 방지합니다.
 * 중복 시 시리얼 키 앞 4자리를 접미사로 붙여 고유 이름을 생성합니다.
 */
async function deduplicateName(
  supabase: any,
  userId: string,
  candidateName: string,
  myCompositeId: string,
  serialKey: string | null
): Promise<string> {
  if (isDefaultName(candidateName)) return candidateName;

  const { data: sameNameDevices } = await supabase
    .from("devices")
    .select("device_id, device_name, name")
    .eq("user_id", userId)
    .neq("device_id", myCompositeId);

  if (!sameNameDevices || sameNameDevices.length === 0) return candidateName;

  const conflicting = sameNameDevices.filter((d: any) => {
    const dName = (d.device_name || d.name || "").trim().toLowerCase();
    return dName === candidateName.trim().toLowerCase();
  });

  if (conflicting.length === 0) return candidateName;

  if (serialKey && serialKey.length >= 4) {
    const suffix = serialKey.slice(-4).toUpperCase();
    const newName = `${candidateName} (${suffix})`;
    console.log(`[register-device] 🔄 Name conflict: "${candidateName}" → "${newName}"`);
    return newName;
  }

  let counter = 2;
  let newName = `${candidateName} (${counter})`;
  const allNames = new Set(sameNameDevices.map((d: any) => (d.device_name || d.name || "").trim().toLowerCase()));
  while (allNames.has(newName.toLowerCase())) {
    counter++;
    newName = `${candidateName} (${counter})`;
  }
  console.log(`[register-device] 🔄 Name conflict: "${candidateName}" → "${newName}"`);
  return newName;
}

/**
 * licenses 테이블에서 시리얼 키에 매핑된 기기명(SSOT)을 조회합니다.
 */
async function getLicenseDeviceName(
  supabase: any,
  serialKey: string,
  deviceType: string
): Promise<string | null> {
  try {
    const { data } = await supabase
      .from("licenses")
      .select("device_name")
      .eq("serial_key", serialKey)
      .eq("device_type", deviceType)
      .maybeSingle();
    return data?.device_name || null;
  } catch {
    return null;
  }
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, name, device_name, device_type, status, metadata, serial_key, is_revalidation } =
      await req.json();

    const finalName = device_name || name || "My Laptop";
    const finalUserId = user_id;
    const finalType = device_type || "laptop";
    const compositeDeviceId = serial_key
      ? `${finalUserId}_${serial_key}_${finalType}`
      : `${finalUserId}_${finalType}`;

    if (!finalUserId) {
      return new Response(
        JSON.stringify({ error: "user_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // ── 시리얼 중복 사용 검증 (재검증 요청은 건너뜀) ──
    if (serial_key && !is_revalidation) {
      const { data: allWithSerial } = await supabase
        .from("devices")
        .select("id, device_id, device_name, name, status, last_seen_at")
        .eq("user_id", finalUserId)
        .eq("status", "online");

      const otherOnline = (allWithSerial || []).find((d: any) => {
        const dSerial = d.device_id?.split("_")?.[1];
        return dSerial === serial_key && d.device_id !== compositeDeviceId;
      });

      if (otherOnline) {
        const lastSeen = otherOnline.last_seen_at ? new Date(otherOnline.last_seen_at).getTime() : 0;
        const staleThreshold = 3 * 60 * 1000;
        const isStale = (Date.now() - lastSeen) > staleThreshold;

        if (isStale) {
          console.log(`[register-device] 🔄 Stale device "${otherOnline.device_name}" auto-offlined`);
          await supabase
            .from("devices")
            .update({ status: "offline", is_monitoring: false })
            .eq("id", otherOnline.id);
        } else {
          const activeName = otherOnline.device_name || otherOnline.name || "Unknown";
          return new Response(
            JSON.stringify({
              error: "serial_in_use",
              message: `이 시리얼은 현재 다른 기기(${activeName})에서 사용 중입니다.`,
              active_device: activeName,
            }),
            { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
          );
        }
      }
    }

    // ★ SSOT: licenses.device_name에서 이 시리얼의 공식 기기명 조회
    let ssotName: string | null = null;
    if (serial_key) {
      ssotName = await getLicenseDeviceName(supabase, serial_key, finalType);
      if (ssotName) {
        console.log(`[register-device] 📛 SSOT name from licenses: "${ssotName}" (serial: ${serial_key})`);
      }
    }

    // Check if device already exists
    const { data: existing } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", compositeDeviceId)
      .limit(1)
      .maybeSingle();

    let resultDevice: any;

    if (existing) {
      // ── 기존 기기: SSOT 이름 우선 적용 ──
      // 우선순위: 1. licenses.device_name(SSOT) → 2. 기존 DB 이름(custom) → 3. 요청 이름
      const existingName = existing.device_name || existing.name || "";
      
      let resolvedName: string;
      if (ssotName) {
        // ★ licenses에 저장된 이름이 최우선 (SSOT)
        resolvedName = ssotName;
      } else if (!isDefaultName(existingName)) {
        resolvedName = existingName;
      } else if (!isDefaultName(finalName)) {
        resolvedName = finalName;
      } else {
        resolvedName = existingName || finalName;
      }

      // 중복 이름 검사 및 자동 교정
      resolvedName = await deduplicateName(supabase, finalUserId, resolvedName, compositeDeviceId, serial_key);

      const updateFields: Record<string, unknown> = {
        last_seen_at: new Date().toISOString(),
        user_id: finalUserId,
        status: "online",
      };

      // ★ device_type이 변경된 경우 업데이트 (시리얼을 다른 종류의 기기에서 사용)
      if (existing.device_type !== finalType) {
        updateFields.device_type = finalType;
        console.log(`[register-device] 🔄 device_type changed: "${existing.device_type}" → "${finalType}"`);
      }

      // 이름이 실제로 변경되었을 때만 업데이트
      if (resolvedName !== existingName) {
        updateFields.device_name = resolvedName;
        updateFields.name = resolvedName;
      }

      await supabase
        .from("devices")
        .update(updateFields)
        .eq("id", existing.id);

      resultDevice = {
        ...existing,
        device_name: resolvedName,
        name: resolvedName,
        device_type: updateFields.device_type || existing.device_type,
        user_id: finalUserId,
        last_seen_at: updateFields.last_seen_at,
      };

      console.log(`[register-device] ♻️ Existing device updated: name="${resolvedName}" (ssot="${ssotName}", existing="${existingName}", requested="${finalName}", serial="${serial_key || 'none'}")`);
    } else {
      // ★ 새 기기: SSOT 이름 우선, 없으면 요청 이름 사용
      const nameToUse = ssotName || finalName;
      const dedupedName = await deduplicateName(supabase, finalUserId, nameToUse, compositeDeviceId, serial_key);

      const { data: inserted, error } = await supabase
        .from("devices")
        .insert({
          device_id: compositeDeviceId,
          user_id: finalUserId,
          device_name: dedupedName,
          name: dedupedName,
          device_type: finalType,
          status: "online",
          is_monitoring: false,
          is_camera_connected: false,
          is_network_connected: false,
          is_streaming_requested: false,
          metadata: metadata || {},
        })
        .select()
        .single();

      if (error) {
        console.error("Insert error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      resultDevice = inserted;
      console.log(`[register-device] 🆕 New device inserted: name="${dedupedName}" (ssot="${ssotName}", requested="${finalName}", serial="${serial_key || 'none'}")`);
    }

    // ── Upsert into licenses table if serial_key is provided ──
    // ★ device_name도 함께 저장 (SSOT 유지)
    if (serial_key && resultDevice?.id) {
      const deviceNameForLicense = resultDevice.device_name || resultDevice.name || finalName;
      try {
        await supabase
          .from("licenses")
          .upsert(
            {
              serial_key: serial_key,
              user_id: finalUserId,
              device_id: resultDevice.id,
              device_type: finalType,
              device_name: deviceNameForLicense,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "serial_key,device_type" }
          );
        console.log(`[register-device] ✅ License mapped: ${serial_key} → ${resultDevice.id} (name: "${deviceNameForLicense}")`);
      } catch (licErr) {
        console.error("[register-device] ⚠️ License upsert failed:", licErr);
      }

      // ── 고아 디바이스 자동 정리 ──
      try {
        const { data: cleanupResult } = await supabase.rpc("cleanup_orphan_devices", {
          p_user_id: finalUserId,
        });
        if (cleanupResult && cleanupResult > 0) {
          console.log(`[register-device] 🧹 Cleaned up ${cleanupResult} orphan device(s)`);
        }
      } catch (cleanupErr) {
        console.warn("[register-device] ⚠️ Orphan cleanup failed:", cleanupErr);
      }
    }

    return new Response(
      JSON.stringify({ device: resultDevice }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("register-device error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
