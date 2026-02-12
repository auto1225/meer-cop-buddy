import { useEffect, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";

/**
 * Listens for "locate" commands from the smartphone app via metadata.locate_requested.
 * When triggered, gets browser geolocation and saves to devices table.
 */
export function useLocationResponder(deviceId?: string) {
  const isLocating = useRef(false);

  useEffect(() => {
    if (!deviceId) return;

    const handleLocateRequest = async (requestedAt: string) => {
      if (isLocating.current) return;
      isLocating.current = true;

      console.log("[LocationResponder] Locate requested at:", requestedAt);

      if (!navigator.geolocation) {
        console.error("[LocationResponder] Geolocation not supported");
        isLocating.current = false;
        return;
      }

      navigator.geolocation.getCurrentPosition(
        async (position) => {
          const { latitude, longitude } = position.coords;
          console.log("[LocationResponder] Got position:", latitude, longitude);

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
                latitude,
                longitude,
                location_updated_at: new Date().toISOString(),
                metadata: { ...existingMeta, locate_requested: null },
              } as Record<string, unknown>)
              .eq("id", deviceId);

            console.log("[LocationResponder] Location saved successfully");
          } catch (err) {
            console.error("[LocationResponder] Failed to save:", err);
          }
          isLocating.current = false;
        },
        (err) => {
          console.error("[LocationResponder] Geolocation error:", err);
          // Clear the request even on failure, preserving existing metadata
          supabaseShared
            .from("devices")
            .select("metadata")
            .eq("id", deviceId)
            .maybeSingle()
            .then(({ data: ex }) => {
              const exMeta = (ex?.metadata as Record<string, unknown>) || {};
              supabaseShared
                .from("devices")
                .update({ metadata: { ...exMeta, locate_requested: null } } as Record<string, unknown>)
                .eq("id", deviceId)
                .then(() => {});
            });
          isLocating.current = false;
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    };

    // Check on mount
    const checkInitial = async () => {
      const { data } = await supabaseShared
        .from("devices")
        .select("metadata")
        .eq("id", deviceId)
        .maybeSingle();

      const meta = data?.metadata as Record<string, unknown> | null;
      if (meta?.locate_requested) {
        handleLocateRequest(meta.locate_requested as string);
      }
    };
    checkInitial();

    // Subscribe to realtime changes
    const channel = supabaseShared
      .channel(`locate-cmd-${deviceId}`)
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
          if (meta?.locate_requested) {
            handleLocateRequest(meta.locate_requested as string);
          }
        }
      )
      .subscribe();

    return () => {
      supabaseShared.removeChannel(channel);
    };
  }, [deviceId]);
}
