import { useState, useEffect, useCallback } from "react";
import { supabaseShared } from "@/lib/supabase";
// Using shared Supabase client (same as MeerCOP mobile app)

// Shared DB schema (sltxwkdvaapyeosikegj.supabase.co)
interface Device {
  id: string;
  device_id: string;
  device_name: string;  // Correct column name
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
    device_id: d.device_id,
    device_name: d.device_name,
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

  const fetchDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      let query = supabaseShared
        .from("devices")
        .select("*")
        .order("updated_at", { ascending: false });

      // 사용자별 기기만 필터링 (공유 DB에서 다른 사용자 기기 제외)
      if (userId) {
        query = query.eq("user_id", userId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      setDevices((data || []) as Device[]);
      setError(null);
    } catch (err) {
      console.error("Error fetching devices:", err);
      setError("디바이스 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [userId]);

  useEffect(() => {
    let isMounted = true;
    let pollTimeoutId: ReturnType<typeof setTimeout> | null = null;
    let pollInterval = 5000;
    let realtimeWorking = false;

    fetchDevices();

    // Always-on polling fallback for device status (especially smartphone)
    const schedulePoll = () => {
      if (!isMounted) return;
      pollTimeoutId = setTimeout(async () => {
        await fetchDevices();
        if (realtimeWorking) {
          pollInterval = Math.min(pollInterval * 1.5, 30000);
        } else {
          pollInterval = Math.min(pollInterval * 1.2, 10000);
        }
        schedulePoll();
      }, pollInterval);
    };
    schedulePoll();

    const channelName = userId 
      ? `devices-changes-${userId}` 
      : "devices-changes";

    // Subscribe to realtime updates
    const channel = supabaseShared
      .channel(channelName)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
          ...(userId ? { filter: `user_id=eq.${userId}` } : {}),
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

    return () => {
      isMounted = false;
      if (pollTimeoutId) clearTimeout(pollTimeoutId);
      supabaseShared.removeChannel(channel);
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
