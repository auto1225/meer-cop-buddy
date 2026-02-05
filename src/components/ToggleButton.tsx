import { Check, X, Moon, Sun } from "lucide-react";
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
      {/* Main Toggle Button */}
      <button
        onClick={onToggle}
        className={`
          flex items-center gap-2 px-5 py-2.5 rounded-full font-extrabold text-sm
          transition-all duration-300 transform active:scale-95
          ${isOn 
            ? 'toggle-button-on' 
            : 'toggle-button-off'
          }
        `}
      >
        <div className={`
          w-5 h-5 rounded-full flex items-center justify-center
          ${isOn ? 'bg-green-600' : 'bg-gray-500'}
        `}>
          {isOn ? (
            <Check className="h-3 w-3 text-white stroke-[3]" />
          ) : (
            <X className="h-3 w-3 text-white stroke-[3]" />
          )}
        </div>
        <span>MeerCOP {isOn ? 'ON' : 'OFF'}</span>
      </button>

      {/* Dark Mode Button - Only visible when monitoring is ON */}
      {showDarkMode && isOn && onDarkModeToggle && (
        <Button
          variant="ghost"
          size="icon"
          onClick={onDarkModeToggle}
          className={`w-10 h-10 rounded-full transition-all ${
            isDarkMode 
              ? 'bg-primary text-primary-foreground hover:bg-primary/90' 
              : 'bg-foreground/20 hover:bg-foreground/30 text-foreground'
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
