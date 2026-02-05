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
    <div className="flex justify-center items-center gap-6 px-4 py-3">
      {icons.map((item, index) => (
        <div key={index} className="flex flex-col items-center gap-1.5">
          {/* Icon with background */}
          <div className="relative">
            <div className={`
              w-12 h-12 rounded-full flex items-center justify-center 
              transition-all duration-300
              ${item.active 
                ? 'bg-secondary shadow-lg' 
                : 'bg-white/20'
              }
            `}>
              {item.customIcon ? (
                // Custom MeerCOP icon (shield with M)
                <div className="relative">
                  <Shield className={`h-6 w-6 ${item.active ? 'text-primary' : 'text-foreground/40'}`} />
                  <span className={`absolute inset-0 flex items-center justify-center text-[10px] font-black ${item.active ? 'text-primary' : 'text-foreground/40'}`}>
                    M
                  </span>
                </div>
              ) : (
                <item.icon className={`h-6 w-6 ${item.active ? 'text-primary' : 'text-foreground/40'}`} />
              )}
            </div>
            
            {/* Status badge */}
            <div className={`
              absolute -bottom-0.5 -right-0.5 w-4 h-4 rounded-full 
              flex items-center justify-center shadow-md
              ${item.active ? 'bg-secondary' : 'bg-gray-400'}
            `}>
              {item.active ? (
                <Check className="h-2.5 w-2.5 text-primary stroke-[3]" />
              ) : (
                <X className="h-2.5 w-2.5 text-white stroke-[3]" />
              )}
            </div>
          </div>
          
          {/* Label */}
          <span className={`text-[10px] font-bold ${item.active ? 'text-foreground' : 'text-foreground/40'}`}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
