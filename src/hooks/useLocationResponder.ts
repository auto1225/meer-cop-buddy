import { useEffect, useRef, useCallback } from "react";
import { fetchDeviceViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import { getSavedAuth } from "@/lib/serialAuth";

/**
 * Listens for "locate" commands from the smartphone app via metadata.locate_requested.
 * Uses metadata from parent component (no independent polling).
 */
export function useLocationResponder(deviceId?: string, metadata?: Record<string, unknown> | null) {
  const isLocating = useRef(false);
  const lastRequestRef = useRef<string | null>(null);

  const handleLocateRequest = useCallback(async (requestedAt: string) => {
    if (!deviceId || isLocating.current) return;
    if (lastRequestRef.current === requestedAt) return; // Already handled
    
    isLocating.current = true;
    lastRequestRef.current = requestedAt;
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
          const savedAuth = getSavedAuth();
          const userId = savedAuth?.user_id;
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
        isLocating.current = false;
      },
      { enableHighAccuracy: true, timeout: 15000 }
    );
  }, [deviceId]);

  // React to metadata changes from parent (no independent polling)
  useEffect(() => {
    if (!metadata?.locate_requested) return;
    handleLocateRequest(metadata.locate_requested as string);
  }, [metadata?.locate_requested, handleLocateRequest]);
}