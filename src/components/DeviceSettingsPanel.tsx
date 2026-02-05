import { useState, useEffect } from "react";
import { Laptop, Monitor, Save, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { supabaseShared } from "@/lib/supabase";
import { useToast } from "@/hooks/use-toast";
import { SensorSettings, DEFAULT_SENSOR_SETTINGS } from "@/hooks/useSensorDetection";

interface Device {
  id: string;
  device_name: string;
  device_type: string;
  metadata: Record<string, unknown> | null;
}

interface DeviceSettingsPanelProps {
  device: Device | null;
  onClose: () => void;
  onUpdate: () => void;
}

export function DeviceSettingsPanel({ device, onClose, onUpdate }: DeviceSettingsPanelProps) {
  const { toast } = useToast();
  const [deviceName, setDeviceName] = useState(device?.device_name || "");
  const [isSaving, setIsSaving] = useState(false);
  
  // Parse existing settings from metadata or use defaults
  const existingSettings = (device?.metadata as { sensorSettings?: SensorSettings } | null)?.sensorSettings;
  const [settings, setSettings] = useState<SensorSettings>(
    existingSettings || DEFAULT_SENSOR_SETTINGS
  );

  useEffect(() => {
    if (device) {
      setDeviceName(device.device_name);
      const meta = device.metadata as { sensorSettings?: SensorSettings } | null;
      if (meta?.sensorSettings) {
        setSettings(meta.sensorSettings);
      }
    }
  }, [device]);

  const handleSave = async () => {
    if (!device) return;
    
    setIsSaving(true);
    try {
      const { error } = await supabaseShared
        .from("devices")
        .update({
          device_name: deviceName,
          device_type: settings.deviceType,
          metadata: {
            ...(device.metadata as Record<string, unknown> || {}),
            sensorSettings: settings,
          },
        })
        .eq("id", device.id);

      if (error) throw error;

      toast({
        title: "저장 완료",
        description: "디바이스 설정이 저장되었습니다.",
      });
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

  const updateSetting = <K extends keyof SensorSettings>(key: K, value: SensorSettings[K]) => {
    setSettings((prev) => ({ ...prev, [key]: value }));
  };

  if (!device) return null;

  return (
    <div className="absolute inset-0 bg-primary z-60 overflow-y-auto">
      {/* Header */}
      <div className="flex items-center justify-between p-4 border-b border-white/20">
        <h2 className="font-bold text-lg text-white">디바이스 설정</h2>
        <Button
          variant="ghost"
          size="icon"
          onClick={onClose}
          className="text-white hover:bg-white/20"
        >
          <X className="w-5 h-5" />
        </Button>
      </div>

      <div className="p-4 space-y-6">
        {/* Device Name */}
        <div className="space-y-2">
          <Label className="text-white text-sm font-bold">디바이스 이름</Label>
          <Input
            value={deviceName}
            onChange={(e) => setDeviceName(e.target.value)}
            placeholder="예: 내 노트북"
            className="bg-white/10 border-white/20 text-white placeholder:text-white/50"
          />
        </div>

        {/* Device Type */}
        <div className="space-y-2">
          <Label className="text-white text-sm font-bold">디바이스 타입</Label>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => updateSetting("deviceType", "laptop")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-colors ${
                settings.deviceType === "laptop"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <Laptop className="w-5 h-5" />
              <span className="font-bold text-sm">랩탑</span>
            </button>
            <button
              onClick={() => updateSetting("deviceType", "desktop")}
              className={`flex items-center justify-center gap-2 p-3 rounded-xl transition-colors ${
                settings.deviceType === "desktop"
                  ? "bg-secondary text-secondary-foreground"
                  : "bg-white/10 text-white hover:bg-white/20"
              }`}
            >
              <Monitor className="w-5 h-5" />
              <span className="font-bold text-sm">데스크탑</span>
            </button>
          </div>
        </div>

        {/* Sensor Settings */}
        <div className="space-y-3">
          <Label className="text-white text-sm font-bold">감지 센서 설정</Label>
          
          {/* Laptop specific: Lid */}
          {settings.deviceType === "laptop" && (
            <div className="flex items-center space-x-3 p-3 bg-white/10 rounded-xl">
              <Checkbox
                id="lidClosed"
                checked={settings.lidClosed}
                onCheckedChange={(checked) => updateSetting("lidClosed", !!checked)}
                className="border-white data-[state=checked]:bg-secondary data-[state=checked]:border-secondary"
              />
              <Label htmlFor="lidClosed" className="text-white text-sm cursor-pointer flex-1">
                랩탑 뚜껑 감지
              </Label>
            </div>
          )}

          {/* Camera */}
          <div className="flex items-center space-x-3 p-3 bg-white/10 rounded-xl">
            <Checkbox
              id="camera"
              checked={settings.camera}
              onCheckedChange={(checked) => updateSetting("camera", !!checked)}
              className="border-white data-[state=checked]:bg-secondary data-[state=checked]:border-secondary"
            />
            <Label htmlFor="camera" className="text-white text-sm cursor-pointer flex-1">
              카메라 감지
            </Label>
          </div>

          {/* Microphone - Desktop only */}
          {settings.deviceType === "desktop" && (
            <div className="flex items-center space-x-3 p-3 bg-white/10 rounded-xl">
              <Checkbox
                id="microphone"
                checked={settings.microphone}
                onCheckedChange={(checked) => updateSetting("microphone", !!checked)}
                className="border-white data-[state=checked]:bg-secondary data-[state=checked]:border-secondary"
              />
              <Label htmlFor="microphone" className="text-white text-sm cursor-pointer flex-1">
                마이크 감지
              </Label>
            </div>
          )}

          {/* Keyboard */}
          <div className="p-3 bg-white/10 rounded-xl space-y-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="keyboard"
                checked={settings.keyboard}
                onCheckedChange={(checked) => updateSetting("keyboard", !!checked)}
                className="border-white data-[state=checked]:bg-secondary data-[state=checked]:border-secondary"
              />
              <Label htmlFor="keyboard" className="text-white text-sm cursor-pointer flex-1">
                키보드 감지
              </Label>
            </div>
            {settings.keyboard && settings.deviceType === "desktop" && (
              <div className="flex gap-2 ml-7">
                <button
                  onClick={() => updateSetting("keyboardType", "wired")}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    settings.keyboardType === "wired"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-white/20 text-white"
                  }`}
                >
                  유선
                </button>
                <button
                  onClick={() => updateSetting("keyboardType", "wireless")}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    settings.keyboardType === "wireless"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-white/20 text-white"
                  }`}
                >
                  무선
                </button>
              </div>
            )}
          </div>

          {/* Mouse */}
          <div className="p-3 bg-white/10 rounded-xl space-y-2">
            <div className="flex items-center space-x-3">
              <Checkbox
                id="mouse"
                checked={settings.mouse}
                onCheckedChange={(checked) => updateSetting("mouse", !!checked)}
                className="border-white data-[state=checked]:bg-secondary data-[state=checked]:border-secondary"
              />
              <Label htmlFor="mouse" className="text-white text-sm cursor-pointer flex-1">
                마우스 감지
              </Label>
            </div>
            {settings.mouse && (
              <div className="flex gap-2 ml-7">
                <button
                  onClick={() => updateSetting("mouseType", "wired")}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    settings.mouseType === "wired"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-white/20 text-white"
                  }`}
                >
                  유선
                </button>
                <button
                  onClick={() => updateSetting("mouseType", "wireless")}
                  className={`px-3 py-1 text-xs rounded-full transition-colors ${
                    settings.mouseType === "wireless"
                      ? "bg-secondary text-secondary-foreground"
                      : "bg-white/20 text-white"
                  }`}
                >
                  무선
                </button>
              </div>
            )}
          </div>

          {/* USB */}
          <div className="flex items-center space-x-3 p-3 bg-white/10 rounded-xl">
            <Checkbox
              id="usb"
              checked={settings.usb}
              onCheckedChange={(checked) => updateSetting("usb", !!checked)}
              className="border-white data-[state=checked]:bg-secondary data-[state=checked]:border-secondary"
            />
            <Label htmlFor="usb" className="text-white text-sm cursor-pointer flex-1">
              USB 감지
            </Label>
          </div>
        </div>

        {/* Save Button */}
        <Button
          onClick={handleSave}
          disabled={isSaving}
          className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold"
        >
          <Save className="w-4 h-4 mr-2" />
          {isSaving ? "저장 중..." : "저장하기"}
        </Button>
      </div>
    </div>
  );
}
