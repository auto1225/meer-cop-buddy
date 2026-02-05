import { Shield, Wifi, Camera } from "lucide-react";

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
  const icons = [
    { 
      icon: Shield, 
      label: "MeerCOP", 
      active: meercopStatus,
      emoji: "😎",
    },
    { 
      icon: Wifi, 
      label: "Network", 
      active: networkStatus,
      emoji: "😊",
    },
    { 
      icon: Camera, 
      label: "Camera", 
      active: cameraStatus,
      emoji: "😀",
    },
  ];

  return (
    <div className="flex justify-center items-center gap-8 px-4 py-2">
      {icons.map((item, index) => (
        <div key={index} className="flex flex-col items-center gap-1">
          {/* Icon with emoji face */}
          <div className="relative">
            <div className={`
              w-10 h-10 rounded-lg flex items-center justify-center 
              transition-all duration-300
              ${item.active 
                ? 'bg-secondary shadow-md' 
                : 'bg-white/30'
              }
            `}>
              <div className="relative flex flex-col items-center">
                <item.icon className={`h-5 w-5 ${item.active ? 'text-primary' : 'text-foreground/40'}`} />
                <span className="text-[10px] mt-[-2px]">{item.emoji}</span>
              </div>
            </div>
          </div>
          
          {/* Label */}
          <span className={`text-[9px] font-bold ${item.active ? 'text-foreground' : 'text-foreground/50'}`}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
