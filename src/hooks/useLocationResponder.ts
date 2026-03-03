import { useEffect, useRef, useCallback } from "react";
import { updateDeviceViaEdge } from "@/lib/deviceApi";
import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { getSharedDeviceId } from "@/lib/sharedDeviceIdMap";
import { channelManager } from "@/lib/channelManager";
import { getSavedAuth } from "@/lib/serialAuth";

/**
 * Listens for "locate" commands via:
 *   1) Broadcast channel (instant, < 1s)
 *   2) DB metadata.locate_requested (fallback)
 * Responds via Broadcast + dual DB write.
 */
export function useLocationResponder(deviceId?: string, metadata?: Record<string, unknown> | null) {
  const isLocating = useRef(false);
  const lastRequestRef = useRef<string | null>(null);

  // IP geolocation fallback
  const getIpLocation = useCallback(async (): Promise<{ lat: number; lng: number; source: string } | null> => {
    const apis = [
      {
        url: "https://ipapi.co/json/",
        parse: (d: any) => d.latitude && d.longitude ? { lat: d.latitude, lng: d.longitude, source: "ip" } : null,
      },
      {
        url: "https://ip-api.com/json/?fields=lat,lon,status",
        parse: (d: any) => d.status === "success" ? { lat: d.lat, lng: d.lon, source: "ip" } : null,
      },
    ];

    for (const api of apis) {
      try {
        const res = await fetch(api.url, { signal: AbortSignal.timeout(5000) });
        if (res.ok) {
          const data = await res.json();
          const result = api.parse(data);
          if (result) return result;
        }
      } catch { /* silent */ }
    }
    return null;
  }, []);

  const getLocation = useCallback(async (): Promise<{ lat: number; lng: number; source: string } | null> => {
    // 1) GPS/WiFi high accuracy
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error("not supported")); return; }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true, timeout: 8000, maximumAge: 30000,
        });
      });
      const source = pos.coords.accuracy < 100 ? "gps" : "wifi";
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, source };
    } catch { /* fall through */ }

    // 2) Low accuracy
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) { reject(new Error("not supported")); return; }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false, timeout: 5000, maximumAge: 60000,
        });
      });
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, source: "wifi" };
    } catch { /* fall through */ }

    // 3) IP fallback
    return await getIpLocation();
  }, [getIpLocation]);

  // Save to DBs (fire-and-forget, non-blocking)
  const saveLocationToDBs = useCallback(async (
    targetDeviceId: string, lat: number, lng: number, source: string,
  ) => {
    const updates = {
      latitude: lat, longitude: lng,
      location_updated_at: new Date().toISOString(),
      metadata: { locate_requested: null, location_source: source },
    };
    // Local DB
    updateDeviceViaEdge(targetDeviceId, updates).catch(e =>
      console.warn("[LocationResponder] Local save failed:", e));
    // Shared DB (mapped UUID only)
    const sharedId = getSharedDeviceId(targetDeviceId);
    if (sharedId) {
      fetch(`${SHARED_SUPABASE_URL}/functions/v1/update-device`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
        body: JSON.stringify({ device_id: sharedId, updates }),
      }).catch(e => console.warn("[LocationResponder] Shared save failed:", e));
    } else {
      console.warn(`[LocationResponder] ⏭️ Skip shared save (no mapped shared UUID): ${targetDeviceId}`);
    }
  }, []);

  // Core handler: get location → broadcast response → save to DBs
  const handleLocateRequest = useCallback(async (requestedAt: string) => {
    if (!deviceId || isLocating.current) return;
    if (lastRequestRef.current === requestedAt) return;

    isLocating.current = true;
    lastRequestRef.current = requestedAt;
    console.log("[LocationResponder] 📍 Locate requested at:", requestedAt);

    try {
      const location = await getLocation();
      if (!location) {
        console.error("[LocationResponder] ❌ All location methods failed");
        isLocating.current = false;
        return;
      }

      console.log(`[LocationResponder] ✅ Got ${location.source}: ${location.lat}, ${location.lng}`);

      // 1) 즉시 Broadcast 응답 (< 100ms)
      const savedAuth = getSavedAuth();
      if (savedAuth?.user_id) {
        const channelName = `user-commands-${savedAuth.user_id}`;
        const channel = channelManager.get(channelName);
        if (channel) {
          channel.send({
            type: "broadcast",
            event: "location_response",
            payload: {
              device_id: deviceId,
              lat: location.lat,
              lng: location.lng,
              source: location.source,
              timestamp: new Date().toISOString(),
            },
          }).then(() => console.log("[LocationResponder] 📡 Broadcast location_response sent"))
            .catch(e => console.warn("[LocationResponder] Broadcast send failed:", e));
        }
      }

      // 2) DB 저장 (비동기, 논블로킹)
      saveLocationToDBs(deviceId, location.lat, location.lng, location.source);
    } catch (err) {
      console.error("[LocationResponder] Error:", err);
    }
    isLocating.current = false;
  }, [deviceId, getLocation, saveLocationToDBs]);

  // ── 1) Broadcast 리스너 (즉시 반응, < 1초) ──
  useEffect(() => {
    const savedAuth = getSavedAuth();
    if (!savedAuth?.user_id || !deviceId) return;

    const channelName = `user-commands-${savedAuth.user_id}`;
    const channel = channelManager.get(channelName);
    if (!channel) return;

    const handler = (payload: any) => {
      const targetId = payload?.payload?.target_device_id;
      // 이 기기 대상인지 확인 (target 없으면 모든 기기가 응답)
      if (targetId && targetId !== deviceId) return;
      const requestedAt = payload?.payload?.requested_at || new Date().toISOString();
      handleLocateRequest(requestedAt);
    };

    channel.on("broadcast", { event: "locate_request" }, handler);
    console.log("[LocationResponder] 📡 Listening for locate_request broadcast");

    // Cleanup: Supabase JS doesn't support selective unbind easily,
    // but the channel lifecycle is managed by Index.tsx
    return () => {};
  }, [deviceId, handleLocateRequest]);

  // ── 2) DB metadata 폴백 (기존 방식 유지) ──
  useEffect(() => {
    if (!metadata?.locate_requested) return;
    handleLocateRequest(metadata.locate_requested as string);
  }, [metadata?.locate_requested, handleLocateRequest]);
}
