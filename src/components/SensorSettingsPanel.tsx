import { useRef } from "react";
import { ArrowLeft, Volume2, Play, Camera, Mic, Keyboard, Mouse, Usb, Power, Monitor, ChevronRight, Upload, Trash2, Music, Globe } from "lucide-react";
import { Link } from "react-router-dom";
import { Switch } from "@/components/ui/switch";
import { Slider } from "@/components/ui/slider";
import { type SensorToggles } from "@/hooks/useSecuritySurveillance";
import { type AlarmSoundConfig, getCustomSounds, saveCustomSound, deleteCustomSound, isCustomSound, type CustomAlarmSound } from "@/lib/alarmSounds";
import { useTranslation, type Lang, getLanguageNativeLabel } from "@/lib/i18n";

const ALARM_I18N_MAP: Record<string, string> = {
  "police-siren": "alarm.policeSiren",
  "security-alarm": "alarm.securityAlarm",
  "air-raid": "alarm.airRaid",
  "intruder-alert": "alarm.intruderAlert",
  "panic-alarm": "alarm.panicAlarm",
  "car-alarm": "alarm.carAlarm",
  "emergency-horn": "alarm.emergencyHorn",
  "theft-deterrent": "alarm.theftDeterrent",
  "loud-klaxon": "alarm.loudKlaxon",
  "triple-threat": "alarm.tripleThreat",
};

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
  appLanguage: string;
  onLanguageChange: (lang: string) => void;
  micThresholdDb?: number;
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

// power will be filtered out dynamically for desktop
const ALL_SENSOR_KEYS: (keyof SensorToggles)[] = [
  "cameraMotion", "lid", "microphone", "keyboard", "mouse", "usb", "power",
];

function CustomSoundUploader({ onSoundAdded }: { onSoundAdded: (sound: CustomAlarmSound) => void }) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const { t } = useTranslation();

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('audio/')) {
      alert(t("settings.audioOnly"));
      return;
    }
    if (file.size > 5 * 1024 * 1024) {
      alert(t("settings.fileTooLarge"));
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
      <span className="text-[10px] font-bold text-white/50">{t("settings.uploadSound")}</span>
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
  micThresholdDb = 60,
}: SensorSettingsPanelProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const deviceTypeMap: Record<string, string> = {
    desktop: t("settings.desktop"),
    tablet: t("settings.tablet"),
  };
  const deviceLabel = deviceTypeMap[deviceType] || t("settings.laptop");

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
      <div className="flex items-center px-4 py-2.5 shrink-0">
        <button
          onClick={onClose}
          className="w-6 h-6 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 transition-colors mr-2"
        >
          <ArrowLeft className="w-3.5 h-3.5 text-white" />
        </button>
        <h2 className="text-white font-extrabold text-sm drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">{t("settings.title")}</h2>
      </div>

      {/* Scrollable Content */}
      <div className="flex-1 overflow-y-auto styled-scrollbar px-3 pb-3 space-y-2.5">

        {/* Device Type */}
        <section className={`${glassCard} px-3 py-2.5`}>
          <p className="text-[10px] font-extrabold text-white/80 mb-1.5 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">{t("settings.deviceType")}</p>
          <div className="flex gap-1.5">
            {([
              { key: "laptop", label: t("settings.laptop") },
              { key: "desktop", label: t("settings.desktop") },
              { key: "tablet", label: t("settings.tablet") },
            ]).map(({ key, label }) => (
              <span
                key={key}
                className={`text-[10px] px-3 py-1 rounded-full font-bold transition-all ${
                  key === deviceType
                    ? "bg-secondary text-secondary-foreground shadow-[0_0_12px_hsla(68,100%,64%,0.35)]"
                    : "bg-white/10 text-white/60"
                }`}
              >
                {label}
              </span>
            ))}
          </div>
        </section>

        {/* Alarm Settings */}
        <section className={`${glassCard} px-3 py-2.5 space-y-2`}>
          <div className="flex items-center justify-between">
            <p className="text-[10px] font-extrabold text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">{t("settings.alarmSound")}</p>
            <span className="text-[9px] font-bold text-secondary bg-secondary/15 px-2 py-0.5 rounded-full truncate max-w-[140px]">
              🔊 {ALARM_I18N_MAP[selectedSoundId] ? t(ALARM_I18N_MAP[selectedSoundId]) : selectedSoundId}
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
                    {ALARM_I18N_MAP[sound.id] ? t(ALARM_I18N_MAP[sound.id]) : sound.nameKo}
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
            <p className="text-[10px] font-extrabold text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">{t("sensor.title")}</p>
            <span className="text-[9px] text-secondary font-bold drop-shadow-[0_1px_1px_rgba(0,0,0,0.15)]">{t("sensor.changeFromPhone")}</span>
          </div>

          <div>
            {ALL_SENSOR_KEYS
              .filter(key => !(key === "power" && deviceType === "desktop"))
              .map((key, idx, filteredKeys) => {
              const Icon = SENSOR_ICONS[key] || Camera;
              const active = sensorToggles[key];
              const label = t(`sensor.${key}`);
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
                      🔬 {t("sensor.motionTest")}
                      <ChevronRight className="w-2.5 h-2.5" />
                    </Link>
                  )}

                  {/* Microphone dB threshold slider */}
                  {key === "microphone" && active && (
                    <div className="ml-[34px] mr-1 mb-2 mt-1 space-y-1.5">
                      <div className="flex items-center justify-between">
                        <span className="text-[9px] font-bold text-white/70">{t("sensor.micThreshold")}</span>
                        <span className="text-[10px] font-extrabold text-secondary">{micThresholdDb} dB</span>
                      </div>
                      {/* dB scale bar */}
                      <div className="relative h-5 rounded-lg bg-white/10 overflow-hidden">
                        {/* Highlight zone (above threshold) */}
                        <div 
                          className="absolute top-0 bottom-0 bg-red-500/25 border-l-2 border-red-400/60"
                          style={{ left: `${((micThresholdDb - 30) / 70) * 100}%`, right: 0 }}
                        />
                        {/* Labels */}
                        <div className="absolute inset-0 flex items-center justify-between px-1.5">
                          <span className="text-[7px] font-bold text-white/50">30dB {t("sensor.micWhisper")}</span>
                          <span className="text-[7px] font-bold text-white/50">100dB {t("sensor.micAirplane")}</span>
                        </div>
                      </div>
                      {/* Middle labels */}
                      <div className="flex justify-between px-1">
                        <span className="text-[7px] text-white/40">|</span>
                        <span className="text-[7px] text-white/40">50dB {t("sensor.micConversation")}</span>
                        <span className="text-[7px] text-white/40">80dB {t("sensor.micShout")}</span>
                        <span className="text-[7px] text-white/40">|</span>
                      </div>
                      <p className="text-[8px] text-yellow-300/70 font-semibold">{t("sensor.micWarning")}</p>
                      <p className="text-[8px] text-white/40">{t("sensor.micThresholdDesc")}</p>
                    </div>
                  )}

                  {idx < filteredKeys.length - 1 && (
                    <div className="ml-[34px] border-b border-white/10" />
                  )}
                </div>
              );
            })}
          </div>
        </section>

        {/* Language Setting - Display only (set from smartphone) */}
        <section className={`${glassCard} px-3 py-2.5`}>
          <div className="flex items-center gap-1.5 mb-1.5">
            <Globe className="w-3 h-3 text-white/80" />
            <p className="text-[10px] font-extrabold text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">{t("language.title")}</p>
          </div>
          <div className="flex gap-1.5">
            <span className="flex-1 text-[11px] px-3 py-1.5 rounded-xl font-bold bg-secondary text-secondary-foreground shadow-[0_0_12px_hsla(68,100%,64%,0.35)] text-center">
              {getLanguageNativeLabel(appLanguage)}
            </span>
          </div>
          <p className="text-[9px] text-white/40 mt-1">{t("language.changeFromPhone")}</p>
        </section>

      </div>
    </div>
  );
}
