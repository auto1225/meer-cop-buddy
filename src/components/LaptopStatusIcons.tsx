import { Shield, Wifi, Camera, Check, X } from "lucide-react";

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
      customIcon: true,
    },
    { icon: Wifi, label: "Network", active: networkStatus },
    { icon: Camera, label: "Camera", active: cameraStatus },
  ];

  return (
    <div className="flex justify-center items-center gap-8 px-6 py-4">
      {icons.map((item, index) => (
        <div key={index} className="flex flex-col items-center gap-2">
          {/* Icon with background */}
          <div className="relative">
            <div className={`
              w-14 h-14 rounded-full flex items-center justify-center 
              transition-all duration-300
              ${item.active 
                ? 'bg-secondary shadow-lg' 
                : 'bg-white/20'
              }
            `}>
              {item.customIcon ? (
                // Custom MeerCOP icon (shield with M)
                <div className="relative">
                  <Shield className={`h-7 w-7 ${item.active ? 'text-primary' : 'text-foreground/40'}`} />
                  <span className={`absolute inset-0 flex items-center justify-center text-xs font-black ${item.active ? 'text-primary' : 'text-foreground/40'}`}>
                    M
                  </span>
                </div>
              ) : (
                <item.icon className={`h-7 w-7 ${item.active ? 'text-primary' : 'text-foreground/40'}`} />
              )}
            </div>
            
            {/* Status badge */}
            <div className={`
              absolute -bottom-1 -right-1 w-5 h-5 rounded-full 
              flex items-center justify-center shadow-md
              ${item.active ? 'bg-secondary' : 'bg-gray-400'}
            `}>
              {item.active ? (
                <Check className="h-3 w-3 text-primary stroke-[3]" />
              ) : (
                <X className="h-3 w-3 text-white stroke-[3]" />
              )}
            </div>
          </div>
          
          {/* Label */}
          <span className={`text-xs font-bold ${item.active ? 'text-foreground' : 'text-foreground/40'}`}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
