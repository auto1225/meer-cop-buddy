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
    const body = await req.json();
    const { device_id, updates, ...directUpdates } = body;

    const id = device_id;
    // Support both { device_id, updates: {...} } and { device_id, key: val }
    const fieldsToUpdate: Record<string, unknown> = (updates || directUpdates) as Record<string, unknown>;

    if (!id) {
      return new Response(
        JSON.stringify({ error: "device_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Remove device_id from updates if present
    delete fieldsToUpdate.device_id;

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Merge metadata patch with latest DB metadata to prevent stale overwrite
    if (fieldsToUpdate.metadata && typeof fieldsToUpdate.metadata === "object" && !Array.isArray(fieldsToUpdate.metadata)) {
      const { data: existing, error: existingError } = await supabase
        .from("devices")
        .select("metadata")
        .eq("id", id)
        .maybeSingle();

      if (existingError) {
        console.error("update-device metadata fetch error:", existingError);
        return new Response(
          JSON.stringify({ error: existingError.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      const existingMeta = (existing?.metadata && typeof existing.metadata === "object")
        ? (existing.metadata as Record<string, unknown>)
        : {};

      fieldsToUpdate.metadata = {
        ...existingMeta,
        ...(fieldsToUpdate.metadata as Record<string, unknown>),
      };
    }

    // Sync name ↔ device_name: always keep both columns in sync
    if (fieldsToUpdate.device_name && !fieldsToUpdate.name) {
      fieldsToUpdate.name = fieldsToUpdate.device_name;
    }
    if (fieldsToUpdate.name && !fieldsToUpdate.device_name) {
      fieldsToUpdate.device_name = fieldsToUpdate.name;
    }

    // Whitelist: only allow known columns to prevent schema cache errors
    const allowedColumns = new Set([
      "device_id", "device_type", "status", "name", "device_name",
      "is_monitoring", "is_camera_connected", "is_network_connected",
      "is_streaming_requested", "is_charging", "battery_level",
      "last_seen_at", "metadata", "user_id", "ip_address", "os_info",
      "app_version", "latitude", "longitude", "location_updated_at",
    ]);
    for (const key of Object.keys(fieldsToUpdate)) {
      if (!allowedColumns.has(key)) {
        console.warn(`update-device: removing unknown column '${key}'`);
        delete fieldsToUpdate[key];
      }
    }

    const { data, error } = await supabase
      .from("devices")
      .update(fieldsToUpdate)
      .eq("id", id)
      .select()
      .maybeSingle();

    if (error) {
      console.error("update-device error:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ device: data }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("update-device error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
