import { Volume2, Play, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type AlarmSoundConfig } from "@/lib/alarmSounds";

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
  return (
    <div className="p-4">
      <h3 className="text-xs font-bold text-white/70 mb-2 flex items-center gap-1">
        <Volume2 className="w-4 h-4" />
        경보음 선택
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
              <span className="text-sm font-medium">{sound.nameKo}</span>
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
