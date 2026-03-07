import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const METERED_DOMAIN = "meercop.metered.live";

async function listCredentials(secretKey: string): Promise<{ username: string; password: string } | null> {
  try {
    const res = await fetch(
      `https://${METERED_DOMAIN}/api/v1/turn/credential?secretKey=${secretKey}`,
      { method: "GET" }
    );
    const body = await res.text();
    if (!res.ok) {
      console.warn("[TURN] List credentials failed:", res.status, body);
      return null;
    }
    const credentials = JSON.parse(body);
    if (Array.isArray(credentials) && credentials.length > 0) {
      const cred = credentials[credentials.length - 1];
      console.log("[TURN] Reusing existing credential:", cred.username);
      return cred;
    }
    return null;
  } catch (err) {
    console.warn("[TURN] List credentials error:", err);
    return null;
  }
}

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

    // 1) Try listing existing credentials
    let cred = await listCredentials(secretKey);

    // 2) If none found, try creating
    if (!cred) {
      try {
        const createRes = await fetch(
          `https://${METERED_DOMAIN}/api/v1/turn/credential?secretKey=${secretKey}`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ expiryInSeconds: 86400 }),
          }
        );
        const createBody = await createRes.text();

        if (createRes.ok) {
          cred = JSON.parse(createBody);
          console.log("[TURN] Created new credential:", cred!.username);
        } else {
          console.warn("[TURN] Create failed:", createRes.status, createBody);
          // 3) 403 = limit reached → retry list after short delay
          if (createRes.status === 403) {
            await new Promise(r => setTimeout(r, 500));
            cred = await listCredentials(secretKey);
          }
        }
      } catch (err) {
        console.warn("[TURN] Create error:", err);
      }
    }

    // 4) If still no credential, return STUN-only config (not an error)
    if (!cred) {
      console.warn("[TURN] No credentials available, returning STUN-only");
      return new Response(JSON.stringify([]), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const iceServers = [
      { urls: "turn:standard.relay.metered.ca:80", username: cred.username, credential: cred.password },
      { urls: "turn:standard.relay.metered.ca:80?transport=tcp", username: cred.username, credential: cred.password },
      { urls: "turn:standard.relay.metered.ca:443", username: cred.username, credential: cred.password },
      { urls: "turns:standard.relay.metered.ca:443?transport=tcp", username: cred.username, credential: cred.password },
    ];

    return new Response(JSON.stringify(iceServers), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    console.error("[TURN] Unhandled error:", err);
    // Return empty array instead of 500 so client falls back to STUN
    return new Response(JSON.stringify([]), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
