import { X, Camera, Mic, Keyboard, Mouse, Power, Volume2 } from "lucide-react";
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
    <div 
      className="absolute inset-0 z-50 bg-[#1a2640]/95 flex flex-col"
      style={{ backdropFilter: "blur(8px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 border-b border-white/10 shrink-0">
        <h2 className="text-white font-bold text-sm">감지 설정</h2>
        <button 
          onClick={onClose} 
          className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4 text-white" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto px-4 py-3 space-y-3 styled-scrollbar">
        {/* Monitoring Status */}
        <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5">
          <div className={`w-2 h-2 rounded-full ${isMonitoring ? "bg-green-400 animate-pulse" : "bg-white/30"}`} />
          <span className="text-[11px] text-white/70">
            {isMonitoring ? "감시 활성화됨" : "감시 비활성화"}
          </span>
        </div>

        {/* Sensor Toggles (read-only, set from smartphone) */}
        <div>
          <h3 className="text-[10px] font-bold text-white/50 mb-1.5 uppercase tracking-wider">감지 센서 설정</h3>
          <p className="text-[9px] text-white/30 mb-2">스마트폰에서 설정 변경 가능</p>
          <div className="space-y-1.5">
            {SENSOR_ITEMS.map(({ key, icon: Icon, label, desc }) => (
              <div key={key} className="flex items-center justify-between px-3 py-2.5 rounded-xl bg-white/5">
                <div className="flex items-center gap-2.5 min-w-0 flex-1">
                  <Icon className={`w-4 h-4 shrink-0 ${sensorToggles[key] ? "text-[#E8F84A]" : "text-white/30"}`} />
                  <div className="min-w-0">
                    <div className={`text-[11px] font-semibold truncate ${sensorToggles[key] ? "text-white" : "text-white/40"}`}>
                      {label}
                    </div>
                    <div className="text-[9px] text-white/30 truncate">{desc}</div>
                  </div>
                </div>
                <Switch checked={sensorToggles[key]} disabled className="pointer-events-none opacity-80 shrink-0 ml-2" />
              </div>
            ))}
          </div>
        </div>

        {/* Alarm Volume */}
        <div>
          <h3 className="text-[10px] font-bold text-white/50 mb-2 uppercase tracking-wider">경보음 크기</h3>
          <div className="flex items-center gap-2.5 px-3 py-2.5 rounded-xl bg-white/5">
            <Volume2 className="w-4 h-4 text-[#E8F84A] shrink-0" />
            <Slider
              value={[alarmVolume]}
              onValueChange={(v) => onAlarmVolumeChange(v[0])}
              min={0}
              max={100}
              step={5}
              className="flex-1"
            />
            <span className="text-[11px] font-bold text-white/70 w-8 text-right shrink-0">{alarmVolume}%</span>
          </div>
        </div>
      </div>
    </div>
  );
}
