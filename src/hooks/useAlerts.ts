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

export function useAlerts(deviceId?: string, userId?: string) {
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

  // Presence 채널로 알림 전송 + Broadcast active_alert 이벤트 (스마트폰 앱이 수신)
  const broadcastAlert = useCallback(async (alert: Alert | null) => {
    if (!channelRef.current) return;

    try {
      // 7-2: Presence track with status: 'alert' or 'online'
      // Preserve existing Presence fields (camera, network) to avoid overwriting useDeviceStatus state
      const existingState = channelRef.current.presenceState();
      const myPresences = existingState[deviceIdRef.current || ""] as Record<string, unknown>[] | undefined;
      const prev = myPresences?.[0] || {};

      await channelRef.current.track({
        ...prev,
        device_id: deviceIdRef.current,
        active_alert: alert ? {
          id: alert.id,
          type: alert.event_type,
          title: alert.event_data?.alert_type || alert.event_type,
          message: alert.event_data?.message || null,
          created_at: alert.created_at,
        } : null,
        status: alert ? 'alert' : 'online',
        updated_at: new Date().toISOString(),
      });

      // 1-2: Also send broadcast active_alert event for immediate detection
      if (alert) {
        await channelRef.current.send({
          type: "broadcast",
          event: "active_alert",
          payload: {
            device_id: deviceIdRef.current,
            active_alert: {
              id: alert.id,
              type: alert.event_type,
              title: alert.event_data?.alert_type || alert.event_type,
              message: alert.event_data?.message || null,
              created_at: alert.created_at,
            },
          },
        });
      }

      console.log("[Alerts] Broadcasted alert via Presence + Broadcast:", alert?.event_type || "cleared");
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

      // 푸시 알림은 Presence 채널을 통해 전달되므로 별도 Edge Function 호출 불필요

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

    // 7-3: Presence 상태에서 active_alert: null, status: 'online'으로 재track
    if (channelRef.current) {
      try {
        const existingState = channelRef.current.presenceState();
        const myPresences = existingState[deviceId] as Record<string, unknown>[] | undefined;
        const prev = myPresences?.[0] || {};
        await channelRef.current.track({
          ...prev,
          device_id: deviceId,
          active_alert: null,
          status: "online",
          last_seen_at: new Date().toISOString(),
        });
        console.log("[Alerts] ✅ Presence cleared: active_alert = null, status = online");
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

    const channelKey = userId || deviceId;
    console.log(`[Alerts] 🔗 Setting up channel for user: ${channelKey}, device: ${deviceId}`);

    // 기존 동일 이름 채널 정리
    const existingChannels = supabaseShared.getChannels();
    const existing = existingChannels.find(
      ch => ch.topic === `realtime:user-alerts-${channelKey}`
    );
    if (existing) {
      console.log("[Alerts] Removing existing channel before re-subscribe");
      supabaseShared.removeChannel(existing);
    }

    const channel = supabaseShared.channel(`user-alerts-${channelKey}`, {
      config: { presence: { key: deviceId } },
    });

    // ⚠️ 모든 리스너를 .subscribe() 전에 등록
    channel
      // 1. Broadcast: 스마트폰이 channel.send()로 보낸 remote_alarm_off
      .on("broadcast", { event: "remote_alarm_off" }, (payload) => {
        console.log("[Alerts] 📢 remote_alarm_off broadcast received:", payload);
        // 통합 채널: 자기 기기 대상인 경우만 해제
        const targetDeviceId = payload?.payload?.device_id;
        if (targetDeviceId && targetDeviceId !== deviceIdRef.current) {
          console.log("[Alerts] ⏭️ remote_alarm_off for different device:", targetDeviceId);
          return;
        }
        setDismissedBySmartphone(true);
        setActiveAlert(null);
        setTimeout(() => setDismissedBySmartphone(false), 500);
      })
      // 2. Presence: 하위 호환 (track 방식)
      .on("presence", { event: "sync" }, () => {
        const state = channel.presenceState();
        
        // 스마트폰 Presence 감지 → useDevices에 커스텀 이벤트로 전달
        const hasPhone = Object.values(state).some((presences) =>
          (presences as Record<string, unknown>[]).some((p) => p.role === "phone")
        );
        window.dispatchEvent(new CustomEvent("phone-presence-changed", { detail: { online: hasPhone } }));
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
          const existingState = channel.presenceState();
          const myPresences = existingState[deviceId] as Record<string, unknown>[] | undefined;
          const prev = myPresences?.[0] || {};
          await channel.track({
            ...prev,
            device_id: deviceId,
            active_alert: null,
            status: "online",
            is_camera_connected: prev.is_camera_connected ?? false,
            is_network_connected: prev.is_network_connected ?? navigator.onLine,
            updated_at: new Date().toISOString(),
          });
        }
      });

    return () => {
      console.log("[Alerts] Cleaning up channel");
      supabaseShared.removeChannel(channel);
      channelRef.current = null;
    };
  }, [deviceId, userId]);

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

        // 푸시 알림은 Presence 채널을 통해 전달되므로 별도 Edge Function 호출 불필요

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
