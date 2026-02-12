import { useState, useEffect, useCallback, useRef } from "react";
import { supabaseShared } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { RealtimeChannel } from "@supabase/supabase-js";
import {
  getAlertLogs,
  addActivityLog,
  LocalActivityLog,
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
  const [dismissedBySmartphone, setDismissedBySmartphone] = useState(false);
  const { toast } = useToast();

  const channelRef = useRef<RealtimeChannel | null>(null);
  const deviceIdRef = useRef(deviceId);
  deviceIdRef.current = deviceId;

  // Presence 채널로 알림 전송 (스마트폰 앱이 수신)
  const broadcastAlert = useCallback(async (alert: Alert | null) => {
    if (!channelRef.current) return;

    try {
      await channelRef.current.track({
        active_alert: alert,
        updated_at: new Date().toISOString(),
      });
      console.log("[Alerts] Broadcasted alert via Presence:", alert?.event_type || "cleared");
    } catch (error) {
      console.error("[Alerts] Failed to broadcast alert:", error);
    }
  }, []);

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

  // Trigger a new alert (로컬 저장 + Presence 전송)
  const triggerAlert = useCallback(
    (eventType: string, eventData?: Record<string, unknown>) => {
      if (!deviceId) return;

      const newLog = addActivityLog(deviceId, eventType, eventData);
      const newAlert = newLog as Alert;

      setActiveAlert(newAlert);
      setAlerts((prev) => [newAlert, ...prev]);

      // Presence 채널로 스마트폰에 알림 전송
      broadcastAlert(newAlert);

      // Play alert sound
      try {
        const audio = new Audio("/alert-sound.mp3");
        audio.play().catch(() => {
          // Audio play failed, likely due to autoplay policy
        });
      } catch {
        // Audio not available
      }
    },
    [deviceId, broadcastAlert]
  );

  // Stop active alert
  const stopAlert = useCallback(() => {
    if (!activeAlert || !deviceId) return;

    // 로컬에 경보 해제 기록
    addActivityLog(deviceId, "alert_stopped", {
      original_alert_id: activeAlert.id,
      stopped_by: "web_app",
    });

    setActiveAlert(null);

    // Presence 채널로 알림 해제 전송
    broadcastAlert(null);

    toast({
      title: "경보 해제",
      description: "경보가 성공적으로 해제되었습니다.",
    });
  }, [activeAlert, deviceId, toast, broadcastAlert]);

  // Presence 채널 설정 (알림 브로드캐스트 + 스마트폰 해제 수신)
  useEffect(() => {
    if (!deviceId) return;

    const channel = supabaseShared.channel(`device-alerts-${deviceId}`, {
      config: { presence: { key: deviceId } },
    });

    channel
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        console.log("[Alerts] Presence sync:", state);

        // 스마트폰에서 경보 해제 메시지 감지
        const entries = state[deviceId] as Array<{ active_alert?: unknown; dismissed_at?: string }> | undefined;
        if (entries) {
          const dismissed = entries.find(e => e.active_alert === null && e.dismissed_at);
          if (dismissed) {
            console.log("[Alerts] Smartphone dismissed alarm at:", dismissed.dismissed_at);
            setActiveAlert(null);
            setDismissedBySmartphone(true);
            // Reset flag after a short delay
            setTimeout(() => setDismissedBySmartphone(false), 500);
          }
        }
      })
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          console.log("[Alerts] Presence channel subscribed");
        }
      });

    return () => {
      supabaseShared.removeChannel(channel);
      channelRef.current = null;
    };
  }, [deviceId]);

  // 다른 컴포넌트에서 추가된 알림 감지
  useEffect(() => {
    if (!deviceId) return;

    fetchAlerts();

    const handleLogAdded = (event: CustomEvent<LocalActivityLog>) => {
      const newLog = event.detail;
      const alertTypes = [
        "alert_shock",
        "alert_mouse",
        "alert_keyboard",
        "alert_movement",
        "alert_camera_motion",
        "alert_lid",
        "alert_power",
      ];

      if (
        newLog.device_id === deviceId &&
        alertTypes.includes(newLog.event_type)
      ) {
        const newAlert = newLog as Alert;
        setActiveAlert(newAlert);
        setAlerts((prev) => {
          if (prev.some((a) => a.id === newAlert.id)) return prev;
          return [newAlert, ...prev];
        });

        // Presence 채널로 스마트폰에 알림 전송
        broadcastAlert(newAlert);

        // Play alert sound
        try {
          const audio = new Audio("/alert-sound.mp3");
          audio.play().catch(() => {});
        } catch {
          // Audio not available
        }
      }
    };

    window.addEventListener(
      "activity-log-added",
      handleLogAdded as EventListener
    );

    return () => {
      window.removeEventListener(
        "activity-log-added",
        handleLogAdded as EventListener
      );
    };
  }, [deviceId, fetchAlerts, broadcastAlert]);

  return {
    alerts,
    activeAlert,
    isLoading,
    dismissedBySmartphone,
    stopAlert,
    fetchAlerts,
    triggerAlert,
  };
}
