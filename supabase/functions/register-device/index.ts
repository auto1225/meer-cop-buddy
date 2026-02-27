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
      .eq("device_id", finalUserId)
      .eq("device_type", device_type || "laptop")
      .limit(1)
      .maybeSingle();

    if (existing) {
      // Update last_seen and name
      await supabase
        .from("devices")
        .update({
          last_seen_at: new Date().toISOString(),
          device_name: finalName,
          name: finalName,
          user_id: finalUserId,
        })
        .eq("id", existing.id);

      return new Response(
        JSON.stringify({ device: { ...existing, device_name: finalName, name: finalName, user_id: finalUserId } }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Insert new device
    const { data: inserted, error } = await supabase
      .from("devices")
      .insert({
        device_id: finalUserId,
        user_id: finalUserId,
        device_name: finalName,
        name: finalName,
        device_type: device_type || "laptop",
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
