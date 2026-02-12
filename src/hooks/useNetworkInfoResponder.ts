import { useEffect, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";

/**
 * Listens for "network_info" commands from the smartphone app via metadata.network_info_requested.
 * When triggered, gathers network info and saves to devices table.
 */
export function useNetworkInfoResponder(deviceId?: string) {
  const isGathering = useRef(false);

  useEffect(() => {
    if (!deviceId) return;

    const handleRequest = async () => {
      if (isGathering.current) return;
      isGathering.current = true;

      console.log("[NetworkInfoResponder] Network info requested");

      const connection = (navigator as any).connection || (navigator as any).mozConnection || (navigator as any).webkitConnection;

      let ip: string | null = null;
      try {
        const res = await fetch("https://api.ipify.org?format=json", { signal: AbortSignal.timeout(5000) });
        const data = await res.json();
        ip = data.ip;
      } catch {
        // IP fetch failed
      }

      try {
        // Read existing metadata first to preserve smartphone settings
        const { data: existing } = await supabaseShared
          .from("devices")
          .select("metadata")
          .eq("id", deviceId)
          .maybeSingle();
        const existingMeta = (existing?.metadata as Record<string, unknown>) || {};

        await supabaseShared
          .from("devices")
          .update({
            ip_address: ip,
            is_network_connected: navigator.onLine,
            metadata: {
              ...existingMeta,
              network_info: {
                type: connection?.type || "unknown",
                downlink: connection?.downlink ?? null,
                rtt: connection?.rtt ?? null,
                effective_type: connection?.effectiveType || "unknown",
                updated_at: new Date().toISOString(),
              },
              network_info_requested: null,
            },
          } as Record<string, unknown>)
          .eq("id", deviceId);

        console.log("[NetworkInfoResponder] Network info saved");
      } catch (err) {
        console.error("[NetworkInfoResponder] Failed to save:", err);
      }

      isGathering.current = false;
    };

    // Check on mount
    const checkInitial = async () => {
      const { data } = await supabaseShared
        .from("devices")
        .select("metadata")
        .eq("id", deviceId)
        .maybeSingle();

      const meta = data?.metadata as Record<string, unknown> | null;
      if (meta?.network_info_requested) {
        handleRequest();
      }
    };
    checkInitial();

    // Subscribe to realtime changes
    const channel = supabaseShared
      .channel(`network-cmd-${deviceId}`)
      .on(
        "postgres_changes",
        {
          event: "UPDATE",
          schema: "public",
          table: "devices",
          filter: `id=eq.${deviceId}`,
        },
        (payload) => {
          const meta = (payload.new as Record<string, unknown>).metadata as Record<string, unknown> | null;
          if (meta?.network_info_requested) {
            handleRequest();
          }
        }
      )
      .subscribe();

    return () => {
      supabaseShared.removeChannel(channel);
    };
  }, [deviceId]);
}
