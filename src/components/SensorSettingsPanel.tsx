import { useRef } from "react";
import { X, Volume2, Play, Camera, Mic, Keyboard, Mouse, Usb, Power, Monitor, ChevronRight, Upload, Trash2, Music, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { type SensorToggles } from "@/hooks/useSecuritySurveillance";
import { type AlarmSoundConfig, getSelectedSoundName, getCustomSounds, saveCustomSound, deleteCustomSound, isCustomSound, type CustomAlarmSound } from "@/lib/alarmSounds";

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
  appLanguage: "ko" | "en";
  onLanguageChange: (lang: "ko" | "en") => void;
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

const SENSOR_ITEMS: { key: keyof SensorToggles; label: string }[] = [
  { key: "cameraMotion", label: "카메라 모션" },
  { key: "lid", label: "덮개 감지" },
  { key: "microphone", label: "마이크" },
  { key: "keyboard", label: "키보드" },
  { key: "mouse", label: "마우스" },
  { key: "usb", label: "USB" },
  { key: "power", label: "전원 케이블" },
];

function CustomSoundUploader({ onSoundAdded }: { onSoundAdded: (sound: CustomAlarmSound) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      alert('오디오 파일만 업로드할 수 있습니다.');
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert('파일 크기는 5MB 이하여야 합니다.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      const name = file.name.replace(/\.[^/.]+$/, '');
      onSoundAdded({
        id: `custom-${Date.now()}`,
        nameKo: `🎵 ${name}`,
        audioDataUrl: dataUrl,
      });
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  return (
    <button
      onClick={() => fileInputRef.current?.click()}
      className="w-full flex items-center gap-2 px-2.5 py-1.5 rounded-xl bg-white/5 hover:bg-white/15 border border-dashed border-white/20 transition-all"
    >
      <Upload className="w-3 h-3 text-white/50" />
      <span className="text-[10px] font-bold text-white/50">내 기기에서 경보음 선택...</span>
      <input
        ref={fileInputRef}
        type="file"
        accept="audio/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </button>
  );
}

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
  appLanguage,
  onLanguageChange,
}: SensorSettingsPanelProps) {
  if (!isOpen) return null;

  const deviceLabel = deviceType === "desktop" ? "데스크탑" : deviceType === "tablet" ? "태블릿" : "노트북";

  const glassCard = "rounded-2xl border border-white/20 bg-white/15 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)]";

  return (
    <div
      className="absolute inset-0 z-50 flex flex-col"
      style={{
        background: "linear-gradient(180deg, hsla(199,85%,55%,0.97) 0%, hsla(199,80%,48%,0.98) 100%)",
        backdropFilter: "blur(20px)",
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2.5 shrink-0">
        <h2 className="text-white font-extrabold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">설정</h2>
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors"
        >
          <X className="w-3.5 h-3.5 text-white" />
        </button>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto styled-scrollbar px-3 pb-3 space-y-2.5">

        {/* Device Type */}
        <section className={`${glassCard} px-3 py-2.5`}>
          <p className="text-[10px] font-extrabold text-white/80 mb-1.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">기기 타입</p>
          <div className="flex gap-1.5">
            {(["노트북", "데스크탑", "태블릿"] as const).map((type) => (
              <span
                key={type}
                className={`text-[10px] px-3 py-1 rounded-full font-bold transition-all ${
                  type === deviceLabel
                    ? "bg-secondary text-secondary-foreground shadow-[0_0_12px_hsla(68,100%,64%,0.35)]"
                    : "bg-white/10 text-white/60"
                }`}
              >
                {type}
              </span>
            ))}
          </div>
        </section>

        {/* Alarm Settings */}
        <section className={`${glassCard} px-3 py-2.5 space-y-2`}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-extrabold text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">경보음</p>
            <span className="text-[9px] font-bold text-secondary bg-secondary/15 px-2 py-0.5 rounded-full truncate max-w-[140px]">
              🔊 {getSelectedSoundName(selectedSoundId)}
            </span>
          </div>
          {/* Volume */}
          <div className="flex items-center gap-2">
            <Volume2 className="w-3.5 h-3.5 text-secondary shrink-0" />
            <Slider
              value={[alarmVolume]}
              onValueChange={(v) => onAlarmVolumeChange(v[0])}
              min={0}
              max={100}
              step={5}
              className="flex-1"
            />
            <span className="text-[11px] font-extrabold text-white w-7 text-right drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">{alarmVolume}%</span>
          </div>
          {/* Sound List */}
          <div className="space-y-0.5 max-h-28 overflow-y-auto styled-scrollbar">
            {availableSounds.map((sound) => {
              const isSelected = selectedSoundId === sound.id;
              return (
                <button
                  key={sound.id}
                  onClick={() => onSoundChange(sound.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl text-left transition-all ${
                    isSelected
                      ? "bg-secondary/25 ring-1 ring-secondary/40"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className={`text-[11px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] ${isSelected ? "text-secondary" : "text-white/90"}`}>
                    {sound.nameKo}
                  </span>
                  <button
                    onClick={(e) => { e.stopPropagation(); onPreviewSound(sound.id); }}
                    className="w-5 h-5 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors"
                  >
                    <Play className="w-2.5 h-2.5 text-white/70" />
                  </button>
                </button>
              );
            })}

            {/* Custom sounds */}
            {getCustomSounds().map((sound) => {
              const isSelected = selectedSoundId === sound.id;
              return (
                <div
                  key={sound.id}
                  onClick={() => onSoundChange(sound.id)}
                  className={`w-full flex items-center justify-between px-2.5 py-1.5 rounded-xl cursor-pointer transition-all ${
                    isSelected
                      ? "bg-secondary/25 ring-1 ring-secondary/40"
                      : "bg-white/5 hover:bg-white/10"
                  }`}
                >
                  <span className={`text-[11px] font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] flex items-center gap-1 ${isSelected ? "text-secondary" : "text-white/90"}`}>
                    <Music className="w-3 h-3" />
                    {sound.nameKo}
                  </span>
                  <div className="flex items-center gap-1">
                    <button
                      onClick={(e) => { e.stopPropagation(); onPreviewSound(sound.id); }}
                      className="w-5 h-5 flex items-center justify-center rounded-full bg-white/15 hover:bg-white/25 transition-colors"
                    >
                      <Play className="w-2.5 h-2.5 text-white/70" />
                    </button>
                    <button
                      onClick={(e) => {
                        e.stopPropagation();
                        deleteCustomSound(sound.id);
                        if (isSelected) onSoundChange('police-siren');
                        // Force re-render
                        onAlarmVolumeChange(alarmVolume);
                      }}
                      className="w-5 h-5 flex items-center justify-center rounded-full bg-red-500/20 hover:bg-red-500/40 transition-colors"
                    >
                      <Trash2 className="w-2.5 h-2.5 text-red-300" />
                    </button>
                  </div>
                </div>
              );
            })}

            {/* Upload custom sound */}
            <CustomSoundUploader onSoundAdded={(sound) => {
              saveCustomSound(sound);
              onSoundChange(sound.id);
            }} />
          </div>
        </section>

        {/* Sensor Toggles */}
        <section className={`${glassCard} px-3 py-2.5`}>
          <div className="flex items-center justify-between mb-2">
            <p className="text-[10px] font-extrabold text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">감지 센서</p>
            <span className="text-[9px] text-secondary font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">스마트폰에서 변경</span>
          </div>

          <div>
            {SENSOR_ITEMS.map(({ key, label }, idx) => {
              const Icon = SENSOR_ICONS[key] || Camera;
              const active = sensorToggles[key];
              return (
                <div key={key}>
                  <div className="flex items-center gap-2.5 py-1.5">
                    <div className={`w-6 h-6 rounded-lg flex items-center justify-center shrink-0 ${
                      active ? "bg-secondary/25" : "bg-white/10"
                    }`}>
                      <Icon className={`w-3 h-3 ${active ? "text-secondary" : "text-white/40"}`} />
                    </div>
                    <p className={`text-[11px] font-extrabold flex-1 drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)] ${active ? "text-white" : "text-white/50"}`}>{label}</p>
                    <Switch
                      checked={active}
                      disabled
                      className="pointer-events-none opacity-60 shrink-0 scale-75"
                    />
                  </div>

                  {key === "cameraMotion" && (
                    <Link
                      to="/motion-test"
                      className="flex items-center gap-0.5 ml-[34px] -mt-0.5 mb-1 text-[9px] text-secondary hover:text-secondary/80 font-semibold transition-colors"
                    >
                      🔬 모션 테스트
                      <ChevronRight className="w-2.5 h-2.5" />
                    </Link>
                  )}

                  {idx < SENSOR_ITEMS.length - 1 && (
                    <div className="ml-[34px] border-b border-white/10" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Language Setting */}
        <section className={`${glassCard} px-3 py-2.5`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Globe className="w-3 h-3 text-white/80" />
            <p className="text-[10px] font-extrabold text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">언어 / Language</p>
          </div>
          <div className="flex gap-1.5">
            {([{ value: "ko" as const, label: "한국어" }, { value: "en" as const, label: "English" }]).map(({ value, label }) => (
              <button
                key={value}
                onClick={() => onLanguageChange(value)}
                className={`flex-1 text-[11px] px-3 py-1.5 rounded-xl font-bold transition-all ${
                  appLanguage === value
                    ? "bg-secondary text-secondary-foreground shadow-[0_0_12px_hsla(68,100%,64%,0.35)]"
                    : "bg-white/10 text-white/60 hover:bg-white/20"
                }`}
              >
                {label}
              </button>
            ))}
          </div>
          <p className="text-[9px] text-white/40 mt-1">스마트폰 앱에서도 변경 가능</p>
        </section>

      </div>
    </div>
  );
}
