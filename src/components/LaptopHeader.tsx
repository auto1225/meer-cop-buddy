import { Menu, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";

interface LaptopHeaderProps {
  onMenuClick?: () => void;
}

export function LaptopHeader({ onMenuClick }: LaptopHeaderProps) {
  return (
    <header className="relative z-20 px-4 py-2">
      <div className="flex items-center justify-between">
        {/* Left - Menu */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-foreground hover:bg-white/20"
          onClick={onMenuClick}
        >
          <Menu className="h-5 w-5" />
        </Button>

        {/* Center - Logo */}
        <div className="text-center flex flex-col items-center">
          <span className="text-[9px] text-foreground/70 font-medium">MeerCOP ver 1.0.6</span>
          <div className="flex items-center gap-0.5">
            <span className="text-lg font-black text-foreground leading-none tracking-tight">
              M<span className="text-sm">eer</span>
            </span>
            <span className="text-lg font-black text-foreground leading-none">
              COP
            </span>
          </div>
        </div>

        {/* Right - Volume */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-foreground hover:bg-white/20"
        >
          <Volume2 className="h-5 w-5" />
        </Button>
      </div>
    </header>
  );
}
