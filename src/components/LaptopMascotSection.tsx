import meercopIdle from "@/assets/meercop-idle.png";
import meercopMonitoring from "@/assets/meercop-monitoring.png";
import meercopAlert from "@/assets/meercop-alert.png";
import shieldCheck from "@/assets/shield-check.png";

interface LaptopMascotSectionProps {
  isMonitoring: boolean;
  isAlarming?: boolean;
}

export function LaptopMascotSection({ isMonitoring, isAlarming = false }: LaptopMascotSectionProps) {
  // Determine which mascot image to show
  const getMascotImage = () => {
    if (isAlarming) {
      return meercopAlert; // Alert state - megaphone meercat
    }
    if (isMonitoring) {
      return meercopMonitoring; // Monitoring state - binoculars meercat
    }
    return meercopIdle; // Idle state
  };

  return (
    <div className="relative flex-1 flex flex-col items-center justify-end overflow-hidden">
      {/* Speech Bubble - shows different text based on monitoring state */}
      {!isAlarming && (
        <div className="relative mb-2 z-20">
          <div className="bg-white rounded-2xl px-4 py-2 shadow-lg relative">
            <p className="text-foreground font-bold text-[11px] text-center whitespace-nowrap">
              {isMonitoring ? (
                <>미어캅이 당신의 노트북을 감시중입니다.</>
              ) : (
                <>스마트폰에서 감시를 <span className="text-success font-black">ON</span>해 주세요.</>
              )}
            </p>
            {/* Speech bubble tail */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />
          </div>
        </div>
      )}
      
      {/* Mascot - positioned to stand on top of the rock */}
      <div className="relative z-10 mb-[32%]">
        <img 
          src={getMascotImage()}
          alt="MeerCOP Mascot"
          className={`h-40 object-contain drop-shadow-xl transition-all duration-500 ${
            isAlarming ? 'animate-bounce' : ''
          }`}
        />
      </div>

      {/* MeerCOP ON Status Bar - shows when monitoring */}
      {isMonitoring && !isAlarming && (
        <div className="absolute bottom-0 left-0 right-0 z-30">
          <div className="bg-[#E8F84A] py-2 px-4 flex items-center justify-center gap-2">
            <img 
              src={shieldCheck} 
              alt="Shield" 
              className="h-5 w-5 object-contain"
            />
            <span className="font-bold text-sm text-gray-800">MeerCOP ON</span>
          </div>
        </div>
      )}
    </div>
  );
}
