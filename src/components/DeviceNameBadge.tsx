import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { getSavedAuth } from "@/lib/serialAuth";
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
    const r = await fetch(`${SHARED_SUPABASE_URL}/functions/v1/update-device`, {
      method: "POST",
      headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
      body: JSON.stringify({ device_id: sharedId, name: newName }),
    });

    const payload = await r.json().catch(() => null);
    const updated = typeof payload?.updated === "number" ? payload.updated : undefined;
    const ok = r.ok && (updated === undefined || updated > 0 || !!payload?.device);

    if (ok) {
      console.log("[DeviceNameBadge] ✅ Shared DB name synced:", newName, "sharedId:", sharedId, "payload:", payload);
      return true;
    }

    console.warn("[DeviceNameBadge] ⚠️ Shared DB name sync failed:", payload);
    return false;
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

      // 다중 노트북 환경에서 이름 충돌 방지: 현재 기기 제외 + 컴퓨터 계열만 검사
      if (saved?.user_id && deviceId) {
        const normalized = trimmed.toLowerCase();
        const allDevices = await fetchDevicesViaEdge(saved.user_id);

        const duplicate = allDevices.find((d) => {
          const did = d.id || d.device_id;
          const isSameDevice = !!did && did === deviceId;
          if (isSameDevice) return false;

          const type = (d.device_type || "").toString().toLowerCase();
          const isComputer = ["laptop", "desktop", "notebook"].includes(type);
          if (!isComputer) return false;

          const candidate = (d.name || d.device_name || "").toString().trim().toLowerCase();
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
        await updateDeviceViaEdge(deviceId, { name: trimmed });

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
          const cmdChannel = channelManager.get(`user-commands-${saved.user_id}`);
          if (cmdChannel) {
            cmdChannel.send({
              type: "broadcast",
              event: "command",
              payload: {
                type: "name_changed",
                target_device_id: deviceId,
                target_shared_device_id: sharedId,
                old_name: deviceName,
                new_name: trimmed,
                timestamp: new Date().toISOString(),
              },
            }).catch(() => {});
          } else {
            console.warn("[DeviceNameBadge] ⚠️ user-commands channel not found, name_changed broadcast skipped");
          }
        }

        if (!sharedOk) {
          toast({
            title: t("device.nameChanged"),
            description: "공유 동기화가 지연되고 있어요. 잠시 후 다시 시도해주세요.",
          });
        }
      }

      if (saved) {
        saved.device_name = trimmed;
        localStorage.setItem("meercop_serial_auth", JSON.stringify(saved));
      }

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

  return (
    <div className="flex justify-center py-1 mt-4">
      <button
        onClick={() => setIsEditing(true)}
        className="flex items-center gap-1.5 backdrop-blur-xl bg-white/15 border border-white/25 hover:bg-white/25 transition-colors px-3 py-1.5 rounded-full shadow-lg"
      >
        <span className="text-white font-extrabold text-[11px] drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{deviceName}</span>
        <Pencil className="h-3 w-3 text-white/70" />
      </button>
    </div>
  );
}
