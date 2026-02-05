import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
// Using Lovable Cloud Supabase client

interface Device {
  id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  status: string;
  last_seen_at: string | null;
  battery_level: number | null;
  is_charging: boolean;
  ip_address: string | null;
  os_info: string | null;
  app_version: string | null;
  metadata: Record<string, unknown> | null;
}

export function useDevices() {
  const [devices, setDevices] = useState<Device[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchDevices = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("devices")
        .select("*")
        .order("last_seen_at", { ascending: false, nullsFirst: false });

      if (fetchError) throw fetchError;
      const typedDevices = (data || []).map((d) => ({
        ...d,
        metadata: d.metadata as Record<string, unknown> | null,
      }));
      setDevices(typedDevices);
      setError(null);
    } catch (err) {
      console.error("Error fetching devices:", err);
      setError("디바이스 목록을 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDevices();

    // Subscribe to realtime updates
    const channel = supabase
      .channel("devices-changes")
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "devices",
        },
        (payload) => {
          console.log("Device update:", payload);
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
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [fetchDevices]);

  const stats = {
    total: devices.length,
    online: devices.filter((d) => d.status === "online").length,
    offline: devices.filter((d) => d.status === "offline").length,
    lowBattery: devices.filter(
      (d) => d.battery_level !== null && d.battery_level < 20
    ).length,
  };

  return {
    devices,
    isLoading,
    error,
    refetch: fetchDevices,
    stats,
  };
}
