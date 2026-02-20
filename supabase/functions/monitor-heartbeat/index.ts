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
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const now = new Date();
    const results = { laptops_offlined: 0, smartphones_offlined: 0, monitoring_stopped: 0, alerts_created: 0 };

    // 1. 5분 이상 무응답 노트북 → offline 전환
    const fiveMinAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: staleLaptops } = await supabase
      .from("devices")
      .select("id, device_name, device_id, last_seen_at")
      .in("device_type", ["laptop", "desktop", "notebook"])
      .eq("status", "online")
      .lt("last_seen_at", fiveMinAgo);

    if (staleLaptops && staleLaptops.length > 0) {
      for (const laptop of staleLaptops) {
        await supabase
          .from("devices")
          .update({
            status: "offline",
            is_network_connected: false,
            is_camera_connected: false,
            updated_at: now.toISOString(),
          })
          .eq("id", laptop.id);

        // 활동 로그에 기록
        await supabase.from("activity_logs").insert({
          device_id: laptop.id,
          event_type: "server_offline_detected",
          event_data: {
            reason: "heartbeat_timeout",
            last_seen_at: laptop.last_seen_at,
            detected_at: now.toISOString(),
          },
        });

        results.laptops_offlined++;
        results.alerts_created++;
      }
    }

    // 2. 10분 이상 무응답 스마트폰 → offline + 소유 기기 감시 OFF
    const tenMinAgo = new Date(now.getTime() - 10 * 60 * 1000).toISOString();
    const { data: stalePhones } = await supabase
      .from("devices")
      .select("id, device_id, device_name, last_seen_at")
      .eq("device_type", "smartphone")
      .eq("status", "online")
      .lt("last_seen_at", tenMinAgo);

    if (stalePhones && stalePhones.length > 0) {
      for (const phone of stalePhones) {
        // 스마트폰 offline 전환
        await supabase
          .from("devices")
          .update({
            status: "offline",
            is_network_connected: false,
            updated_at: now.toISOString(),
          })
          .eq("id", phone.id);

        results.smartphones_offlined++;

        // device_id 기반으로 같은 사용자의 모든 노트북 감시 OFF
        // (device_id 필드가 사용자별 고유 식별자 역할)
        // 실제로는 같은 user의 기기를 찾아야 하지만, 현재 스키마에 user_id가 없으므로
        // activity_log에만 기록
        await supabase.from("activity_logs").insert({
          device_id: phone.id,
          event_type: "smartphone_offline_detected",
          event_data: {
            reason: "heartbeat_timeout",
            last_seen_at: phone.last_seen_at,
            detected_at: now.toISOString(),
          },
        });

        results.alerts_created++;
      }
    }

    console.log("[monitor-heartbeat]", JSON.stringify(results));

    return new Response(JSON.stringify({ ok: true, results }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("[monitor-heartbeat] Error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
