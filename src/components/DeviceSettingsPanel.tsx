import { useState, useEffect } from "react";
import { Laptop, Monitor, Save, X, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabaseShared } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { useAuth } from "@/hooks/useAuth";

interface Device {
  id: string;
  device_name: string;
  device_type: string;
  metadata: Record<string, unknown> | null;
}

interface DeviceSettingsPanelProps {
  device: Device | null;
  isNewDevice?: boolean;
  onClose: () => void;
  onUpdate: () => void;
}

export function DeviceSettingsPanel({ device, isNewDevice = false, onClose, onUpdate }: DeviceSettingsPanelProps) {
  const { toast } = useToast();
  const { user } = useAuth();
  const [deviceName, setDeviceName] = useState(device?.device_name || "");
  const [deviceType, setDeviceType] = useState(device?.device_type || "laptop");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    if (device) {
      setDeviceName(device.device_name);
      setDeviceType(device.device_type || "laptop");
    } else if (isNewDevice) {
      setDeviceName("");
      setDeviceType("laptop");
    }
  }, [device, isNewDevice]);

  const handleSave = async () => {
    if (!deviceName.trim()) {
      toast({
        title: "입력 오류",
        description: "디바이스 이름을 입력해주세요.",
        variant: "destructive",
      });
      return;
    }

    setIsSaving(true);
    try {
      if (isNewDevice) {
        if (!user?.id) {
          throw new Error("로그인이 필요합니다.");
        }
        const { error } = await supabaseShared
          .from("devices")
          .insert({
            user_id: user.id,
            name: deviceName,
            device_type: deviceType,
            status: "offline",
            is_monitoring: false,
          } as any);
        if (error) throw error;
        toast({ title: "디바이스 등록 완료", description: "새 디바이스가 등록되었습니다." });
      } else if (device) {
        const { error } = await supabaseShared
          .from("devices")
          .update({ name: deviceName, device_type: deviceType } as any)
          .eq("id", device.id);
        if (error) throw error;
        toast({ title: "저장 완료", description: "디바이스 설정이 저장되었습니다." });
      }
      onUpdate();
      onClose();
    } catch (error: any) {
      toast({
        title: "저장 실패",
        description: error.message || "설정 저장에 실패했습니다.",
        variant: "destructive",
      });
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="absolute inset-0 bg-primary z-60 overflow-y-auto">
      <div className="flex items-center justify-between p-4 border-b border-white/20">
        <h2 className="font-bold text-lg text-white">
          {isNewDevice ? "디바이스 등록" : "디바이스 설정"}
        </h2>
        <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4 space-y-6">
        <div className="space-y-2">
          <Label className="text-white text-sm font-bold">디바이스 이름</Label>
          <Input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="예: 내 노트북"
            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
          />
        </div>

        <div className="space-y-2">
          <Label className="text-white text-sm font-bold">디바이스 타입</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setDeviceType("laptop")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-colors ${
                deviceType === "laptop"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <Laptop className="w-5 h-5" />
              <span className="font-bold text-sm">랩탑</span>
            </button>
            <button
              onClick={() => setDeviceType("desktop")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-colors ${
                deviceType === "desktop"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <Monitor className="w-5 h-5" />
              <span className="font-bold text-sm">데스크탑</span>
            </button>
          </div>
        </div>

        <div className="p-3 bg-white/5 rounded-xl border border-white/10">
          <p className="text-white/60 text-xs">
            💡 감지 센서 설정(카메라, 키보드, 마우스, USB 등)은 스마트폰 앱에서 관리합니다.
          </p>
        </div>

        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold"
        >
          {isNewDevice ? <Plus className="w-4 h-4 mr-2" /> : <Save className="w-4 h-4 mr-2" />}
          {isSaving ? "저장 중..." : isNewDevice ? "디바이스 등록" : "저장하기"}
        </Button>
      </div>
    </div>
  );
}
