import { Menu, Monitor } from "lucide-react";
import { Button } from "@/components/ui/button";
import meercopLogo from "@/assets/meercop-logo.png";
import soundOn from "@/assets/sound-on.png";
import soundOff from "@/assets/sound-off.png";
import { useTranslation } from "@/lib/i18n";

interface LaptopHeaderProps {
  onMenuClick?: () => void;
  soundEnabled?: boolean;
  onSoundToggle?: () => void;
  deviceType?: string;
}

export function LaptopHeader({ onMenuClick, soundEnabled = true, onSoundToggle, deviceType = "laptop" }: LaptopHeaderProps) {
  const { t } = useTranslation();

  const typeLabel = deviceType === "laptop" ? "Laptop" : deviceType === "smartphone" ? "Phone" : deviceType;

  return (
    <header className="relative z-20 px-3 py-1.5">
      <div className="flex items-center justify-between">
        <button 
          className="h-9 w-9 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4 text-white" />
        </button>

        <div className="text-center flex items-center gap-1.5">
          <img 
            src={meercopLogo} 
            alt="MeerCOP" 
            className="h-6 object-contain"
          />
          <span className="inline-flex items-center gap-0.5 bg-white/20 backdrop-blur-sm border border-white/30 rounded-full px-2 py-0.5 text-[10px] font-extrabold text-white/90 uppercase tracking-wider">
            <Monitor className="h-3 w-3" />
            {typeLabel}
          </span>
        </div>

        <button 
          className="h-9 w-9 rounded-full bg-white/20 backdrop-blur-sm border border-white/30 flex items-center justify-center hover:bg-white/30 transition-colors"
          onClick={onSoundToggle}
        >
          <img 
            src={soundEnabled ? soundOn : soundOff} 
            alt={soundEnabled ? t("alarm.on") : t("alarm.off")} 
            className="h-5 w-5 object-contain"
          />
        </button>
      </div>
    </header>
  );
}
