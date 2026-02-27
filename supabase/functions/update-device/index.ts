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
    const fieldsToUpdate = updates || directUpdates;

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

    // Sync name ↔ device_name
    if (fieldsToUpdate.device_name && !fieldsToUpdate.name) {
      fieldsToUpdate.name = fieldsToUpdate.device_name;
    } else if (fieldsToUpdate.name && !fieldsToUpdate.device_name) {
      fieldsToUpdate.device_name = fieldsToUpdate.name;
    }

    const { data, error } = await supabase
      .from("devices")
      .update(fieldsToUpdate)
      .eq("id", id)
      .select()
      .single();

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
