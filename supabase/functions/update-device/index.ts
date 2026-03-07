import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const duplicateNameIncludes = ["DUPLICATE_DEVICE_NAME", "already used", "이미 사용 중", "duplicate"];

function isDuplicateNameError(err: any): boolean {
  const rawMsg = String(err?.message || err?.error || "");
  const rawCode = String(err?.code || "");
  return rawCode === "23505" || duplicateNameIncludes.some((token) => rawMsg.includes(token));
}

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

    // Detect if id is a UUID or a composite ID (e.g. userId_serial_type)
    const isUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
    const matchCol = isUuid ? "id" : "device_id";

    // Merge metadata patch with latest DB metadata to prevent stale overwrite
    if (fieldsToUpdate.metadata && typeof fieldsToUpdate.metadata === "object" && !Array.isArray(fieldsToUpdate.metadata)) {
      const { data: existing, error: existingError } = await supabase
        .from("devices")
        .select("metadata")
        .eq(matchCol, id)
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
      "last_seen_at", "updated_at", "metadata", "user_id", "ip_address", "os_info",
      "app_version", "latitude", "longitude", "location_updated_at",
    ]);
    for (const key of Object.keys(fieldsToUpdate)) {
      if (!allowedColumns.has(key)) {
        console.warn(`update-device: removing unknown column '${key}'`);
        delete fieldsToUpdate[key];
      }
    }

    let data: any = null;
    let error: any = null;

    if (isUuid) {
      // Try matching by UUID (id) first, then fall back to device_id column
      const result1 = await supabase
        .from("devices")
        .update(fieldsToUpdate)
        .eq("id", id)
        .select()
        .maybeSingle();

      if (result1.data) {
        data = result1.data;
        error = result1.error;
      } else {
        const result2 = await supabase
          .from("devices")
          .update(fieldsToUpdate)
          .eq("device_id", id)
          .select()
          .maybeSingle();
        data = result2.data;
        error = result2.error;
      }
    } else {
      // Composite ID: match by device_id column directly (skip UUID column)
      const result = await supabase
        .from("devices")
        .update(fieldsToUpdate)
        .eq("device_id", id)
        .select()
        .maybeSingle();
      data = result.data;
      error = result.error;
    }

    if (error) {
      if (isDuplicateNameError(error)) {
        console.warn("update-device duplicate name conflict (ignored):", error);
        return new Response(
          JSON.stringify({
            device: data ?? null,
            ignored: true,
            reason: "DUPLICATE_DEVICE_NAME",
            message: String((error as any)?.message || "Duplicate device name"),
          }),
          { headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      console.error("update-device error:", error);
      return new Response(
        JSON.stringify({ error: String((error as any)?.message || "update-device failed") }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

      console.error("update-device error:", error);
      return new Response(
        JSON.stringify({ error: rawMsg || "update-device failed" }),
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
