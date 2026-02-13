import { X, Camera, Mic, Keyboard, Mouse, Usb, Power, Volume2 } from "lucide-react";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { type SensorToggles } from "@/hooks/useSecuritySurveillance";

interface SensorSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sensorToggles: SensorToggles;
  alarmVolume: number;
  onAlarmVolumeChange: (volume: number) => void;
  isMonitoring: boolean;
}

const SENSOR_ITEMS = [
  { key: "cameraMotion" as const, icon: Camera, label: "카메라 모션 감지", desc: "카메라로 움직임을 감지합니다" },
  { key: "keyboard" as const, icon: Keyboard, label: "키보드 감지", desc: "키보드 입력을 감지합니다" },
  { key: "mouse" as const, icon: Mouse, label: "마우스 감지", desc: "마우스 움직임을 감지합니다" },
  { key: "power" as const, icon: Power, label: "전원 케이블 감지", desc: "전원 연결 해제를 감지합니다" },
  { key: "lid" as const, icon: Mic, label: "덮개 감지", desc: "노트북 덮개 열림을 감지합니다" },
] as const;

export function SensorSettingsPanel({
  isOpen,
  onClose,
  sensorToggles,
  alarmVolume,
  onAlarmVolumeChange,
  isMonitoring,
}: SensorSettingsPanelProps) {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="bg-[#1e2a4a] rounded-2xl w-[85%] max-w-[320px] max-h-[80%] overflow-hidden shadow-2xl border border-white/10">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/10">
          <h2 className="text-white font-bold text-sm">감지 설정</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto max-h-[60vh] p-4 space-y-4">
          {/* Monitoring Status */}
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
            <div className={`w-2 h-2 rounded-full ${isMonitoring ? "bg-green-400 animate-pulse" : "bg-white/30"}`} />
            <span className="text-xs text-white/70">
              {isMonitoring ? "감시 활성화됨" : "감시 비활성화"}
            </span>
          </div>

          {/* Sensor Toggles (read-only, set from smartphone) */}
          <div>
            <h3 className="text-[11px] font-bold text-white/50 mb-2 uppercase tracking-wider">감지 센서 설정</h3>
            <p className="text-[10px] text-white/30 mb-3">스마트폰에서 설정 변경 가능</p>
            <div className="space-y-1">
              {SENSOR_ITEMS.map(({ key, icon: Icon, label, desc }) => (
                <div key={key} className="flex items-center justify-between p-3 rounded-xl bg-white/5">
                  <div className="flex items-center gap-3">
                    <Icon className={`w-4 h-4 ${sensorToggles[key] ? "text-[#E8F84A]" : "text-white/30"}`} />
                    <div>
                      <div className={`text-xs font-semibold ${sensorToggles[key] ? "text-white" : "text-white/40"}`}>
                        {label}
                      </div>
                      <div className="text-[10px] text-white/30">{desc}</div>
                    </div>
                  </div>
                  <Switch checked={sensorToggles[key]} disabled className="pointer-events-none opacity-80" />
                </div>
              ))}
            </div>
          </div>

          {/* Alarm Volume */}
          <div>
            <h3 className="text-[11px] font-bold text-white/50 mb-3 uppercase tracking-wider">경보음 크기</h3>
            <div className="flex items-center gap-3 px-3 py-3 rounded-xl bg-white/5">
              <Volume2 className="w-4 h-4 text-[#E8F84A] shrink-0" />
              <Slider
                value={[alarmVolume]}
                onValueChange={(v) => onAlarmVolumeChange(v[0])}
                min={0}
                max={100}
                step={5}
                className="flex-1"
              />
              <span className="text-xs font-bold text-white/70 w-8 text-right">{alarmVolume}%</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
