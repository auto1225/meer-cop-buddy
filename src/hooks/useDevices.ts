import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseShared, SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { supabase } from "@/integrations/supabase/client";

// Shared DB schema
interface Device {
  id: string;
  device_id?: string;
  device_name?: string;
  name?: string;
  device_type: string;
  status: string;
  is_monitoring?: boolean;
  is_camera_connected: boolean | null;
  is_network_connected: boolean | null;
  is_streaming_requested: boolean | null;
  battery_level: number | null;
  last_seen_at: string | null;
  metadata: Record<string, unknown> | null;
  user_id?: string;
  created_at: string;
  updated_at: string;
}

// Export for compatibility with other components
export interface DeviceCompat {
  id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  status: string;
  last_seen_at: string | null;
  battery_level: number | null;
  is_charging: boolean;
  is_network_connected: boolean | null;
  is_monitoring: boolean;
  ip_address: string | null;
  os_info: string | null;
  app_version: string | null;
  metadata: Record<string, unknown> | null;
}

// Convert device to compatible format for components
function toCompatDevice(d: Device): DeviceCompat {
  const effectiveOnline = d.status === "online" || (d.is_monitoring === true && d.status !== "offline");
  // Filter out default/placeholder names — prefer the most specific name
  const rawName = d.device_name || d.name || "";
  const isDefault = !rawName || rawName === "My Laptop" || rawName === "My Smartphone" || rawName === "Unknown";
  const displayName = isDefault ? (d.name || d.device_name || "Laptop1") : rawName;
  return {
    id: d.id,
    device_id: d.device_id || d.id,
    device_name: displayName,
    device_type: d.device_type,
    status: effectiveOnline ? "online" : "offline",
    last_seen_at: d.last_seen_at,
    battery_level: d.battery_level,
    is_charging: false,
    is_network_connected: d.is_network_connected,
    is_monitoring: d.is_monitoring === true && d.status !== "offline",
    ip_address: null,
    os_info: null,
    app_version: null,
    metadata: d.metadata,
  };
}

// ── 로컬 Lovable Cloud Edge Function URL 헬퍼 ──
function getLocalFunctionUrl(fnName: string): string {
  const projectId = import.meta.env.VITE_SUPABASE_PROJECT_ID || "dmvbwyfzueywuwxkjuuy";
  return `https://${projectId}.supabase.co/functions/v1/${fnName}`;
}

function getLocalAnonKey(): string {
  return import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImRtdmJ3eWZ6dWV5d3V3eGtqdXV5Iiwicm9sZSI6ImFub24iLCJpYXQiOjE3NzAyOTI2ODMsImV4cCI6MjA4NTg2ODY4M30.0lDX72JHWonW5fRRPve_cdfJrNVyDMzz5nzshJ0cEuI";
}

function applyPhonePresenceStatus(deviceList: Device[], phoneOnline?: boolean): Device[] {
  // DB에 실제 smartphone row가 있을 때만 Presence 상태를 반영
  return deviceList.map((d) => {
    if (d.device_type !== "smartphone") return d;
    const newStatus = phoneOnline ? "online" : "offline";
    if (d.status === newStatus) return d;
    return { ...d, status: newStatus };
  });
}

export function useDevices(userId?: string) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const phoneOnlineByPresenceRef = useRef(false);
  const isFirstLoad = useRef(true);

  const fetchDevices = useCallback(async () => {
    if (!userId) return;
    try {
      if (isFirstLoad.current) setIsLoading(true);
      
      // 1) 로컬 Lovable Cloud get-devices 우선 시도
      let deviceList: Device[] = [];
      let fetched = false;

      try {
        const res = await fetch(getLocalFunctionUrl("get-devices"), {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            apikey: getLocalAnonKey(),
          },
          body: JSON.stringify({ user_id: userId }),
        });
        if (res.ok) {
          const data = await res.json();
          deviceList = data.devices || data || [];
          fetched = true;
          console.log("[useDevices] ✅ Local get-devices fetched:", deviceList.length, "devices");
        } else {
          console.warn("[useDevices] Local get-devices failed:", res.status);
        }
      } catch (e) {
        console.warn("[useDevices] Local get-devices network error:", e);
      }

      // 2) 로컬 실패 시 공유 프로젝트 폴백
      if (!fetched) {
        try {
          const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-devices`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              apikey: SHARED_SUPABASE_ANON_KEY,
            },
            body: JSON.stringify({ user_id: userId }),
          });
          if (res.ok) {
            const data = await res.json();
            deviceList = data.devices || data || [];
            fetched = true;
            console.log("[useDevices] ✅ Shared get-devices fetched:", deviceList.length, "devices");
          }
        } catch (e) {
          console.warn("[useDevices] Shared get-devices failed:", e);
        }
      }

      // 3) 모두 실패 시 직접 쿼리 시도
      if (!fetched) {
        try {
          const { data: fallbackData } = await supabase
            .from("devices")
            .select("*")
            .or(`device_id.eq.${userId},user_id.eq.${userId}`)
            .order("created_at", { ascending: true });
          if (fallbackData && fallbackData.length > 0) {
            deviceList = fallbackData as unknown as Device[];
            fetched = true;
            console.log("[useDevices] ✅ Direct query fetched:", deviceList.length, "devices");
          }
        } catch (e) {
          console.warn("[useDevices] Direct query failed:", e);
        }
      }

      if (!fetched) {
        setError("LOAD_DEVICES_FAILED");
        return;
      }

      console.log("[useDevices] Edge Function fetched:", deviceList.length, "devices");
      const correctedList = applyPhonePresenceStatus(deviceList, phoneOnlineByPresenceRef.current);
      setDevices(correctedList);
      setError(null);
    } catch (err) {
      console.error("[useDevices] Error fetching devices:", err);
      setError("LOAD_DEVICES_FAILED");
    } finally {
      isFirstLoad.current = false;
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let realtimeWorking = false;
    let pollInterval = 60000;

    fetchDevices();

    const schedulePoll = () => {
      if (!isMounted) return;
      pollTimeoutId = setTimeout(async () => {
        await fetchDevices();
        pollInterval = realtimeWorking ? 120000 : 15000;
        schedulePoll();
      }, pollInterval);
    };
    schedulePoll();

    const channelName = userId 
      ? `devices-changes-${userId}` 
      : "devices-changes";

    // 로컬 DB Realtime 구독 (Lovable Cloud)
    const channel = supabase
      .channel(channelName)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "devices" },
        (payload) => {
          realtimeWorking = true;
          if (payload.eventType === "INSERT") {
            setDevices((prev) => [payload.new as Device, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setDevices((prev) =>
              prev.map((d) => {
                if (d.id !== (payload.new as Device).id) return d;
                const updated = payload.new as Device;
                if (updated.device_type === "smartphone" && !phoneOnlineByPresenceRef.current && updated.status === "online") {
                  return { ...updated, status: "offline" };
                }
                return updated;
              })
            );
          } else if (payload.eventType === "DELETE") {
            setDevices((prev) =>
              prev.filter((d) => d.id !== (payload.old as Device).id)
            );
          }
        }
      )
      .subscribe((status) => {
        console.log(`[useDevices] Channel status: ${status}`);
        if (status === "SUBSCRIBED") {
          realtimeWorking = true;
          pollInterval = 120000;
        } else if (status === "CHANNEL_ERROR") {
          realtimeWorking = false;
          pollInterval = 15000;
        }
      });

    // Presence channel for instant online/offline detection
    let presenceChannel: ReturnType<typeof supabase.channel> | null = null;
    let phonePresenceHandler: ((e: Event) => void) | null = null;
    if (userId) {
      presenceChannel = supabase.channel(`user-presence-${userId}-devices`, {
        config: { presence: { key: "device-watcher" } },
      });

      const getOnlineDeviceIdsFromPresence = (state: Record<string, unknown[]>): Set<string> => {
        const onlineIds = new Set<string>();
        for (const [key, presences] of Object.entries(state)) {
          if (key === "device-watcher") continue;
          onlineIds.add(key);
          for (const p of presences as Record<string, unknown>[]) {
            if (p.device_id && typeof p.device_id === "string") {
              onlineIds.add(p.device_id);
            }
          }
        }
        return onlineIds;
      };

      const applyPresenceToDevices = (state: Record<string, unknown[]>) => {
        const onlineIds = getOnlineDeviceIdsFromPresence(state);
        console.log("[useDevices] 📡 Presence online devices:", [...onlineIds]);
        
        setDevices((prev) => {
          let changed = false;
          const updated = prev.map((d) => {
            const isPresenceOnline = onlineIds.has(d.id) || onlineIds.has(d.device_id || "");
            const currentlyOnline = d.status === "online";
            
            if (isPresenceOnline && !currentlyOnline) {
              changed = true;
              return { ...d, status: "online" };
            } else if (!isPresenceOnline && currentlyOnline && d.device_type === "smartphone") {
              changed = true;
              return { ...d, status: "offline" };
            }
            return d;
          });
          return changed ? updated : prev;
        });
      };

      presenceChannel
        .on("presence", { event: "sync" }, () => {
          const state = presenceChannel!.presenceState();
          console.log("[useDevices] 📡 Presence sync", Object.keys(state));
          applyPresenceToDevices(state);
        })
        .on("presence", { event: "join" }, ({ key, newPresences }) => {
          console.log("[useDevices] 📱 Presence JOIN:", key, newPresences);
          const state = presenceChannel!.presenceState();
          applyPresenceToDevices(state);
        })
        .on("presence", { event: "leave" }, ({ key, leftPresences }) => {
          console.log("[useDevices] 📴 Presence LEAVE:", key, leftPresences);
          const state = presenceChannel!.presenceState();
          applyPresenceToDevices(state);
        })
        .subscribe();

      const handlePhonePresence = (e: Event) => {
        const { online } = (e as CustomEvent<{ online: boolean }>).detail;
        phoneOnlineByPresenceRef.current = online;
        console.log("[useDevices] 📱 Phone presence event:", online);
        setDevices((prev) => {
          let changed = false;
          const updated = prev.map((d) => {
            if (d.device_type !== "smartphone") return d;
            const currentlyOnline = d.status === "online";
            if (online && !currentlyOnline) {
              changed = true;
              return { ...d, status: "online" };
            } else if (!online && currentlyOnline) {
              changed = true;
              return { ...d, status: "offline" };
            }
            return d;
          });
          return changed ? updated : prev;
        });
      };
      phonePresenceHandler = handlePhonePresence;
      window.addEventListener("phone-presence-changed", phonePresenceHandler);
    }

    return () => {
      isMounted = false;
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
      supabase.removeChannel(channel);
      if (presenceChannel) supabase.removeChannel(presenceChannel);
      if (phonePresenceHandler) window.removeEventListener("phone-presence-changed", phonePresenceHandler);
    };
  }, [fetchDevices, userId]);

  const compatDevices = devices.map(toCompatDevice);

  const stats = {
    total: devices.length,
    online: devices.filter((d) => d.is_monitoring === true || d.status === "online").length,
    offline: devices.filter((d) => d.is_monitoring !== true && d.status !== "online").length,
    lowBattery: devices.filter(
      (d) => d.battery_level !== null && d.battery_level < 20
    ).length,
  };

  return {
    devices: compatDevices,
    isLoading,
    error,
    refetch: fetchDevices,
    stats,
  };
}
