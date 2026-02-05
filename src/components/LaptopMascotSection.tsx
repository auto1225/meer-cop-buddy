import meercopMascot from "@/assets/meercop-mascot.png";
import meercopWatching from "@/assets/meercop-watching.png";

interface LaptopMascotSectionProps {
  isMonitoring: boolean;
}

export function LaptopMascotSection({ isMonitoring }: LaptopMascotSectionProps) {
  return (
    <div className="relative flex-1 flex items-end justify-center overflow-hidden">
      {/* Ground/Floor */}
      <div className="absolute bottom-0 left-0 right-0 h-8 ground" />
      
      {/* Mascot */}
      <div className="relative z-10 mb-0">
        <img 
          src={isMonitoring ? meercopWatching : meercopMascot}
          alt="MeerCOP Mascot"
          className="h-36 object-contain drop-shadow-xl transition-all duration-500"
        />
      </div>
    </div>
  );
}
