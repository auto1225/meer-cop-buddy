import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { getSavedAuth } from "@/lib/serialAuth";
import { updateDeviceViaEdge, fetchDevicesViaEdge } from "@/lib/deviceApi";
import { SHARED_SUPABASE_URL, SHARED_SUPABASE_ANON_KEY } from "@/lib/supabase";
import { getSharedDeviceId } from "@/lib/sharedDeviceIdMap";
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

      if (saved?.user_id) {
        const normalized = trimmed.toLowerCase();
        const currentIds = new Set([deviceId, saved.device_id].filter(Boolean) as string[]);

        const allDevices = await fetchDevicesViaEdge(saved.user_id);
        const duplicate = allDevices.find((d) => {
          const isSameDevice = currentIds.has(d.id) || (!!d.device_id && currentIds.has(d.device_id));
          if (isSameDevice) return false;

          return (
            d.device_name?.trim().toLowerCase() === normalized ||
            d.name?.trim().toLowerCase() === normalized
          );
        });

        if (duplicate) {
          toast({ title: t("device.duplicateName"), description: t("device.duplicateDesc"), variant: "destructive" });
          setIsSaving(false);
          return;
        }
      }

      if (deviceId) {
        await updateDeviceViaEdge(deviceId, { name: trimmed, device_name: trimmed });

        // 공유 DB에도 이름 동기화 (스마트폰이 공유 DB를 바라보므로)
        // 공유 DB는 updates 래퍼 없이 top-level 필드로 전송
        const sharedId = getSharedDeviceId(deviceId) || deviceId;
        fetch(`${SHARED_SUPABASE_URL}/functions/v1/update-device`, {
          method: "POST",
          headers: { "Content-Type": "application/json", apikey: SHARED_SUPABASE_ANON_KEY },
          body: JSON.stringify({ device_id: sharedId, name: trimmed }),
        })
          .then(r => r.ok
            ? console.log("[DeviceNameBadge] ✅ Shared DB name synced:", trimmed, "sharedId:", sharedId)
            : r.text().then(t => console.warn("[DeviceNameBadge] ⚠️ Shared DB name sync failed:", t)))
          .catch(e => console.warn("[DeviceNameBadge] ⚠️ Shared DB name sync error:", e));
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
