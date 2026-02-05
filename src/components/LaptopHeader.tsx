import { Menu, Bell } from "lucide-react";
import { Button } from "@/components/ui/button";
import meercopLogo from "@/assets/meercop-logo.png";

interface LaptopHeaderProps {
  onMenuClick?: () => void;
  onNotificationClick?: () => void;
}

export function LaptopHeader({ onMenuClick, onNotificationClick }: LaptopHeaderProps) {
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
          <img 
            src={meercopLogo} 
            alt="MeerCOP" 
            className="h-6 object-contain"
          />
        </div>

        {/* Right - Notification Bell */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-foreground hover:bg-white/20 h-8 w-8"
          onClick={onNotificationClick}
        >
          <Bell className="h-4 w-4" />
        </Button>
      </div>
    </header>
  );
}
