import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { getSavedAuth } from "@/lib/serialAuth";
import { updateDeviceViaEdge, fetchDevicesViaEdge } from "@/lib/deviceApi";
import { useToast } from "@/hooks/use-toast";

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

      // 중복 이름 검사
      if (saved?.user_id) {
        const allDevices = await fetchDevicesViaEdge(saved.user_id);
        const duplicate = allDevices.find(
          d => d.id !== deviceId && (d.device_name === trimmed || d.name === trimmed)
        );
        if (duplicate) {
          toast({ title: "중복된 이름", description: `"${trimmed}" 이름은 이미 다른 기기에서 사용 중입니다.`, variant: "destructive" });
          setIsSaving(false);
          return;
        }
      }

      // Update DB via Edge Function
      if (deviceId) {
        await updateDeviceViaEdge(deviceId, { name: trimmed });
      }

      // Update localStorage
      if (saved) {
        saved.device_name = trimmed;
        localStorage.setItem("meercop_serial_auth", JSON.stringify(saved));
      }

      onNameChanged?.(trimmed);
      setIsEditing(false);
      toast({ title: "이름 변경 완료", description: `기기 이름이 "${trimmed}"(으)로 변경되었습니다.` });
    } catch (err: any) {
      toast({ title: "변경 실패", description: err.message || "이름 변경에 실패했습니다.", variant: "destructive" });
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
          <button
            onClick={handleSave}
            disabled={isSaving}
            className="p-0.5 rounded hover:bg-white/20 transition-colors text-green-600"
          >
            <Check className="h-3 w-3" />
          </button>
          <button
            onClick={() => { setEditValue(deviceName); setIsEditing(false); }}
            disabled={isSaving}
            className="p-0.5 rounded hover:bg-white/20 transition-colors text-destructive"
          >
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
