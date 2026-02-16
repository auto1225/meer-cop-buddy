import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const SHARED_SUPABASE_URL = "https://sltxwkdvaapyeosikegj.supabase.co";
const SHARED_SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InNsdHh3a2R2YWFweWVvc2lrZWdqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyNjg4MjQsImV4cCI6MjA4NTg0NDgyNH0.hj6A8YDTRMQkPid9hfw6vnGC2eQLTmv2JPmQRLv4sZ4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, x-supabase-client-platform",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const { device_id, updates } = await req.json();

    if (!device_id || !updates) {
      return new Response(
        JSON.stringify({ error: "device_id and updates are required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Forward to shared Supabase's update-device Edge Function
    const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/update-device`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "apikey": SHARED_SUPABASE_ANON_KEY,
        "Authorization": `Bearer ${SHARED_SUPABASE_ANON_KEY}`,
      },
      body: JSON.stringify({ device_id, updates }),
    });

    const data = await res.text();
    
    return new Response(data, {
      status: res.status,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(
      JSON.stringify({ error: err.message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});