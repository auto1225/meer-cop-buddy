import { Settings } from "lucide-react";
import wifiOn from "@/assets/wifi-on.png";
import wifiOff from "@/assets/wifi-off.png";
import cameraOn from "@/assets/camera-on.png";
import cameraOff from "@/assets/camera-off.png";
import smartphoneOn from "@/assets/sp-active.png";
import smartphoneOff from "@/assets/sp-inactive.png";
import { useTranslation } from "@/lib/i18n";

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
  const { t } = useTranslation();

  return (
    <div className="flex justify-center items-center gap-6 px-4 py-2 mt-4">
      <button 
        onClick={onSmartphoneClick}
        className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <div className="w-12 h-12 flex items-center justify-center">
          <img 
            src={smartphoneStatus ? smartphoneOn : smartphoneOff} 
            alt={t("status.smartphone")} 
            className="h-10 w-10 object-contain"
          />
        </div>
        <span className="text-[9px] font-bold text-white">
          {t("status.smartphone")}
        </span>
      </button>

      <button 
        onClick={onNetworkClick}
        className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <div className="w-12 h-12 flex items-center justify-center">
          <img 
            src={networkStatus ? wifiOn : wifiOff} 
            alt={t("status.network")} 
            className="h-10 w-10 object-contain"
          />
        </div>
        <span className="text-[9px] font-bold text-white">
          {t("status.network")}
        </span>
      </button>

      <button 
        onClick={onCameraClick}
        className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <div className="w-12 h-12 flex items-center justify-center">
          <img 
            src={cameraStatus ? cameraOn : cameraOff} 
            alt={t("status.camera")} 
            className="h-10 w-10 object-contain"
          />
        </div>
        <span className="text-[9px] font-bold text-white">
          {t("status.camera")}
        </span>
      </button>

      <button 
        onClick={onSettingsClick}
        className="flex flex-col items-center gap-1 hover:opacity-80 transition-opacity"
      >
        <div className="w-12 h-12 flex items-center justify-center">
          <Settings className="h-8 w-8 text-white/80" />
        </div>
        <span className="text-[9px] font-bold text-white">
          {t("status.settings")}
        </span>
      </button>
    </div>
  );
}
