import meercopWatching from "@/assets/meercop-watching.png";

interface MascotSectionProps {
  isMonitoring: boolean;
}

export function MascotSection({ isMonitoring }: MascotSectionProps) {
  return (
    <div className="absolute bottom-16 left-0 right-0">
      {/* Ground */}
      <div className="ground h-12 mx-4" />
      
      {/* Mascot */}
      <div className="absolute bottom-8 left-1/2 transform -translate-x-1/2">
        <img 
          src={meercopWatching} 
          alt="MeerCOP 마스코트" 
          className={`h-24 w-auto drop-shadow-2xl ${isMonitoring ? 'float-animation' : 'opacity-50 grayscale'}`}
        />
      </div>
    </div>
  );
}
