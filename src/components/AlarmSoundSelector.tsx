import { Volume2, Play, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AlarmSoundConfig } from "@/lib/alarmSounds";
import { useTranslation } from "@/lib/i18n";

// Mapping from alarm sound id to i18n key
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

interface AlarmSoundSelectorProps {
  sounds: AlarmSoundConfig[];
  selectedSoundId: string;
  onSelectSound: (soundId: string) => void;
  onPreviewSound: (soundId: string) => void;
}

export function AlarmSoundSelector({
  sounds,
  selectedSoundId,
  onSelectSound,
  onPreviewSound,
}: AlarmSoundSelectorProps) {
  const { t } = useTranslation();

  return (
    <div className="p-4">
      <h3 className="text-xs font-bold text-white/70 mb-2 flex items-center gap-1">
        <Volume2 className="w-4 h-4" />
        {t("alarmSelector.title")}
      </h3>
      <div className="space-y-1 max-h-[200px] overflow-y-auto">
        {sounds.map((sound) => (
          <div
            key={sound.id}
            className={`flex items-center justify-between p-2 rounded-lg transition-colors ${
              sound.id === selectedSoundId
                ? "bg-secondary text-secondary-foreground"
                : "bg-white/10 hover:bg-white/20"
            }`}
          >
            <button
              onClick={() => onSelectSound(sound.id)}
              className="flex items-center gap-2 flex-1 text-left"
            >
              {sound.id === selectedSoundId ? (
                <Check className="w-4 h-4" />
              ) : (
                <div className="w-4 h-4" />
              )}
              <span className="text-sm font-medium">
                {ALARM_I18N_MAP[sound.id] ? t(ALARM_I18N_MAP[sound.id]) : sound.nameKo}
              </span>
            </button>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 hover:bg-white/20"
              onClick={(e) => {
                e.stopPropagation();
                onPreviewSound(sound.id);
              }}
            >
              <Play className="w-3 h-3" />
            </Button>
          </div>
        ))}
      </div>
    </div>
  );
}
