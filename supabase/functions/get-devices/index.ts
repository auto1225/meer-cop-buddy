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
    const { user_id, device_id } = await req.json();

    if (!user_id && !device_id) {
      return new Response(
        JSON.stringify({ error: "user_id or device_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    if (device_id) {
      const { data, error } = await supabase
        .from("devices")
        .select("*")
        .eq("id", device_id);

      if (error) {
        console.error("[get-devices] DB error:", error);
        return new Response(
          JSON.stringify({ error: error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }

      return new Response(
        JSON.stringify({ devices: data || [] }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Query by user_id - check both user_id and device_id columns
    // First try user_id column
    let { data, error } = await supabase
      .from("devices")
      .select("*")
      .eq("user_id", user_id)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("[get-devices] user_id query error:", error);
      // Fallback: try device_id column
      const result = await supabase
        .from("devices")
        .select("*")
        .eq("device_id", user_id)
        .order("created_at", { ascending: true });
      
      if (result.error) {
        console.error("[get-devices] device_id query error:", result.error);
        return new Response(
          JSON.stringify({ error: result.error.message }),
          { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
        );
      }
      data = result.data;
    }

    // If user_id query returned empty, also try device_id column
    if ((!data || data.length === 0)) {
      const result2 = await supabase
        .from("devices")
        .select("*")
        .eq("device_id", user_id)
        .order("created_at", { ascending: true });
      
      if (!result2.error && result2.data && result2.data.length > 0) {
        data = result2.data;
      }
    }

    return new Response(
      JSON.stringify({ devices: data || [] }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("get-devices error:", err);
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
