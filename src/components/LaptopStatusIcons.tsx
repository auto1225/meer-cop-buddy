import { Settings } from "lucide-react";
import wifiOn from "@/assets/wifi-on.png";
import wifiOff from "@/assets/wifi-off.png";
import cameraOn from "@/assets/camera-on.png";
import cameraOff from "@/assets/camera-off.png";
import smartphoneOn from "@/assets/smartphone-connected.png";
import smartphoneOff from "@/assets/smartphone-off.png";

interface LaptopStatusIconsProps {
  smartphoneStatus: boolean;
  networkStatus: boolean;
  cameraStatus: boolean;
  onCameraClick?: () => void;
  onSmartphoneClick?: () => void;
  onNetworkClick?: () => void;
  onSettingsClick?: () => void;
}

export function LaptopStatusIcons({ 
  smartphoneStatus, 
  networkStatus, 
  cameraStatus,
  onCameraClick,
  onSmartphoneClick,
  onNetworkClick,
  onSettingsClick,
}: LaptopStatusIconsProps) {
  return (
    <div className="flex justify-center items-center gap-6 px-4 py-2 mt-4">
      {/* Smartphone Icon - Clickable */}
      <button 
        onClick={onSmartphoneClick}
        className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <div className="w-12 h-12 flex items-center justify-center">
          <img 
            src={smartphoneStatus ? smartphoneOn : smartphoneOff} 
            alt="Smartphone" 
            className="h-10 w-10 object-contain"
          />
        </div>
        <span className="text-[9px] font-bold text-white">
          Smartphone
        </span>
      </button>

      {/* Network Icon - Clickable */}
      <button 
        onClick={onNetworkClick}
        className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <div className="w-12 h-12 flex items-center justify-center">
          <img 
            src={networkStatus ? wifiOn : wifiOff} 
            alt="Network" 
            className="h-10 w-10 object-contain"
          />
        </div>
        <span className="text-[9px] font-bold text-white">
          Network
        </span>
      </button>

      {/* Camera Icon - Clickable */}
      <button 
        onClick={onCameraClick}
        className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <div className="w-12 h-12 flex items-center justify-center">
          <img 
            src={cameraStatus ? cameraOn : cameraOff} 
            alt="Camera" 
            className="h-10 w-10 object-contain"
          />
        </div>
        <span className="text-[9px] font-bold text-white">
          Camera
        </span>
      </button>

      {/* Settings Icon */}
      <button 
        onClick={onSettingsClick}
        className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <div className="w-12 h-12 flex items-center justify-center">
          <Settings className="h-8 w-8 text-white/80" />
        </div>
        <span className="text-[9px] font-bold text-white">
          Settings
        </span>
      </button>
    </div>
  );
}
