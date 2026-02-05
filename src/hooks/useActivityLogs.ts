import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";

interface ActivityLogEntry {
  id: string;
  device_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: string;
  devices?: {
    device_name: string;
  };
}

export function useActivityLogs(limit = 50) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(async () => {
    try {
      setIsLoading(true);
      const { data, error: fetchError } = await supabase
        .from("activity_logs")
        .select("*, devices(device_name)")
        .order("created_at", { ascending: false })
        .limit(limit);

      if (fetchError) throw fetchError;
      
      const typedData = (data || []).map((log) => ({
        ...log,
        event_data: log.event_data as Record<string, unknown>,
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
  }, [limit]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  return {
    logs,
    isLoading,
    error,
    refetch: fetchLogs,
  };
}
