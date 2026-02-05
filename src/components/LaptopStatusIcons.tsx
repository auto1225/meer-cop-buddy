import wifiOn from "@/assets/wifi-on.png";
import wifiOff from "@/assets/wifi-off.png";
import cameraOn from "@/assets/camera-on.png";
import cameraOff from "@/assets/camera-off.png";
import meercopOn from "@/assets/meercop-on.png";
import meercopOff from "@/assets/meercop-off.png";

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
    <div className="flex justify-center items-center gap-8 px-4 py-2 mt-4">
      {/* MeerCOP Icon */}
      <div className="flex flex-col items-center gap-1">
        <div className="w-11 h-11 flex items-center justify-center">
          <img 
            src={meercopStatus ? meercopOn : meercopOff} 
            alt="MeerCOP" 
            className="h-9 w-9 object-contain"
          />
        </div>
        <span className="text-[9px] font-bold text-white">
          MeerCOP
        </span>
      </div>

      {/* Network Icon */}
      <div className="flex flex-col items-center gap-1">
        <div className="w-11 h-11 flex items-center justify-center">
          <img 
            src={networkStatus ? wifiOn : wifiOff} 
            alt="Network" 
            className="h-9 w-9 object-contain"
          />
        </div>
        <span className="text-[9px] font-bold text-white">
          Network
        </span>
      </div>

      {/* Camera Icon */}
      <div className="flex flex-col items-center gap-1">
        <div className="w-11 h-11 flex items-center justify-center">
          <img 
            src={cameraStatus ? cameraOn : cameraOff} 
            alt="Camera" 
            className="h-9 w-9 object-contain"
          />
        </div>
        <span className="text-[9px] font-bold text-white">
          Camera
        </span>
      </div>
    </div>
  );
}
