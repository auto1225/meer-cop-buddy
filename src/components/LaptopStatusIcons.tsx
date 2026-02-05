import { Shield, Camera } from "lucide-react";
import wifiOn from "@/assets/wifi-on.png";
import wifiOff from "@/assets/wifi-off.png";

interface LaptopStatusIconsProps {
  meercopStatus: boolean;
  networkStatus: boolean;
  cameraStatus: boolean;
}

export function LaptopStatusIcons({ 
  meercopStatus, 
  networkStatus, 
  cameraStatus,
}: LaptopStatusIconsProps) {
  return (
    <div className="flex justify-center items-center gap-8 px-4 py-2">
      {/* MeerCOP Icon */}
      <div className="flex flex-col items-center gap-1">
        <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center 
          transition-all duration-300
          ${meercopStatus ? 'bg-secondary shadow-md' : 'bg-white/30'}
        `}>
          <div className="relative flex flex-col items-center">
            <Shield className={`h-5 w-5 ${meercopStatus ? 'text-primary' : 'text-foreground/40'}`} />
            <span className="text-[10px] mt-[-2px]">😎</span>
          </div>
        </div>
        <span className={`text-[9px] font-bold ${meercopStatus ? 'text-foreground' : 'text-foreground/50'}`}>
          MeerCOP
        </span>
      </div>

      {/* Network Icon - Custom images */}
      <div className="flex flex-col items-center gap-1">
        <div className="w-10 h-10 flex items-center justify-center">
          <img 
            src={networkStatus ? wifiOn : wifiOff} 
            alt="Network" 
            className="h-8 w-8 object-contain"
          />
        </div>
        <span className={`text-[9px] font-bold ${networkStatus ? 'text-foreground' : 'text-foreground/50'}`}>
          Network
        </span>
      </div>

      {/* Camera Icon */}
      <div className="flex flex-col items-center gap-1">
        <div className={`
          w-10 h-10 rounded-lg flex items-center justify-center 
          transition-all duration-300
          ${cameraStatus ? 'bg-secondary shadow-md' : 'bg-white/30'}
        `}>
          <div className="relative flex flex-col items-center">
            <Camera className={`h-5 w-5 ${cameraStatus ? 'text-primary' : 'text-foreground/40'}`} />
            <span className="text-[10px] mt-[-2px]">😀</span>
          </div>
        </div>
        <span className={`text-[9px] font-bold ${cameraStatus ? 'text-foreground' : 'text-foreground/50'}`}>
          Camera
        </span>
      </div>
    </div>
  );
}
