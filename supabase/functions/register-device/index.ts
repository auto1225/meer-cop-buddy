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
    if (serial_key && !is_revalidation) {
      const { data: sameDevice } = await supabase
        .from("devices")
        .select("id, device_id, device_name, name, status")
        .eq("device_id", compositeDeviceId)
        .eq("status", "online")
        .limit(1);

      if (sameDevice && sameDevice.length > 0) {
        const activeName = sameDevice[0].device_name || sameDevice[0].name || "Unknown";
        console.log(`[register-device] ❌ Serial ${serial_key} already online: ${activeName}`);
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
      // 원칙: DB에 저장된 비기본 이름은 절대 덮어쓰지 않음
      const existingName = existing.device_name || existing.name || "";
      const existingHasCustomName = !isDefaultName(existingName);
      const requestHasCustomName = !isDefaultName(finalName);

      // 최종 이름 결정 로직:
      // 1) 기존에 커스텀 이름이 있으면 → 무조건 보존
      // 2) 기존이 기본값이고 요청도 기본값 → 기존 유지
      // 3) 기존이 기본값이고 요청이 커스텀 → 요청 값 사용
      let resolvedName: string;
      if (existingHasCustomName) {
        resolvedName = existingName;
      } else if (requestHasCustomName) {
        resolvedName = finalName;
      } else {
        resolvedName = existingName || finalName;
      }

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

      console.log(`[register-device] ♻️ Existing device updated: name="${resolvedName}" (was="${existingName}", requested="${finalName}")`);
    } else {
      // Insert new device
      const { data: inserted, error } = await supabase
        .from("devices")
        .insert({
          device_id: compositeDeviceId,
          user_id: finalUserId,
          device_name: finalName,
          name: finalName,
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
      console.log(`[register-device] 🆕 New device inserted: name="${finalName}"`);
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
