import { X, Volume2, Play, Camera, Mic, Keyboard, Mouse, Usb, Power, Monitor, ChevronRight } from "lucide-react";
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

const SENSOR_ICONS: Record<string, React.ElementType> = {
  cameraMotion: Camera,
  lid: Monitor,
  microphone: Mic,
  keyboard: Keyboard,
  mouse: Mouse,
  usb: Usb,
  power: Power,
};

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
  const selectedSound = availableSounds.find(s => s.id === selectedSoundId);

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
      style={{
        background: "linear-gradient(180deg, hsl(222 47% 22%) 0%, hsl(222 47% 18%) 100%)",
        backdropFilter: "blur(12px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-3 shrink-0">
        <h2 className="text-white font-extrabold text-base tracking-tight">설정</h2>
        <button
          onClick={onClose}
          className="w-7 h-7 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4 text-white/80" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto styled-scrollbar px-4 pb-4 space-y-4">

        {/* Device Type Card */}
        <section className="rounded-2xl bg-white/[0.06] p-3.5">
          <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider mb-2">기기 타입</p>
          <div className="flex gap-2">
            {(["노트북", "데스크탑", "태블릿"] as const).map((type) => (
              <span
                key={type}
                className={`text-xs px-3.5 py-1.5 rounded-full font-bold transition-colors ${
                  type === deviceLabel
                    ? "bg-secondary text-secondary-foreground shadow-md"
                    : "bg-white/[0.06] text-white/30"
                }`}
              >
                {type}
              </span>
            ))}
          </div>
        </section>

        {/* Alarm Settings Card */}
        <section className="rounded-2xl bg-white/[0.06] p-3.5 space-y-3">
          <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">경보음</p>

          {/* Volume Control */}
          <div className="flex items-center gap-2.5">
            <Volume2 className="w-4 h-4 text-secondary shrink-0" />
            <Slider
              value={[alarmVolume]}
              onValueChange={(v) => onAlarmVolumeChange(v[0])}
              min={0}
              max={100}
              step={5}
              className="flex-1"
            />
            <span className="text-xs font-bold text-white/70 w-8 text-right shrink-0">{alarmVolume}%</span>
          </div>

          {/* Sound List */}
          <div className="space-y-1 max-h-28 overflow-y-auto styled-scrollbar">
            {availableSounds.map((sound) => {
              const isSelected = selectedSoundId === sound.id;
              return (
                <button
                  key={sound.id}
                  onClick={() => onSoundChange(sound.id)}
                  className={`w-full flex items-center justify-between px-3 py-2 rounded-xl text-left transition-all ${
                    isSelected
                      ? "bg-secondary/20 ring-1 ring-secondary/40"
                      : "bg-white/[0.04] hover:bg-white/[0.08]"
                  }`}
                >
                  <span className={`text-xs font-semibold ${isSelected ? "text-secondary" : "text-white/60"}`}>
                    {sound.nameKo}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onPreviewSound(sound.id); }}
                    className="w-6 h-6 flex items-center justify-center rounded-full bg-white/10 hover:bg-white/20 transition-colors"
                  >
                    <Play className="w-3 h-3 text-white/60" />
                  </button>
                </button>
              );
            })}
          </div>
        </section>

        {/* Sensor Toggles Card */}
        <section className="rounded-2xl bg-white/[0.06] p-3.5">
          <div className="flex items-center justify-between mb-2">
            <p className="text-[11px] font-bold text-white/50 uppercase tracking-wider">감지 센서</p>
            <span className="text-[10px] text-secondary/70 font-semibold">스마트폰에서 변경</span>
          </div>

          <div className="space-y-0.5">
            {SENSOR_ITEMS.map(({ key, label, desc }) => {
              const Icon = SENSOR_ICONS[key] || Camera;
              const active = sensorToggles[key];
              return (
                <div key={key}>
                  <div className="flex items-center gap-3 py-2.5 px-1">
                    <div className={`w-7 h-7 rounded-lg flex items-center justify-center shrink-0 ${
                      active ? "bg-secondary/20" : "bg-white/[0.06]"
                    }`}>
                      <Icon className={`w-3.5 h-3.5 ${active ? "text-secondary" : "text-white/30"}`} />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-bold ${active ? "text-white" : "text-white/40"}`}>{label}</p>
                      <p className="text-[10px] text-white/25 leading-tight">{desc}</p>
                    </div>
                    <Switch
                      checked={active}
                      disabled
                      className="pointer-events-none opacity-70 shrink-0 scale-[0.85]"
                    />
                  </div>

                  {/* Motion test link for camera */}
                  {key === "cameraMotion" && (
                    <Link
                      to="/motion-test"
                      className="flex items-center gap-1 ml-11 mb-1 text-[10px] text-secondary hover:text-secondary/80 font-semibold transition-colors"
                    >
                      🔬 모션 감도 테스트
                      <ChevronRight className="w-3 h-3" />
                    </Link>
                  )}

                  {/* Separator between items (not after last) */}
                  {key !== "power" && (
                    <div className="ml-11 border-b border-white/[0.05]" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

      </div>
    </div>
  );
}
