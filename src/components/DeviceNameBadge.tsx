import { useState, useRef, useEffect } from "react";
import { Pencil, Check, X } from "lucide-react";
import { getSavedAuth } from "@/lib/serialAuth";
import { supabaseShared } from "@/lib/supabase";
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
      // Update DB
      if (deviceId) {
        await supabaseShared
          .from("devices")
          .update({ device_name: trimmed } as any)
          .eq("id", deviceId);
      }

      // Update localStorage
      const saved = getSavedAuth();
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
        <div className="flex items-center gap-1 bg-muted px-2 py-1 rounded-full shadow-sm">
          <input
            ref={inputRef}
            value={editValue}
            onChange={(e) => setEditValue(e.target.value)}
            onKeyDown={handleKeyDown}
            disabled={isSaving}
            className="w-[100px] bg-transparent text-secondary font-bold text-[11px] outline-none text-center"
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
        className="flex items-center gap-1.5 bg-muted hover:bg-muted/80 transition-colors px-3 py-1 rounded-full shadow-sm"
      >
        <span className="text-secondary font-bold text-[11px]">{deviceName}</span>
        <Pencil className="h-3 w-3 text-foreground/70" />
      </button>
    </div>
  );
}
