import { X, Volume2 } from "lucide-react";
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

const SENSOR_ITEMS: { key: keyof SensorToggles; label: string; desc: string }[] = [
  { key: "cameraMotion", label: "카메라 모션 감지", desc: "카메라로 움직임을 감지합니다" },
  { key: "lid", label: "덮개 (리드) 감지", desc: "노트북 덮개 열림/닫힘을 감지합니다" },
  { key: "keyboard", label: "키보드 감지", desc: "키보드 입력을 감지합니다" },
  { key: "mouse", label: "마우스 감지", desc: "마우스 움직임을 감지합니다" },
  { key: "power", label: "전원 케이블 감지", desc: "전원 연결 해제를 감지합니다" },
];

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
      <div className="flex items-center justify-between px-3 py-2 border-b border-white/10 shrink-0">
        <h2 className="text-white font-bold text-xs">감지 설정</h2>
        <button 
          onClick={onClose} 
          className="w-6 h-6 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-white" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto styled-scrollbar">
        {/* Sensor Toggles */}
        {SENSOR_ITEMS.map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between px-4 py-2.5 border-b border-white/5">
            <div className="min-w-0 flex-1">
              <div className={`text-[12px] font-bold ${sensorToggles[key] ? "text-white" : "text-white/40"}`}>
                {label}
              </div>
              <div className="text-[10px] text-white/30 mt-0.5">{desc}</div>
            </div>
            <Switch checked={sensorToggles[key]} disabled className="pointer-events-none opacity-80 shrink-0 ml-3 scale-90" />
          </div>
        ))}

        {/* Alarm Volume */}
        <div className="px-4 py-2.5 border-b border-white/5">
          <div className="text-[12px] font-bold text-white mb-1.5">경보음 크기</div>
          <div className="flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 text-[#E8F84A] shrink-0" />
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
