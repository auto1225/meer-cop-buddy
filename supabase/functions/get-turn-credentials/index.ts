import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const apiKey = Deno.env.get("METERED_API_KEY");
    if (!apiKey) {
      return new Response(
        JSON.stringify({ error: "METERED_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const res = await fetch(
      `https://meercop.metered.live/api/v1/turn/credentials?apiKey=${apiKey}`
    );

    if (!res.ok) {
      const text = await res.text();
      console.error("[get-turn-credentials] Metered API error:", res.status, text);
      return new Response(
        JSON.stringify({ error: "Failed to fetch TURN credentials", status: res.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const credentials = await res.json();

    return new Response(JSON.stringify(credentials), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[get-turn-credentials] Error:", err);
    return new Response(
      JSON.stringify({ error: "Internal error" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
