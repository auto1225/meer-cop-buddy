import { useState, useEffect, useCallback } from "react";
import { 
  getActivityLogs, 
  addActivityLog as addLog,
  LocalActivityLog 
} from "@/lib/localActivityLogs";

export type ActivityLogEntry = LocalActivityLog;

export function useActivityLogs(deviceId?: string, limit = 50) {
  const [logs, setLogs] = useState<ActivityLogEntry[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchLogs = useCallback(() => {
    try {
      setIsLoading(true);
      const localLogs = getActivityLogs(deviceId, limit);
      setLogs(localLogs);
      setError(null);
    } catch (err) {
      console.error("Error fetching activity logs:", err);
      setError("활동 로그를 불러오는데 실패했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [deviceId, limit]);

  // 로그 추가 함수
  const addActivityLog = useCallback((
    eventType: string,
    eventData?: Record<string, unknown>,
    deviceName?: string
  ) => {
    if (!deviceId) return;
    
    const newLog = addLog(deviceId, eventType, eventData, deviceName);
    setLogs((prev) => [newLog, ...prev].slice(0, limit));
  }, [deviceId, limit]);

  useEffect(() => {
    fetchLogs();

    // 다른 컴포넌트에서 추가된 로그 감지
    const handleLogAdded = (event: CustomEvent<LocalActivityLog>) => {
      const newLog = event.detail;
      if (!deviceId || newLog.device_id === deviceId) {
        setLogs((prev) => {
          // 중복 방지
          if (prev.some(log => log.id === newLog.id)) return prev;
          return [newLog, ...prev].slice(0, limit);
        });
      }
    };

    window.addEventListener("activity-log-added", handleLogAdded as EventListener);

    return () => {
      window.removeEventListener("activity-log-added", handleLogAdded as EventListener);
    };
  }, [fetchLogs, deviceId, limit]);

  return {
    logs,
    isLoading,
    error,
    refetch: fetchLogs,
    addActivityLog,
  };
}
