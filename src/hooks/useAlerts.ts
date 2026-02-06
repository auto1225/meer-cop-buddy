import { useState, useEffect, useCallback } from "react";
import { useToast } from "@/hooks/use-toast";
import { 
  getAlertLogs, 
  addActivityLog,
  LocalActivityLog 
} from "@/lib/localActivityLogs";

export interface Alert {
  id: string;
  device_id: string;
  event_type: string;
  event_data: {
    alert_type?: string;
    message?: string;
    images?: string[];
    triggered_by?: string;
  } | null;
  created_at: string;
}

export function useAlerts(deviceId?: string) {
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [activeAlert, setActiveAlert] = useState<Alert | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();

  // Fetch recent alerts from localStorage
  const fetchAlerts = useCallback(() => {
    if (!deviceId) return;

    setIsLoading(true);
    try {
      const localAlerts = getAlertLogs(deviceId, 50);
      setAlerts(localAlerts as Alert[]);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  // Trigger a new alert (로컬 저장)
  const triggerAlert = useCallback((
    eventType: string,
    eventData?: Record<string, unknown>
  ) => {
    if (!deviceId) return;

    const newLog = addActivityLog(deviceId, eventType, eventData);
    const newAlert = newLog as Alert;
    
    setActiveAlert(newAlert);
    setAlerts((prev) => [newAlert, ...prev]);

    // Play alert sound
    try {
      const audio = new Audio("/alert-sound.mp3");
      audio.play().catch(() => {
        // Audio play failed, likely due to autoplay policy
      });
    } catch {
      // Audio not available
    }
  }, [deviceId]);

  // Stop active alert
  const stopAlert = useCallback(() => {
    if (!activeAlert || !deviceId) return;

    // 로컬에 경보 해제 기록
    addActivityLog(deviceId, "alert_stopped", {
      original_alert_id: activeAlert.id,
      stopped_by: "web_app",
    });

    setActiveAlert(null);

    toast({
      title: "경보 해제",
      description: "경보가 성공적으로 해제되었습니다.",
    });
  }, [activeAlert, deviceId, toast]);

  // 다른 컴포넌트에서 추가된 알림 감지
  useEffect(() => {
    if (!deviceId) return;

    fetchAlerts();

    const handleLogAdded = (event: CustomEvent<LocalActivityLog>) => {
      const newLog = event.detail;
      const alertTypes = ["alert_shock", "alert_mouse", "alert_keyboard", "alert_movement"];

      if (newLog.device_id === deviceId && alertTypes.includes(newLog.event_type)) {
        const newAlert = newLog as Alert;
        setActiveAlert(newAlert);
        setAlerts((prev) => {
          if (prev.some((a) => a.id === newAlert.id)) return prev;
          return [newAlert, ...prev];
        });

        // Play alert sound
        try {
          const audio = new Audio("/alert-sound.mp3");
          audio.play().catch(() => {});
        } catch {
          // Audio not available
        }
      }
    };

    window.addEventListener("activity-log-added", handleLogAdded as EventListener);

    return () => {
      window.removeEventListener("activity-log-added", handleLogAdded as EventListener);
    };
  }, [deviceId, fetchAlerts]);

  return {
    alerts,
    activeAlert,
    isLoading,
    stopAlert,
    fetchAlerts,
    triggerAlert,
  };
}
