import meercopMascot from "@/assets/meercop-mascot.png";
import meercopWatching from "@/assets/meercop-watching.png";

interface LaptopMascotSectionProps {
  isMonitoring: boolean;
}

export function LaptopMascotSection({ isMonitoring }: LaptopMascotSectionProps) {
  return (
    <div className="relative flex-1 flex items-end justify-center overflow-hidden">
      {/* Rocky Ground */}
      <div className="absolute bottom-0 left-0 right-0">
        {/* Main ground */}
        <div className="h-10 ground rounded-t-[100%_30px]" />
        {/* Rock details */}
        <div className="absolute bottom-2 left-1/4 w-8 h-4 bg-foreground/10 rounded-full" />
        <div className="absolute bottom-1 right-1/3 w-6 h-3 bg-foreground/20 rounded-full" />
      </div>
      
      {/* Mascot */}
      <div className="relative z-10 mb-2">
        <img 
          src={isMonitoring ? meercopWatching : meercopMascot}
          alt="MeerCOP Mascot"
          className="h-24 object-contain drop-shadow-xl transition-all duration-500"
        />
      </div>
    </div>
  );
}
