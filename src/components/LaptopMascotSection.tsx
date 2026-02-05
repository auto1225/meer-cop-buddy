import meercopMascot from "@/assets/meercop-mascot.png";
import meercopWatching from "@/assets/meercop-watching.png";

interface LaptopMascotSectionProps {
  isMonitoring: boolean;
}

export function LaptopMascotSection({ isMonitoring }: LaptopMascotSectionProps) {
  return (
    <div className="relative flex-1 flex items-end justify-center overflow-hidden">
      {/* Mascot - positioned to stand on the rock in background image */}
      <div className="relative z-10 mb-[15%]">
        <img 
          src={isMonitoring ? meercopWatching : meercopMascot}
          alt="MeerCOP Mascot"
          className="h-32 object-contain drop-shadow-xl transition-all duration-500"
        />
      </div>
    </div>
  );
}
