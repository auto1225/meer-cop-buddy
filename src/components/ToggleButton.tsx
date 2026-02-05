import { Check, X, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";

interface ToggleButtonProps {
  isOn: boolean;
  onToggle: () => void;
}

export function ToggleButton({ isOn, onToggle }: ToggleButtonProps) {
  return (
    <div className="absolute bottom-6 left-0 right-0 z-30 px-6 flex items-center justify-center gap-4">
      {/* Main Toggle Button */}
      <button
        onClick={onToggle}
        className={`
          flex items-center gap-3 px-8 py-4 rounded-full font-black text-lg
          transition-all duration-300 transform active:scale-95
          ${isOn 
            ? 'toggle-button-on' 
            : 'toggle-button-off'
          }
        `}
      >
        <div className={`
          w-6 h-6 rounded-full flex items-center justify-center
          ${isOn ? 'bg-green-600' : 'bg-gray-500'}
        `}>
          {isOn ? (
            <Check className="h-4 w-4 text-white stroke-[3]" />
          ) : (
            <X className="h-4 w-4 text-white stroke-[3]" />
          )}
        </div>
        <span>MeerCOP {isOn ? 'ON' : 'OFF'}</span>
      </button>

      {/* Dark Mode Button */}
      <Button
        variant="ghost"
        size="icon"
        className="w-14 h-14 rounded-full bg-foreground/20 hover:bg-foreground/30 text-foreground"
      >
        <Moon className="h-6 w-6" />
      </Button>
    </div>
  );
}
