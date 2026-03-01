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
    const { user_id, name, device_name, device_type, status, metadata } =
      await req.json();

    const finalName = device_name || name || "My Laptop";
    const finalUserId = user_id;
    const finalType = device_type || "laptop";
    // device_id를 user_id + device_type으로 구분하여 unique constraint 충돌 방지
    const compositeDeviceId = `${finalUserId}_${finalType}`;

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

    // Check if device already exists for this user + type
    const { data: existing } = await supabase
      .from("devices")
      .select("*")
      .eq("device_id", compositeDeviceId)
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Preserve user-saved name: only update name if existing name is empty/default
      const existingName = existing.device_name || existing.name || "";
      const isDefaultName = !existingName || existingName === "My Laptop" || existingName === "My Smartphone" || existingName === "Unknown";
      const preservedName = isDefaultName ? finalName : existingName;

      const updateFields: Record<string, unknown> = {
        last_seen_at: new Date().toISOString(),
        user_id: finalUserId,
      };
      // Only overwrite name if the incoming name is NOT a default AND differs from existing
      if (isDefaultName || (finalName !== "My Laptop" && finalName !== "My Smartphone" && finalName !== existingName)) {
        updateFields.device_name = isDefaultName && finalName !== "My Laptop" && finalName !== "My Smartphone" ? finalName : preservedName;
        updateFields.name = updateFields.device_name;
      }

      await supabase
        .from("devices")
        .update(updateFields)
        .eq("id", existing.id);

      const returnDevice = { 
        ...existing, 
        device_name: (updateFields.device_name as string) || existingName, 
        name: (updateFields.name as string) || existingName, 
        user_id: finalUserId,
        last_seen_at: updateFields.last_seen_at,
      };

      return new Response(
        JSON.stringify({ device: returnDevice }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

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

    return new Response(
      JSON.stringify({ device: inserted }),
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
