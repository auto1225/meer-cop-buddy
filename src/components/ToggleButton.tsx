import { Moon, Sun, Shield, ShieldOff } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToggleButtonProps {
  isOn: boolean;
  onToggle: () => void;
  isDarkMode?: boolean;
  onDarkModeToggle?: () => void;
  showDarkMode?: boolean;
}

export function ToggleButton({ 
  isOn, 
  onToggle, 
  isDarkMode = false,
  onDarkModeToggle,
  showDarkMode = true,
}: ToggleButtonProps) {
  return (
    <div className="absolute bottom-3 left-0 right-0 z-30 px-4 flex items-center justify-center gap-3">
      {/* Main Power Toggle */}
      <button
        onClick={onToggle}
        className={`
          relative w-[140px] h-[48px] rounded-full font-extrabold text-sm
          transition-all duration-500 transform active:scale-95
          backdrop-blur-xl border
          flex items-center
          ${isOn 
            ? 'bg-secondary/25 border-secondary/50 shadow-[0_0_20px_hsla(68,100%,64%,0.3)]' 
            : 'bg-white/10 border-white/20 shadow-[0_4px_16px_rgba(0,0,0,0.1)]'
          }
        `}
      >
        {/* Sliding Knob */}
        <div
          className={`
            absolute top-[4px] w-[40px] h-[40px] rounded-full
            flex items-center justify-center
            transition-all duration-500 ease-[cubic-bezier(0.68,-0.15,0.27,1.15)]
            ${isOn
              ? 'left-[96px] bg-secondary shadow-[0_0_12px_hsla(68,100%,64%,0.5)]'
              : 'left-[4px] bg-white/30'
            }
          `}
        >
          {isOn ? (
            <Shield className="h-4 w-4 text-secondary-foreground" />
          ) : (
            <ShieldOff className="h-4 w-4 text-white/70" />
          )}
        </div>

        {/* Label */}
        <span
          className={`
            absolute transition-all duration-300 text-xs font-extrabold drop-shadow-[0_1px_2px_rgba(0,0,0,0.2)]
            ${isOn
              ? 'left-3 text-secondary'
              : 'right-3 text-white/70'
            }
          `}
        >
          {isOn ? 'ON' : 'OFF'}
        </span>
      </button>

      {/* Dark Mode Button */}
      {showDarkMode && isOn && onDarkModeToggle && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDarkModeToggle}
          className={`w-10 h-10 rounded-full backdrop-blur-xl border transition-all ${
            isDarkMode 
              ? 'bg-primary/30 border-primary/40 text-primary-foreground hover:bg-primary/40' 
              : 'bg-white/15 border-white/20 hover:bg-white/25 text-white'
          }`}
        >
          {isDarkMode ? (
            <Sun className="h-5 w-5" />
          ) : (
            <Moon className="h-5 w-5" />
          )}
        </Button>
      )}
    </div>
  );
}
