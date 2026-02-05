import meercopIdle from "@/assets/meercop-idle.png";
import meercopWatching from "@/assets/meercop-watching.png";

interface LaptopMascotSectionProps {
  isMonitoring: boolean;
}

export function LaptopMascotSection({ isMonitoring }: LaptopMascotSectionProps) {
  return (
    <div className="relative flex-1 flex flex-col items-center justify-end overflow-hidden">
      {/* Speech Bubble - only show when not monitoring */}
      {!isMonitoring && (
        <div className="relative mb-2 z-20">
          <div className="bg-white rounded-2xl px-4 py-2 shadow-lg relative">
            <p className="text-foreground font-bold text-[11px] text-center whitespace-nowrap">
              스마트폰에서 감시를 <span className="text-success font-black">ON</span>해 주세요.
            </p>
            {/* Speech bubble tail */}
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white" />
          </div>
        </div>
      )}
      
      {/* Mascot - positioned to stand on top of the rock */}
      <div className="relative z-10 mb-[22%]">
        <img 
          src={isMonitoring ? meercopWatching : meercopIdle}
          alt="MeerCOP Mascot"
          className="h-40 object-contain drop-shadow-xl transition-all duration-500"
        />
      </div>
    </div>
  );
}
