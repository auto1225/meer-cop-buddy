import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseShared, SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
// Using shared Supabase client (same as MeerCOP mobile app)

// Shared DB schema (sltxwkdvaapyeosikegj.supabase.co)
interface Device {
  id: string;
  device_id?: string;
  device_name?: string;
  name?: string; // Edge Function returns "name" instead of "device_name"
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
  // is_monitoring이 true여도 status가 offline이면 실제로 꺼진 것
  const effectiveOnline = d.status === "online" || (d.is_monitoring === true && d.status !== "offline");
  return {
    id: d.id,
    device_id: d.device_id || d.id,
    device_name: d.device_name || d.name || "Unknown",
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

export function useDevices(userId?: string) {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Presence로 감지한 스마트폰 온라인 상태를 DB 폴링이 덮어쓰지 않도록 보존
  const phoneOnlineByPresenceRef = useRef(false);

  const isFirstLoad = useRef(true);

  const fetchDevices = useCallback(async () => {
    if (!userId) return;
    try {
      if (isFirstLoad.current) setIsLoading(true);
      
      // Edge Function을 통해 기기 목록 조회 (RLS 우회, service_role 사용)
      const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-devices`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "apikey": SHARED_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify({ user_id: userId }),
      });

      if (!res.ok) {
        const errData = await res.json().catch(() => ({}));
        console.warn("[useDevices] Edge Function error:", res.status, errData);
        // Fallback: 직접 쿼리 시도 (RLS 허용 시)
        const { data: fallbackData } = await supabaseShared
          .from("devices")
          .select("*");
        if (fallbackData && fallbackData.length > 0) {
          console.log("[useDevices] Fallback fetched:", fallbackData.length, "devices");
          setDevices(fallbackData as Device[]);
          setError(null);
          return;
        }
        throw new Error(errData.error || `get-devices failed: ${res.status}`);
      }

      const data = await res.json();
      const deviceList = data.devices || data || [];
      console.log("[useDevices] Edge Function fetched:", deviceList.length, "devices");
      // Presence로 감지한 스마트폰 online 상태를 DB 데이터가 덮어쓰지 않도록 보정
      const correctedList = (deviceList as Device[]).map((d) => {
        if (d.device_type === "smartphone" && phoneOnlineByPresenceRef.current && d.status !== "online") {
          return { ...d, status: "online" };
        }
        return d;
      });
      setDevices(correctedList);
      setError(null);
    } catch (err) {
      console.error("[useDevices] Error fetching devices:", err);
      setError("디바이스 목록을 불러오는데 실패했습니다.");
    } finally {
      isFirstLoad.current = false;
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let realtimeWorking = false;
    // Presence + Realtime이 동작하므로 폴링은 드문 안전장치로만 사용
    let pollInterval = 60000;

    fetchDevices();

    // 폴링: Realtime/Presence 실패 시 안전장치 (기본 60초, Realtime 실패 시 15초)
    const schedulePoll = () => {
      if (!isMounted) return;
      pollTimeoutId = setTimeout(async () => {
        await fetchDevices();
        pollInterval = realtimeWorking ? 60000 : 15000;
        schedulePoll();
      }, pollInterval);
    };
    schedulePoll();

    const channelName = userId 
      ? `devices-changes-${userId}` 
      : "devices-changes";

    // Subscribe to realtime updates (postgres_changes)
    const channel = supabaseShared
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
        },
        (payload) => {
          realtimeWorking = true;
          pollInterval = 15000;

          if (payload.eventType === "INSERT") {
            setDevices((prev) => [payload.new as Device, ...prev]);
          } else if (payload.eventType === "UPDATE") {
            setDevices((prev) =>
              prev.map((d) =>
                d.id === (payload.new as Device).id ? (payload.new as Device) : d
              )
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
          pollInterval = 15000;
        } else if (status === "CHANNEL_ERROR") {
          realtimeWorking = false;
          pollInterval = 5000;
          console.error("[useDevices] Channel error");
        }
      });

    // Presence channel: detect smartphone online/offline instantly
    // Presence 상태를 직접 로컬에 반영하여 DB 폴링 대기 없이 즉시 UI 업데이트
    let presenceChannel: ReturnType<typeof supabaseShared.channel> | null = null;
    let phonePresenceHandler: ((e: Event) => void) | null = null;
    if (userId) {
      presenceChannel = supabaseShared.channel(`user-presence-${userId}-devices`, {
        config: { presence: { key: "device-watcher" } },
      });

      // Presence 상태에서 온라인 device_id 목록 추출
      const getOnlineDeviceIdsFromPresence = (state: Record<string, unknown[]>): Set<string> => {
        const onlineIds = new Set<string>();
        for (const [key, presences] of Object.entries(state)) {
          if (key === "device-watcher") continue; // 자기 자신 스킵
          // key 자체가 device_id인 경우
          onlineIds.add(key);
          // presence payload에 device_id가 있는 경우도 처리
          for (const p of presences as Record<string, unknown>[]) {
            if (p.device_id && typeof p.device_id === "string") {
              onlineIds.add(p.device_id);
            }
          }
        }
        return onlineIds;
      };

      // Presence 변경 시 로컬 devices 상태 즉시 업데이트
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
              // 스마트폰만 Presence LEAVE로 즉시 offline 처리
              // 랩탑은 자체 heartbeat가 있으므로 DB 기준 유지
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

      // 스마트폰 Presence는 useAlerts가 관리하는 채널에서 감지됨
      // useAlerts에서 발생시키는 커스텀 이벤트를 수신하여 즉시 반영
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
      supabaseShared.removeChannel(channel);
      if (presenceChannel) supabaseShared.removeChannel(presenceChannel);
      if (phonePresenceHandler) window.removeEventListener("phone-presence-changed", phonePresenceHandler);
    };
  }, [fetchDevices, userId]);

  // Convert to compatible format for components
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
