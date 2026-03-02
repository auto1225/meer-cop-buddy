import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { user_id, name, device_name, device_type, status, metadata, serial_key } =
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

    // ── 시리얼 중복 사용 검증: 같은 시리얼로 online 상태인 다른 기기가 있으면 거부 ──
    if (serial_key) {
      const otherCompositeId = compositeDeviceId;
      const { data: onlineDevices } = await supabase
        .from("devices")
        .select("id, device_id, device_name, name, status")
        .eq("device_id", otherCompositeId)
        .eq("status", "online")
        .limit(1);

      // 같은 composite ID로 online인 기기가 있으면 → 이미 사용 중
      if (onlineDevices && onlineDevices.length > 0) {
        const activeName = onlineDevices[0].device_name || onlineDevices[0].name || "Unknown";
        console.log(`[register-device] ❌ Serial ${serial_key} already in use by online device: ${activeName}`);
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
      const existingName = existing.device_name || existing.name || "";
      const isDefaultName = !existingName || existingName === "My Laptop" || existingName === "My Smartphone" || existingName === "Unknown";
      const preservedName = isDefaultName ? finalName : existingName;

      const updateFields: Record<string, unknown> = {
        last_seen_at: new Date().toISOString(),
        user_id: finalUserId,
      };
      if (isDefaultName || (finalName !== "My Laptop" && finalName !== "My Smartphone" && finalName !== existingName)) {
        updateFields.device_name = isDefaultName && finalName !== "My Laptop" && finalName !== "My Smartphone" ? finalName : preservedName;
        updateFields.name = updateFields.device_name;
      }

      await supabase
        .from("devices")
        .update(updateFields)
        .eq("id", existing.id);

      resultDevice = {
        ...existing,
        device_name: (updateFields.device_name as string) || existingName,
        name: (updateFields.name as string) || existingName,
        user_id: finalUserId,
        last_seen_at: updateFields.last_seen_at,
      };
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
          status: status || "offline",
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
