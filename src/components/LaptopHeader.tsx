import { Menu } from "lucide-react";
import { Button } from "@/components/ui/button";
import meercopLogo from "@/assets/meercop-logo.png";
import soundOn from "@/assets/sound-on.png";
import soundOff from "@/assets/sound-off.png";
import { useState } from "react";

interface LaptopHeaderProps {
  onMenuClick?: () => void;
  onSoundToggle?: (enabled: boolean) => void;
}

export function LaptopHeader({ onMenuClick, onSoundToggle }: LaptopHeaderProps) {
  const [soundEnabled, setSoundEnabled] = useState(false);

  const handleSoundToggle = () => {
    const newState = !soundEnabled;
    setSoundEnabled(newState);
    onSoundToggle?.(newState);
  };

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

        {/* Right - Sound Toggle */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="hover:bg-white/20 h-8 w-8"
          onClick={handleSoundToggle}
        >
          <img 
            src={soundEnabled ? soundOn : soundOff} 
            alt={soundEnabled ? "Sound On" : "Sound Off"} 
            className="h-5 w-5 object-contain"
          />
        </Button>
      </div>
    </header>
  );
}
