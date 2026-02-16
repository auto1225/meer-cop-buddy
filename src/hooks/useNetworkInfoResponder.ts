import { useEffect, useRef } from "react";
import { fetchDeviceViaEdge, updateDeviceViaEdge } from "@/lib/deviceApi";
import { getSavedAuth } from "@/lib/serialAuth";

/**
 * Listens for "network_info" commands from the smartphone app via metadata.network_info_requested.
 * When triggered, gathers network info and saves via Edge Function.
 */
export function useNetworkInfoResponder(deviceId?: string) {
  const isGathering = useRef(false);

  useEffect(() => {
    if (!deviceId) return;
    const savedAuth = getSavedAuth();
    const userId = savedAuth?.user_id;

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
        const device = userId ? await fetchDeviceViaEdge(deviceId, userId) : null;
        const existingMeta = (device?.metadata as Record<string, unknown>) || {};

        await updateDeviceViaEdge(deviceId, {
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
        });

        console.log("[NetworkInfoResponder] Network info saved");
      } catch (err) {
        console.error("[NetworkInfoResponder] Failed to save:", err);
      }

      isGathering.current = false;
    };

    // Check on mount via Edge Function
    const checkInitial = async () => {
      if (!userId) return;
      try {
        const device = await fetchDeviceViaEdge(deviceId, userId);
        const meta = device?.metadata as Record<string, unknown> | null;
        if (meta?.network_info_requested) {
          handleRequest();
        }
      } catch {
        // silent
      }
    };
    checkInitial();

    // Poll for network_info commands (Realtime blocked by RLS)
    let isMounted = true;
    const pollInterval = setInterval(async () => {
      if (!isMounted || !userId) return;
      try {
        const device = await fetchDeviceViaEdge(deviceId, userId);
        const meta = device?.metadata as Record<string, unknown> | null;
        if (meta?.network_info_requested) {
          handleRequest();
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
