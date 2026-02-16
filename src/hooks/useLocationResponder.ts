import { useEffect, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";
import { fetchDeviceViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import { getSavedAuth } from "@/lib/serialAuth";

/**
 * Listens for "locate" commands from the smartphone app via metadata.locate_requested.
 * When triggered, gets browser geolocation and saves to devices table via Edge Function.
 */
export function useLocationResponder(deviceId?: string) {
  const isLocating = useRef(false);

  useEffect(() => {
    if (!deviceId) return;
    const savedAuth = getSavedAuth();
    const userId = savedAuth?.user_id;

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
            const device = userId ? await fetchDeviceViaEdge(deviceId, userId) : null;
            const existingMeta = (device?.metadata as Record<string, unknown>) || {};

            await updateDeviceViaEdge(deviceId, {
              latitude,
              longitude,
              location_updated_at: new Date().toISOString(),
              metadata: { ...existingMeta, locate_requested: null },
            });

            console.log("[LocationResponder] Location saved successfully");
          } catch (err) {
            console.error("[LocationResponder] Failed to save:", err);
          }
          isLocating.current = false;
        },
        (err) => {
          console.error("[LocationResponder] Geolocation error:", err);
          // Clear the request even on failure
          if (userId) {
            fetchDeviceViaEdge(deviceId, userId).then(device => {
              const exMeta = (device?.metadata as Record<string, unknown>) || {};
              updateDeviceViaEdge(deviceId, {
                metadata: { ...exMeta, locate_requested: null },
              }).catch(() => {});
            }).catch(() => {});
          }
          isLocating.current = false;
        },
        { enableHighAccuracy: true, timeout: 15000 }
      );
    };

    // Check on mount via Edge Function
    const checkInitial = async () => {
      if (!userId) return;
      try {
        const device = await fetchDeviceViaEdge(deviceId, userId);
        const meta = device?.metadata as Record<string, unknown> | null;
        if (meta?.locate_requested) {
          handleLocateRequest(meta.locate_requested as string);
        }
      } catch (err) {
        console.error("[LocationResponder] Initial check failed:", err);
      }
    };
    checkInitial();

    // Poll for locate commands (Realtime blocked by RLS)
    let isMounted = true;
    const pollInterval = setInterval(async () => {
      if (!isMounted || !userId) return;
      try {
        const device = await fetchDeviceViaEdge(deviceId, userId);
        const meta = device?.metadata as Record<string, unknown> | null;
        if (meta?.locate_requested) {
          handleLocateRequest(meta.locate_requested as string);
        }
      } catch {
        // silent
      }
    }, 5000);

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [deviceId]);
}
