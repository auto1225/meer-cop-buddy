import { useState, useEffect, useCallback } from "react";
import { supabaseShared } from "@/lib/supabase";

interface ActivityLogEntry {
  id: string;
  device_id: string;
  event_type: string;
  event_data: Record<string, unknown> | null;
  created_at: string;
  devices?: {
    device_name: string;
  };
}

export function useActivityLogs(deviceId?: string, limit = 50) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      
      let query = supabaseShared
        .from("activity_logs")
        .select("*, devices(device_name)")
        .order("created_at", { ascending: false })
        .limit(limit);
      
      // Filter by device if provided
      if (deviceId) {
        query = query.eq("device_id", deviceId);
      }

      const { data, error: fetchError } = await query;

      if (fetchError) throw fetchError;
      
      const typedData = (data || []).map((log) => ({
        ...log,
        event_data: log.event_data as Record<string, unknown> | null,
        devices: log.devices as { device_name: string } | undefined,
      }));
      
      setLogs(typedData);
      setError(null);
    } catch (err) {
      console.error("Error fetching activity logs:", err);
      setError("활동 로그를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, limit]);

  useEffect(() => {
    fetchLogs();

    // Subscribe to realtime updates
    const channel = supabaseShared
      .channel("activity-logs-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
        },
        (payload) => {
          const newLog = payload.new as ActivityLogEntry;
          // Only add if it matches our device filter
          if (!deviceId || newLog.device_id === deviceId) {
            setLogs((prev) => [newLog, ...prev].slice(0, limit));
          }
        }
      )
      .subscribe();

    return () => {
      supabaseShared.removeChannel(channel);
    };
  }, [fetchLogs, deviceId, limit]);

  return {
    logs,
    isLoading,
    error,
    refetch: fetchLogs,
  };
}
