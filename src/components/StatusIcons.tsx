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
    { icon: Laptop, label: "Laptop", active: laptopStatus, battery: batteryLevel },
    { icon: Shield, label: "MeerCOP", active: meercopStatus },
    { icon: Wifi, label: "Network", active: networkStatus },
    { icon: Camera, label: "Camera", active: cameraStatus },
  ];

  return (
    <div className="flex justify-center gap-4 px-2 py-2">
      {icons.map((item, index) => (
        <div key={index} className="flex flex-col items-center gap-1">
          {item.battery !== undefined && (
            <span className="text-[10px] font-bold text-foreground/80">
              {item.battery}%🔋
            </span>
          )}
          <div className="relative">
            <div className={`p-2 rounded-lg ${item.active ? 'bg-white/30' : 'bg-white/10'} transition-colors`}>
              <item.icon className={`h-5 w-5 ${item.active ? 'text-foreground' : 'text-foreground/50'}`} />
            </div>
            {item.active && (
              <div className="absolute -bottom-0.5 -right-0.5 w-3.5 h-3.5 bg-secondary rounded-full flex items-center justify-center pulse-check">
                <Check className="h-2 w-2 text-success-foreground stroke-[3]" />
              </div>
            )}
          </div>
          <span className={`text-[10px] font-bold ${item.active ? 'text-foreground' : 'text-foreground/50'}`}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
