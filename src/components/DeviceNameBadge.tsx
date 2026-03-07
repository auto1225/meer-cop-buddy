import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { getSavedAuth, updateSavedAuth } from "@/lib/serialAuth";
import { updateDeviceViaEdge, fetchDevicesViaEdge } from "@/lib/deviceApi";
import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { channelManager } from "@/lib/channelManager";
import { getSharedDeviceId, setSharedDeviceId } from "@/lib/sharedDeviceIdMap";
import { useToast } from "@/hooks/use-toast";
import { useTranslation } from "@/lib/i18n";

interface DeviceNameBadgeProps {
  deviceName: string;
  deviceId?: string;
  onNameChanged?: (newName: string) => void;
}

export function DeviceNameBadge({ deviceName, deviceId, onNameChanged }: DeviceNameBadgeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(deviceName);
  const [isSaving, setIsSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const { toast } = useToast();
  const { t } = useTranslation();

  useEffect(() => {
    setEditValue(deviceName);
  }, [deviceName]);

  useEffect(() => {
    if (isEditing) {
      inputRef.current?.focus();
      inputRef.current?.select();
    }
  }, [isEditing]);

  const resolveSharedDeviceId = async (
    localId: string,
    userId?: string,
    localCompositeId?: string,
    prevName?: string
  ): Promise<string> => {
    const mapped = getSharedDeviceId(localId);
    if (mapped) return mapped;
    if (!userId) return localId;

    try {
      const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-devices`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
        body: JSON.stringify({ user_id: userId }),
      });
      if (!res.ok) return localId;

      const data = await res.json();
      const sharedDevices = (data.devices || data || []) as Array<Record<string, any>>;
      const normalizedPrevName = (prevName || "").trim().toLowerCase();

      const byComposite = localCompositeId
        ? sharedDevices.find((d) => d?.device_id === localCompositeId)
        : undefined;

      const byPrevName = normalizedPrevName
        ? sharedDevices.find((d) => {
            const n = (d?.name || d?.device_name || "").toString().trim().toLowerCase();
            return n === normalizedPrevName;
          })
        : undefined;

      const laptops = sharedDevices.filter((d) => (d?.device_type || "").toString().toLowerCase() === "laptop");
      const bySingleLaptop = laptops.length === 1 ? laptops[0] : undefined;

      const resolved = byComposite?.id || byPrevName?.id || bySingleLaptop?.id;
      if (resolved) {
        setSharedDeviceId(localId, resolved);
        return resolved;
      }
    } catch (e) {
      console.warn("[DeviceNameBadge] Shared ID resolve error:", e);
    }

    return localId;
  };

  const syncSharedName = async (sharedId: string, newName: string): Promise<boolean> => {
    try {
      const r = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/update-device`, {
        method: "POST",
        headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
        body: JSON.stringify({ device_id: sharedId, name: newName }),
      });

      const payload = await r.json().catch(() => null);

      // 409 = duplicate name on shared DB — treat as non-fatal
      if (r.status === 409) {
        console.warn("[DeviceNameBadge] ⚠️ Shared DB duplicate name (409), ignoring:", payload);
        return true; // Don't block the user — local update succeeded
      }

      const updated = typeof payload?.updated === "number" ? payload.updated : undefined;
      const ok = r.ok && (updated === undefined || updated > 0 || !!payload?.device);

      if (ok) {
        console.log("[DeviceNameBadge] ✅ Shared DB name synced:", newName, "sharedId:", sharedId, "payload:", payload);
        return true;
      }

      console.warn("[DeviceNameBadge] ⚠️ Shared DB name sync failed:", payload);
      return false;
    } catch (e) {
      console.warn("[DeviceNameBadge] ⚠️ Shared DB sync error:", e);
      return false;
    }
  };

  const sendNameChangedBroadcast = async (
    userId: string,
    payload: {
      target_device_id: string;
      target_shared_device_id: string;
      serial_key: string;
      old_name: string;
      new_name: string;
      timestamp: string;
    }
  ): Promise<void> => {
    // ★ 2개 채널로 동시 전송: commands + presence (스마트폰이 어느 쪽이든 수신 가능)
    const channels = [
      `user-commands-${userId}`,
      `user-presence-${userId}`,
    ];

    const sendOnChannel = async (channelName: string) => {
      const ch = channelManager.get(channelName) ?? channelManager.getOrCreate(channelName);

      const sendBothFormats = async () => {
        await Promise.allSettled([
          ch.send({ type: "broadcast", event: "name_changed", payload }),
          ch.send({
            type: "broadcast",
            event: "command",
            payload: { type: "name_changed", ...payload },
          }),
        ]);
      };

      const state = (ch as unknown as { state?: string }).state;
      if (state === "joined") {
        await sendBothFormats();
        return;
      }

      await new Promise<void>((resolve) => {
        const timeout = setTimeout(() => {
          console.warn(`[DeviceNameBadge] ⚠️ ${channelName} subscribe timeout`);
          resolve();
        }, 2000);

        ch.subscribe((status) => {
          if (status === "SUBSCRIBED") {
            clearTimeout(timeout);
            sendBothFormats()
              .catch((e) => console.warn(`[DeviceNameBadge] ${channelName} send failed:`, e))
              .finally(() => resolve());
            return;
          }
          if (status === "CHANNEL_ERROR" || status === "TIMED_OUT" || status === "CLOSED") {
            clearTimeout(timeout);
            console.warn(`[DeviceNameBadge] ⚠️ ${channelName} subscribe failed:`, status);
            resolve();
          }
        });
      });
    };

    // 모든 채널에 병렬 전송
    await Promise.allSettled(channels.map(sendOnChannel));
    console.log("[DeviceNameBadge] ✅ name_changed broadcast sent on", channels.join(", "));
  };

  const handleSave = async () => {
    const trimmed = editValue.trim();
    if (!trimmed) return;
    if (trimmed === deviceName) {
      setIsEditing(false);
      return;
    }

    setIsSaving(true);
    try {
      const saved = getSavedAuth();

      // 다중 기기 환경에서 이름 충돌 방지: 현재 기기 제외, 동일 사용자 내 모든 기기 검사
      if (saved?.user_id && deviceId) {
        const normalized = trimmed.toLowerCase();
        const allDevices = await fetchDevicesViaEdge(saved.user_id);

        const duplicate = allDevices.find((d) => {
          const did = d.id || d.device_id;
          const isSameDevice = !!did && did === deviceId;
          if (isSameDevice) return false;

          // 스마트폰 기본 이름은 제외 (My Smartphone 등)
          const candidate = (d.name || d.device_name || "").toString().trim().toLowerCase();
          if (!candidate || candidate === "my smartphone") return false;

          return candidate === normalized;
        });

        if (duplicate) {
          toast({ title: t("device.duplicateName"), description: t("device.duplicateDesc"), variant: "destructive" });
          setIsSaving(false);
          return;
        }
      }

      if (deviceId) {
        // ✅ 현재 노트북 1대만 이름 변경 (다른 기기는 절대 덮어쓰지 않음)
        try {
          await updateDeviceViaEdge(deviceId, { name: trimmed });
        } catch (updateErr: any) {
          const msg = String(updateErr?.message || "");
          // 중복 이름 에러는 비치명적 — 사용자에게 안내만 하고 진행
          if (msg.includes("DUPLICATE") || msg.includes("이미 사용 중") || msg.includes("duplicate")) {
            console.warn("[DeviceNameBadge] ⚠️ Duplicate name error ignored:", msg);
            toast({ title: t("device.duplicateName"), description: t("device.duplicateDesc"), variant: "destructive" });
            setIsSaving(false);
            return;
          }
          throw updateErr; // 다른 에러는 상위 catch로 전달
        }

        // 공유 DB의 동일 기기(매핑된 sharedId)만 동기화
        const sharedId = await resolveSharedDeviceId(
          deviceId,
          saved?.user_id,
          saved?.device_id,
          deviceName
        );

        const sharedOk = await syncSharedName(sharedId, trimmed);

        // 실시간 브로드캐스트: 대상 기기 식별자 포함 (스마트폰에서 다중 노트북 구분 가능)
        if (saved?.user_id) {
          await sendNameChangedBroadcast(saved.user_id, {
            target_device_id: deviceId,
            target_shared_device_id: sharedId,
            serial_key: saved.serial_key || "",
            old_name: deviceName,
            new_name: trimmed,
            timestamp: new Date().toISOString(),
          });
        }

        if (!sharedOk) {
          toast({
            title: t("device.nameChanged"),
            description: "공유 동기화가 지연되고 있어요. 잠시 후 다시 시도해주세요.",
          });
        }
      }

      // sessionStorage + localStorage 양쪽에 이름 동기화 (이전 이름 완전 삭제)
      updateSavedAuth({ device_name: trimmed });
      // localStorage에 남아있을 수 있는 이전 이름 흔적 제거
      try {
        const oldKey = `meercop-device-name-${deviceId}`;
        localStorage.removeItem(oldKey);
        localStorage.setItem(oldKey, trimmed);
      } catch {}

      onNameChanged?.(trimmed);
      setIsEditing(false);
      toast({ title: t("device.nameChanged"), description: t("device.nameChangedDesc") });
    } catch (err: any) {
      toast({ title: t("device.changeFailed"), description: err.message || t("device.changeFailedDesc"), variant: "destructive" });
    } finally {
      setIsSaving(false);
    }
  };

  useEffect(() => {
    if (!deviceId || isEditing || isSaving) return;

    let cancelled = false;

    (async () => {
      const saved = getSavedAuth();
      if (!saved?.user_id) return;

      const sharedId = await resolveSharedDeviceId(deviceId, saved.user_id, saved.device_id, deviceName);
      if (cancelled) return;

      try {
        const res = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/get-devices`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
          body: JSON.stringify({ user_id: saved.user_id }),
        });
        if (!res.ok) return;

        const data = await res.json();
        const sharedDevices = (data.devices || data || []) as Array<Record<string, any>>;
        const target = sharedDevices.find((d) => d?.id === sharedId);
        const sharedName = (target?.name || target?.device_name || "").toString().trim();
        const desiredName = deviceName.trim();

        if (!cancelled && desiredName && sharedName !== desiredName) {
          await syncSharedName(sharedId, desiredName);
        }
      } catch (e) {
        console.warn("[DeviceNameBadge] Shared reconcile error:", e);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [deviceId, deviceName, isEditing, isSaving]);

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") handleSave();
    if (e.key === "Escape") {
      setEditValue(deviceName);
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <div className="flex justify-center py-1 mt-4">
        <div className="flex items-center gap-1 backdrop-blur-xl bg-white/15 border border-white/25 px-2 py-1 rounded-full shadow-lg">
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="w-[100px] bg-transparent text-white font-extrabold text-[11px] outline-none text-center drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]"
            maxLength={30}
          />
          <button onClick={handleSave} disabled={isSaving} className="p-0.5 rounded hover:bg-white/20 transition-colors text-green-600">
            <Check className="h-3 w-3" />
          </button>
          <button onClick={() => { setEditValue(deviceName); setIsEditing(false); }} disabled={isSaving} className="p-0.5 rounded hover:bg-white/20 transition-colors text-destructive">
            <X className="h-3 w-3" />
          </button>
        </div>
      </div>
    );
  }

  const isDefaultName = !deviceName || /^(Laptop\d*|My Laptop|Unknown)$/i.test(deviceName.trim());

  return (
    <div className="flex flex-col items-center py-1 mt-4 gap-1">
      <button
        onClick={() => setIsEditing(true)}
        className={`flex items-center gap-1.5 backdrop-blur-xl border hover:bg-white/25 transition-colors px-3 py-1.5 rounded-full shadow-lg ${
          isDefaultName
            ? "bg-amber-500/20 border-amber-400/40 animate-pulse"
            : "bg-white/15 border-white/25"
        }`}
      >
        <span className="text-white font-extrabold text-[11px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{deviceName}</span>
        <Pencil className="h-3 w-3 text-white/70" />
      </button>
      {isDefaultName && (
        <p className="text-[10px] text-amber-300/90 font-semibold text-center px-4 animate-fade-in">
          {t("device.nameRequired")}
        </p>
      )}
    </div>
  );
}
