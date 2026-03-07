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
 * 예: "2221" → "2221 (EE03)"
 */
async function deduplicateName(
  supabase: any,
  userId: string,
  candidateName: string,
  myCompositeId: string,
  serialKey: string | null
): Promise<string> {
  if (isDefaultName(candidateName)) return candidateName;

  // 같은 user_id, 같은 이름, 다른 device_id를 가진 기기가 있는지 확인
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

  // 중복 발견 → 시리얼 키 접미사 추가
  if (serialKey && serialKey.length >= 4) {
    const suffix = serialKey.slice(-4).toUpperCase();
    const newName = `${candidateName} (${suffix})`;
    console.log(`[register-device] 🔄 Name conflict: "${candidateName}" → "${newName}"`);
    return newName;
  }

  // 시리얼 키 없으면 숫자 접미사
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
    // serial_key가 있으면 고유한 복합 ID 생성 (다중 노트북 지원)
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
    // 같은 compositeDeviceId(=같은 기기)가 온라인인 경우는 재접속이므로 허용
    // 다른 compositeDeviceId가 같은 시리얼로 온라인인 경우만 차단
    if (serial_key && !is_revalidation) {
      const { data: allWithSerial } = await supabase
        .from("devices")
        .select("id, device_id, device_name, name, status")
        .eq("user_id", finalUserId)
        .eq("status", "online");

      const otherOnline = (allWithSerial || []).find((d: any) => {
        // metadata에서 serial_key 비교 또는 device_id 패턴에서 시리얼 추출
        const dSerial = d.device_id?.split("_")?.[1];
        return dSerial === serial_key && d.device_id !== compositeDeviceId;
      });

      if (otherOnline) {
        const activeName = otherOnline.device_name || otherOnline.name || "Unknown";
        console.log(`[register-device] ❌ Serial ${serial_key} already online on different device: ${activeName}`);
        return new Response(
          JSON.stringify({
            error: "serial_in_use",
            message: `이 시리얼은 현재 다른 기기(${activeName})에서 사용 중입니다. 해당 기기의 연결을 해제한 후 다시 시도해주세요.`,
            active_device: activeName,
          }),
          { status: 409, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
    }

    // Check if device already exists for this user + type
    const { data: existing } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", compositeDeviceId)
      .limit(1)
      .maybeSingle();

    let resultDevice: any;

    if (existing) {
      // ── 기존 기기: 이름 보존 규칙 ──
      const existingName = existing.device_name || existing.name || "";
      const existingHasCustomName = !isDefaultName(existingName);
      const requestHasCustomName = !isDefaultName(finalName);

      let resolvedName: string;
      if (existingHasCustomName) {
        resolvedName = existingName;
      } else if (requestHasCustomName) {
        resolvedName = finalName;
      } else {
        resolvedName = existingName || finalName;
      }

      // ★ 중복 이름 검사 및 자동 교정
      resolvedName = await deduplicateName(supabase, finalUserId, resolvedName, compositeDeviceId, serial_key);

      const updateFields: Record<string, unknown> = {
        last_seen_at: new Date().toISOString(),
        user_id: finalUserId,
        status: "online",
      };

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
        user_id: finalUserId,
        last_seen_at: updateFields.last_seen_at,
      };

      console.log(`[register-device] ♻️ Existing device updated: name="${resolvedName}" (was="${existingName}", requested="${finalName}", serial="${serial_key || 'none'}")`);
    } else {
      // ★ 새 기기: 중복 이름 검사 후 삽입
      const dedupedName = await deduplicateName(supabase, finalUserId, finalName, compositeDeviceId, serial_key);

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
      console.log(`[register-device] 🆕 New device inserted: name="${dedupedName}" (requested="${finalName}", serial="${serial_key || 'none'}")`);
    }

    // ── Upsert into licenses table if serial_key is provided ──
    if (serial_key && resultDevice?.id) {
      try {
        await supabase
          .from("licenses")
          .upsert(
            {
              serial_key: serial_key,
              user_id: finalUserId,
              device_id: resultDevice.id,
              device_type: finalType,
              updated_at: new Date().toISOString(),
            },
            { onConflict: "serial_key,device_type" }
          );
        console.log(`[register-device] ✅ License mapped: ${serial_key} → ${resultDevice.id}`);
      } catch (licErr) {
        console.error("[register-device] ⚠️ License upsert failed:", licErr);
      }

      // ── 고아 디바이스 자동 정리: 라이선스 매핑 없는 동일 user_id 기기 삭제 ──
      try {
        const { data: cleanupResult } = await supabase.rpc("cleanup_orphan_devices", {
          p_user_id: finalUserId,
        });
        if (cleanupResult && cleanupResult > 0) {
          console.log(`[register-device] 🧹 Cleaned up ${cleanupResult} orphan device(s) for user ${finalUserId}`);
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
