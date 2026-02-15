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
  // Track the latest alert timestamp to ignore stale dismissals
  const lastAlertTimeRef = useRef<string | null>(null);
  const lastProcessedDismissalRef = useRef<string | null>(null);

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

      // Record alert creation time to prevent stale dismissals
      lastAlertTimeRef.current = newAlert.created_at;
      setActiveAlert(newAlert);
      setAlerts((prev) => [newAlert, ...prev]);

      // Presence 채널로 스마트폰에 알림 전송
      broadcastAlert(newAlert);

      // 푸시 알림 전송 (공유 프로젝트의 Edge Function — 실패 시 무시)
      supabaseShared.functions.invoke('push-notifications', {
        body: {
          action: 'send',
          device_id: deviceId,
          title: '🚨 경보 발생!',
          body: eventData?.message || `${eventType} 감지`,
        },
      }).then(({ error }) => {
        if (error) console.warn("[Alerts] Push notification unavailable (shared project):", error.message ?? error);
      }).catch(() => {
        // Edge function not deployed on shared project — silently ignore
      });

      // Play alert sound
      try {
        const audio = new Audio("/alert-sound.mp3");
        audio.play().catch(() => {});
      } catch {
        // Audio not available
      }
    },
    [deviceId, broadcastAlert]
  );

  // Stop active alert
  const stopAlert = useCallback(async () => {
    if (!activeAlert || !deviceId) return;

    // 로컬에 경보 해제 기록
    addActivityLog(deviceId, "alert_stopped", {
      original_alert_id: activeAlert.id,
      stopped_by: "web_app",
    });

    setActiveAlert(null);

    // Presence 상태에서 active_alert를 null로 명시적 갱신
    // → 스마트폰 재접속 시 stale alert 수신 방지
    if (channelRef.current) {
      try {
        await channelRef.current.track({
          role: "laptop",
          active_alert: null,
          status: "listening",
          last_seen_at: new Date().toISOString(),
        });
        console.log("[Alerts] ✅ Presence cleared: active_alert = null");
      } catch (error) {
        console.error("[Alerts] Failed to clear Presence:", error);
      }
    }

    toast({
      title: "경보 해제",
      description: "경보가 성공적으로 해제되었습니다.",
    });
  }, [activeAlert, deviceId, toast]);

  // 채널 설정 (broadcast + presence, 모든 리스너는 subscribe 전에 등록)
  useEffect(() => {
    if (!deviceId) return;

    console.log(`[Alerts] 🔗 Setting up channel for device: ${deviceId}`);

    // 기존 동일 이름 채널 정리
    const existingChannels = supabaseShared.getChannels();
    const existing = existingChannels.find(
      ch => ch.topic === `realtime:device-alerts-${deviceId}`
    );
    if (existing) {
      console.log("[Alerts] Removing existing channel before re-subscribe");
      supabaseShared.removeChannel(existing);
    }

    const channel = supabaseShared.channel(`device-alerts-${deviceId}`, {
      config: { presence: { key: deviceId } },
    });

    // ⚠️ 모든 리스너를 .subscribe() 전에 등록
    channel
      // 1. Broadcast: 스마트폰이 channel.send()로 보낸 remote_alarm_off
      .on("broadcast", { event: "remote_alarm_off" }, (payload) => {
        console.log("[Alerts] 📢 remote_alarm_off broadcast received:", payload);
        setDismissedBySmartphone(true);
        setActiveAlert(null);
        setTimeout(() => setDismissedBySmartphone(false), 500);
      })
      // 2. Presence: 하위 호환 (track 방식)
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        // 로그 노이즈 감소: 비어있으면 무시
        if (Object.keys(state).length > 0) {
          console.log("[Alerts] Presence sync:", state);
        }

        for (const key of Object.keys(state)) {
          const entries = state[key] as Array<{
            active_alert?: unknown;
            dismissed_at?: string;
            remote_alarm_off?: boolean;
          }>;
          for (const entry of entries) {
            if (entry.remote_alarm_off === true && entry.dismissed_at) {
              // Validate timestamp: only accept if dismissed AFTER the current alert
              const alertTime = lastAlertTimeRef.current;
              if (alertTime && new Date(entry.dismissed_at) <= new Date(alertTime)) {
                continue; // Stale dismissal — ignore
              }
              if (lastProcessedDismissalRef.current === entry.dismissed_at) {
                continue; // Already processed
              }
              lastProcessedDismissalRef.current = entry.dismissed_at;
              console.log("[Alerts] 📢 remote_alarm_off via Presence at:", entry.dismissed_at);
              setDismissedBySmartphone(true);
              setActiveAlert(null);
              setTimeout(() => setDismissedBySmartphone(false), 500);
            } else if (entry.active_alert === null && entry.dismissed_at && !entry.remote_alarm_off) {
              // Only accept dismissals NEWER than the current alert
              const alertTime = lastAlertTimeRef.current;
              if (alertTime && new Date(entry.dismissed_at) <= new Date(alertTime)) {
                // Stale dismissal — ignore
                continue;
              }
              // Prevent re-processing the same dismissal
              if (lastProcessedDismissalRef.current === entry.dismissed_at) {
                continue;
              }
              lastProcessedDismissalRef.current = entry.dismissed_at;
              console.log("[Alerts] ✅ Smartphone dismissed via Presence at:", entry.dismissed_at);
              setActiveAlert(null);
              setDismissedBySmartphone(true);
              setTimeout(() => setDismissedBySmartphone(false), 500);
            }
          }
        }
      })
      // 3. Subscribe 후 track
      .subscribe(async (status) => {
        console.log(`[Alerts] Channel status: ${status}`);
        if (status === "SUBSCRIBED") {
          channelRef.current = channel;
          console.log("[Alerts] ✅ Channel subscribed — broadcast + presence ready");
          await channel.track({
            status: "listening",
            updated_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      console.log("[Alerts] Cleaning up channel");
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

        // 푸시 알림 전송 (공유 프로젝트의 Edge Function — 실패 시 무시)
        supabaseShared.functions.invoke('push-notifications', {
          body: {
            action: 'send',
            device_id: newAlert.device_id,
            title: '🚨 경보 발생!',
            body: newAlert.event_data?.message || `${newAlert.event_type} 감지`,
          },
        }).then(({ error }) => {
          if (error) console.warn("[Alerts] Push notification unavailable:", error.message ?? error);
        }).catch(() => {
          // silently ignore
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
