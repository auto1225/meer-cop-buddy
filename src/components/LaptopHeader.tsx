import { Menu, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LaptopHeaderProps {
  onMenuClick?: () => void;
}

export function LaptopHeader({ onMenuClick }: LaptopHeaderProps) {
  return (
    <header className="relative z-20 px-3 py-1.5">
      <div className="flex items-center justify-between">
        {/* Left - Menu */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-foreground hover:bg-white/20 h-8 w-8"
          onClick={onMenuClick}
        >
          <Menu className="h-4 w-4" />
        </Button>

        {/* Center - Logo */}
        <div className="text-center flex flex-col items-center">
          <span className="text-[8px] text-foreground/70 font-medium leading-tight">MeerCOP ver 1.0.6</span>
          <div className="flex items-center gap-0.5">
            <span className="text-base font-black text-foreground leading-none tracking-tight">
              M<span className="text-xs">eer</span>
            </span>
            <span className="text-base font-black text-foreground leading-none">
              COP
            </span>
          </div>
        </div>

        {/* Right - Volume */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-foreground hover:bg-white/20 h-8 w-8"
        >
          <Volume2 className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
