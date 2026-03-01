import { useEffect, useRef, useCallback } from "react";
import { updateDeviceViaEdge } from "@/lib/deviceApi";

/**
 * Listens for "network_info" commands from the smartphone app via metadata.network_info_requested.
 * Uses metadata from parent component (no independent polling).
 */
export function useNetworkInfoResponder(deviceId?: string, metadata?: Record<string, unknown> | null) {
  const isGathering = useRef(false);
  const lastRequestRef = useRef<string | null>(null);

  const handleRequest = useCallback(async (requestedAt: string) => {
    if (!deviceId || isGathering.current) return;
    if (lastRequestRef.current === requestedAt) return;

    isGathering.current = true;
    lastRequestRef.current = requestedAt;
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
      await updateDeviceViaEdge(deviceId, {
        ip_address: ip,
        is_network_connected: navigator.onLine,
        metadata: {
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
  }, [deviceId]);

  // React to metadata changes from parent (no independent polling)
  useEffect(() => {
    if (!metadata?.network_info_requested) return;
    handleRequest(metadata.network_info_requested as string);
  }, [metadata?.network_info_requested, handleRequest]);
}