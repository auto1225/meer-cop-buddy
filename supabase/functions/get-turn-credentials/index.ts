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
    const secretKey = Deno.env.get("METERED_API_KEY");
    if (!secretKey) {
      return new Response(
        JSON.stringify({ error: "METERED_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Create a temporary TURN credential (expires in 1 hour)
    const createRes = await fetch(
      `https://meercop.metered.live/api/v1/turn/credential?secretKey=${secretKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ expiryInSeconds: 3600 }),
      }
    );

    if (!createRes.ok) {
      const text = await createRes.text();
      console.error("[get-turn-credentials] Create credential error:", createRes.status, text);
      return new Response(
        JSON.stringify({ error: "Failed to create TURN credential", status: createRes.status }),
        { status: 502, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const cred = await createRes.json();
    console.log("[get-turn-credentials] Created credential for user:", cred.username);

    // Return ICE servers in RTCPeerConnection format
    const iceServers = [
      {
        urls: "turn:standard.relay.metered.ca:80",
        username: cred.username,
        credential: cred.password,
      },
      {
        urls: "turn:standard.relay.metered.ca:80?transport=tcp",
        username: cred.username,
        credential: cred.password,
      },
      {
        urls: "turn:standard.relay.metered.ca:443",
        username: cred.username,
        credential: cred.password,
      },
      {
        urls: "turns:standard.relay.metered.ca:443?transport=tcp",
        username: cred.username,
        credential: cred.password,
      },
    ];

    return new Response(JSON.stringify(iceServers), {
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
