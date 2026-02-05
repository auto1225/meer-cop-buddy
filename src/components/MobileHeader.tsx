import { useState } from "react";
import { Menu, Bell, Plus, LogOut, Settings, Moon } from "lucide-react";
import { Button } from "@/components/ui/button";
import meercopMascot from "@/assets/meercop-mascot.png";

interface MobileHeaderProps {
  deviceName?: string;
  notificationCount?: number;
  onMenuClick?: () => void;
  onSettingsClick?: () => void;
}

export function MobileHeader({ 
  deviceName = "Laptop1", 
  notificationCount = 0,
  onMenuClick,
  onSettingsClick
}: MobileHeaderProps) {
  return (
    <header className="relative z-20 px-3 py-2">
      <div className="flex items-center justify-between">
        {/* Left - Menu */}
        <Button 
          variant="ghost" 
          size="icon" 
          className="text-foreground hover:bg-white/20"
          onClick={onMenuClick}
        >
          <Menu className="h-6 w-6" />
        </Button>

        {/* Center - Logo */}
        <div className="text-center">
          <h1 className="text-base font-black text-foreground leading-tight">
            Meer<span className="text-sm font-extrabold">COP</span>
          </h1>
        </div>

        {/* Right - Actions */}
        <div className="flex items-center gap-1">
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-foreground hover:bg-white/20 relative"
          >
            <Bell className="h-5 w-5" />
            {notificationCount > 0 && (
              <span className="absolute -top-1 -right-1 h-5 w-5 bg-destructive text-destructive-foreground text-xs font-bold rounded-full flex items-center justify-center">
                {notificationCount}
              </span>
            )}
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-foreground hover:bg-white/20"
          >
            <Plus className="h-5 w-5" />
          </Button>
          <Button 
            variant="ghost" 
            size="icon" 
            className="text-foreground hover:bg-white/20"
          >
            <LogOut className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Device Selector */}
      <div className="flex justify-center mt-2">
        <button 
          className="flex items-center gap-1.5 bg-foreground/20 hover:bg-foreground/30 px-4 py-1.5 rounded-full transition-colors"
          onClick={onSettingsClick}
        >
          <span className="text-foreground font-bold text-sm">{deviceName}</span>
          <Settings className="h-3.5 w-3.5 text-foreground/70" />
        </button>
      </div>
    </header>
  );
}
