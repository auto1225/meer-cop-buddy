import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import meercopLogo from "@/assets/meercop-logo.png";
import soundOn from "@/assets/sound-on.png";
import soundOff from "@/assets/sound-off.png";

interface LaptopHeaderProps {
  onMenuClick?: () => void;
  soundEnabled?: boolean;
  onSoundToggle?: () => void;
}

export function LaptopHeader({ onMenuClick, soundEnabled = true, onSoundToggle }: LaptopHeaderProps) {
  return (
    <header className="relative z-20 px-3 py-1.5">
      <div className="flex items-center justify-between">
        {/* Left - Menu */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-white hover:bg-white/20 h-8 w-8"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Center - Logo */}
        <div className="text-center flex flex-col items-center">
          <img 
            src={meercopLogo} 
            alt="MeerCOP" 
            className="h-6 object-contain"
          />
        </div>

        {/* Right - Sound Toggle (alarm enable/disable) */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="hover:bg-white/20 h-8 w-8"
          onClick={onSoundToggle}
        >
          <img 
            src={soundEnabled ? soundOn : soundOff} 
            alt={soundEnabled ? "경보음 켜짐" : "경보음 꺼짐"} 
            className="h-5 w-5 object-contain"
          />
        </Button>
      </div>
    </header>
  );
}
