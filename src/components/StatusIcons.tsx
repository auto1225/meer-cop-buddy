import { Laptop, Shield, Wifi, Camera, Check } from "lucide-react";

interface StatusIconsProps {
  laptopStatus: boolean;
  meercopStatus: boolean;
  networkStatus: boolean;
  cameraStatus: boolean;
  batteryLevel?: number;
}

export function StatusIcons({ 
  laptopStatus, 
  meercopStatus, 
  networkStatus, 
  cameraStatus,
  batteryLevel = 100
}: StatusIconsProps) {
  const icons = [
    { icon: Laptop, label: "Laptop", active: laptopStatus, showBattery: true },
    { icon: Shield, label: "MeerCOP", active: meercopStatus, showBattery: false },
    { icon: Wifi, label: "Network", active: networkStatus, showBattery: false },
    { icon: Camera, label: "Camera", active: cameraStatus, showBattery: false },
  ];

  return (
    <div className="flex justify-center items-end gap-6 px-4 py-3">
      {icons.map((item, index) => (
        <div key={index} className="flex flex-col items-center gap-1.5 w-16">
          {/* Battery indicator - only for Laptop */}
          <div className="h-4 flex items-center justify-center">
            {item.showBattery && (
              <span className="text-[11px] font-bold text-foreground">
                {batteryLevel}%🔋
              </span>
            )}
          </div>
          
          {/* Icon with background */}
          <div className="relative">
            <div className={`w-12 h-12 rounded-full flex items-center justify-center ${item.active ? 'bg-white/25' : 'bg-white/10'} transition-colors`}>
              <item.icon className={`h-6 w-6 ${item.active ? 'text-foreground' : 'text-foreground/40'}`} />
            </div>
            
            {/* Check badge */}
            {item.active && (
              <div className="absolute -bottom-0.5 -right-0.5 w-4 h-4 bg-secondary rounded-full flex items-center justify-center shadow-sm">
                <Check className="h-2.5 w-2.5 text-foreground stroke-[3]" />
              </div>
            )}
          </div>
          
          {/* Label */}
          <span className={`text-[11px] font-bold ${item.active ? 'text-foreground' : 'text-foreground/40'}`}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
