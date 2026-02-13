import { X, Volume2, Play } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { type SensorToggles } from "@/hooks/useSecuritySurveillance";
import { type AlarmSoundConfig } from "@/lib/alarmSounds";

interface SensorSettingsPanelProps {
  isOpen: boolean;
  onClose: () => void;
  sensorToggles: SensorToggles;
  alarmVolume: number;
  onAlarmVolumeChange: (volume: number) => void;
  isMonitoring: boolean;
  deviceType?: string;
  availableSounds: AlarmSoundConfig[];
  selectedSoundId: string;
  onSoundChange: (id: string) => void;
  onPreviewSound: (id: string) => void;
}

const SENSOR_ITEMS: { key: keyof SensorToggles; label: string; desc: string }[] = [
  { key: "cameraMotion", label: "카메라 모션 감지", desc: "카메라로 움직임을 감지합니다" },
  { key: "lid", label: "덮개 (리드) 감지", desc: "노트북 덮개 열림/닫힘을 감지합니다" },
  { key: "microphone", label: "마이크 감지", desc: "주변 소리를 감지합니다" },
  { key: "keyboard", label: "키보드 감지", desc: "키보드 입력을 감지합니다" },
  { key: "mouse", label: "마우스 감지", desc: "마우스 움직임을 감지합니다" },
  { key: "usb", label: "USB 연결 감지", desc: "USB 장치 연결을 감지합니다" },
  { key: "power", label: "전원 케이블 감지", desc: "전원 연결 해제를 감지합니다" },
];

export function SensorSettingsPanel({
  isOpen,
  onClose,
  sensorToggles,
  alarmVolume,
  onAlarmVolumeChange,
  isMonitoring,
  deviceType = "laptop",
  availableSounds,
  selectedSoundId,
  onSoundChange,
  onPreviewSound,
}: SensorSettingsPanelProps) {
  if (!isOpen) return null;

  const deviceLabel = deviceType === "desktop" ? "데스크탑" : deviceType === "tablet" ? "태블릿" : "노트북";

  return (
    <div 
      className="absolute inset-0 z-50 bg-[#1a2640]/95 flex flex-col"
      style={{ backdropFilter: "blur(8px)" }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-3 py-1.5 border-b border-white/10 shrink-0">
        <div>
          <h2 className="text-white font-bold text-sm">감지 설정</h2>
          <p className="text-[10px] text-[#E8F84A]/60 font-semibold">스마트폰에서만 설정 변경이 가능합니다</p>
        </div>
        <button 
          onClick={onClose} 
          className="w-6 h-6 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-white" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto styled-scrollbar">
        {/* Device Type */}
        <div className="px-3 py-1.5 border-b border-white/5">
          <div className="text-[11px] font-bold text-white">기기 타입</div>
          <div className="text-[9px] text-white/30">기기 타입에 따라 사용 가능한 센서가 달라집니다</div>
          <div className="flex gap-1.5 mt-1">
            {["노트북", "데스크탑", "태블릿"].map((type) => (
              <span 
                key={type}
                className={`text-[9px] px-2.5 py-0.5 rounded-full font-bold ${
                  type === deviceLabel
                    ? "bg-[#E8F84A] text-black"
                    : "bg-white/5 text-white/30"
                }`}
              >
                {type}
              </span>
            ))}
          </div>
        </div>

        {/* Camera Motion + Alarm Settings block */}
        {SENSOR_ITEMS.slice(0, 1).map(({ key, label, desc }) => (
          <div key={key} className="px-3 py-1.5 border-b border-white/5">
            <div className="flex items-center justify-between">
              <div className="min-w-0 flex-1">
                <div className={`text-[11px] font-bold ${sensorToggles[key] ? "text-white" : "text-white/40"}`}>{label}</div>
                <div className="text-[9px] text-white/30">{desc}</div>
              </div>
              <Switch checked={sensorToggles[key]} disabled className="pointer-events-none opacity-80 shrink-0 ml-3 scale-[0.8]" />
            </div>
            <Link
              to="/motion-test"
              className="inline-block mt-1 text-[9px] text-[#E8F84A] hover:underline font-semibold"
            >
              🔬 모션 감도 테스트 →
            </Link>
          </div>
        ))}

        {/* Alarm Settings */}
        <div className="px-3 py-1.5 border-b border-white/5">
          <div className="text-[11px] font-bold text-white mb-1">경보음 설정</div>
          {/* Volume */}
          <div className="flex items-center gap-1.5 mb-1.5">
            <Volume2 className="w-3 h-3 text-[#E8F84A] shrink-0" />
            <span className="text-[9px] text-white/50 w-8 shrink-0">크기</span>
            <Slider
              value={[alarmVolume]}
              onValueChange={(v) => onAlarmVolumeChange(v[0])}
              min={0}
              max={100}
              step={5}
              className="flex-1"
            />
            <span className="text-[10px] font-bold text-white/70 w-7 text-right shrink-0">{alarmVolume}%</span>
          </div>
          {/* Sound selector */}
          <div className="space-y-0.5 max-h-24 overflow-y-auto styled-scrollbar">
            {availableSounds.map((sound) => (
              <button
                key={sound.id}
                onClick={() => onSoundChange(sound.id)}
                className={`w-full flex items-center justify-between px-2 py-1 rounded text-left transition-colors ${
                  selectedSoundId === sound.id
                    ? "bg-[#E8F84A]/15 border border-[#E8F84A]/30"
                    : "bg-white/3 hover:bg-white/5"
                }`}
              >
                <span className={`text-[10px] ${selectedSoundId === sound.id ? "text-[#E8F84A] font-bold" : "text-white/60"}`}>
                  {sound.nameKo}
                </span>
                <button
                  onClick={(e) => { e.stopPropagation(); onPreviewSound(sound.id); }}
                  className="w-4 h-4 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20"
                >
                  <Play className="w-2.5 h-2.5 text-white/60" />
                </button>
              </button>
            ))}
          </div>
        </div>

        {/* Remaining Sensor Toggles */}
        {SENSOR_ITEMS.slice(1).map(({ key, label, desc }) => (
          <div key={key} className="flex items-center justify-between px-3 py-1.5 border-b border-white/5">
            <div className="min-w-0 flex-1">
              <div className={`text-[11px] font-bold ${sensorToggles[key] ? "text-white" : "text-white/40"}`}>{label}</div>
              <div className="text-[9px] text-white/30">{desc}</div>
            </div>
            <Switch checked={sensorToggles[key]} disabled className="pointer-events-none opacity-80 shrink-0 ml-3 scale-[0.8]" />
          </div>
        ))}
      </div>
    </div>
  );
}