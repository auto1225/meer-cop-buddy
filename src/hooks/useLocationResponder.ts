import { useEffect, useRef, useCallback } from "react";
import { updateDeviceViaEdge } from "@/lib/deviceApi";
import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";

/**
 * Listens for "locate" commands from the smartphone app via metadata.locate_requested.
 * Uses GPS first, then WiFi/IP geolocation as fallback.
 * Responds to BOTH local and shared DB.
 */
export function useLocationResponder(deviceId?: string, metadata?: Record<string, unknown> | null) {
  const isLocating = useRef(false);
  const lastRequestRef = useRef<string | null>(null);

  // IP geolocation fallback (free APIs, no key needed)
  const getIpLocation = useCallback(async (): Promise<{ lat: number; lng: number; source: string } | null> => {
    // Try multiple free IP geolocation APIs
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
          if (result) {
            console.log(`[LocationResponder] 🌐 IP location from ${api.url}:`, result);
            return result;
          }
        }
      } catch (e) {
        console.warn(`[LocationResponder] IP API failed (${api.url}):`, e);
      }
    }
    return null;
  }, []);

  // Try GPS with timeout, then fallback to IP
  const getLocation = useCallback(async (): Promise<{ lat: number; lng: number; source: string } | null> => {
    // 1) Try GPS/WiFi via navigator.geolocation (high accuracy = WiFi + GPS)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("Geolocation not supported"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: true,
          timeout: 10000,
          maximumAge: 30000,
        });
      });
      const source = pos.coords.accuracy < 100 ? "gps" : "wifi";
      console.log(`[LocationResponder] 📍 ${source.toUpperCase()} location: ${pos.coords.latitude}, ${pos.coords.longitude} (accuracy: ${pos.coords.accuracy}m)`);
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, source };
    } catch (gpsErr) {
      console.warn("[LocationResponder] GPS/WiFi failed:", gpsErr);
    }

    // 2) Try low-accuracy geolocation (IP-based browser location)
    try {
      const pos = await new Promise<GeolocationPosition>((resolve, reject) => {
        if (!navigator.geolocation) {
          reject(new Error("not supported"));
          return;
        }
        navigator.geolocation.getCurrentPosition(resolve, reject, {
          enableHighAccuracy: false,
          timeout: 5000,
          maximumAge: 60000,
        });
      });
      console.log(`[LocationResponder] 📍 Low-accuracy location: ${pos.coords.latitude}, ${pos.coords.longitude}`);
      return { lat: pos.coords.latitude, lng: pos.coords.longitude, source: "wifi" };
    } catch {
      console.warn("[LocationResponder] Low-accuracy geolocation also failed");
    }

    // 3) Fallback: IP geolocation API
    return await getIpLocation();
  }, [getIpLocation]);

  // Save location to BOTH local and shared DBs
  const saveLocation = useCallback(async (
    targetDeviceId: string,
    lat: number,
    lng: number,
    source: string,
  ) => {
    const updates = {
      latitude: lat,
      longitude: lng,
      location_updated_at: new Date().toISOString(),
      metadata: { locate_requested: null, location_source: source },
    };

    // 1) Local DB
    try {
      await updateDeviceViaEdge(targetDeviceId, updates);
      console.log("[LocationResponder] ✅ Location saved to local DB");
    } catch (e) {
      console.warn("[LocationResponder] Local save failed:", e);
    }

    // 2) Shared DB (fire-and-forget)
    try {
      await fetch(`${SHARED_SUPABASE_URL}/functions/v1/update-device`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
        body: JSON.stringify({ device_id: targetDeviceId, updates }),
      });
      console.log("[LocationResponder] ✅ Location saved to shared DB");
    } catch (e) {
      console.warn("[LocationResponder] Shared save failed:", e);
    }
  }, []);

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

      console.log(`[LocationResponder] ✅ Got ${location.source} location: ${location.lat}, ${location.lng}`);
      await saveLocation(deviceId, location.lat, location.lng, location.source);
    } catch (err) {
      console.error("[LocationResponder] Error:", err);
    }
    isLocating.current = false;
  }, [deviceId, getLocation, saveLocation]);

  // React to metadata changes from parent
  useEffect(() => {
    if (!metadata?.locate_requested) return;
    handleLocateRequest(metadata.locate_requested as string);
  }, [metadata?.locate_requested, handleLocateRequest]);
}
