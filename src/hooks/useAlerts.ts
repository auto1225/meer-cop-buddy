import { useState, useEffect, useCallback } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";

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

  // Fetch recent alerts
  const fetchAlerts = useCallback(async () => {
    if (!deviceId) return;

    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("activity_logs")
        .select("*")
        .eq("device_id", deviceId)
        .in("event_type", ["alert_shock", "alert_mouse", "alert_keyboard", "alert_movement"])
        .order("created_at", { ascending: false })
        .limit(50);

      if (error) throw error;
      setAlerts((data || []) as Alert[]);
    } catch (error) {
      console.error("Error fetching alerts:", error);
    } finally {
      setIsLoading(false);
    }
  }, [deviceId]);

  // Stop active alert
  const stopAlert = useCallback(async () => {
    if (!activeAlert || !deviceId) return;

    try {
      await supabase.from("activity_logs").insert({
        device_id: deviceId,
        event_type: "alert_stopped",
        event_data: { 
          original_alert_id: activeAlert.id,
          stopped_by: "web_app" 
        },
      });

      setActiveAlert(null);
      
      toast({
        title: "경보 해제",
        description: "경보가 성공적으로 해제되었습니다.",
      });
    } catch (error) {
      console.error("Error stopping alert:", error);
      toast({
        title: "오류",
        description: "경보 해제에 실패했습니다.",
        variant: "destructive",
      });
    }
  }, [activeAlert, deviceId, toast]);

  // Subscribe to realtime alerts
  useEffect(() => {
    if (!deviceId) return;

    fetchAlerts();

    const channel = supabase
      .channel("alerts-changes")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "activity_logs",
          filter: `device_id=eq.${deviceId}`,
        },
        (payload) => {
          const newLog = payload.new as Alert;
          const alertTypes = ["alert_shock", "alert_mouse", "alert_keyboard", "alert_movement"];
          
          if (alertTypes.includes(newLog.event_type)) {
            setActiveAlert(newLog);
            setAlerts((prev) => [newLog, ...prev]);
            
            // Play alert sound
            try {
              const audio = new Audio("/alert-sound.mp3");
              audio.play().catch(() => {
                // Audio play failed, likely due to autoplay policy
              });
            } catch {
              // Audio not available
            }
          }
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [deviceId, fetchAlerts]);

  return {
    alerts,
    activeAlert,
    isLoading,
    stopAlert,
    fetchAlerts,
  };
}
