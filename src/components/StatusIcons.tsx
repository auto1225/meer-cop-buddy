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
    <div className="flex justify-center gap-6 px-4 py-4">
      {icons.map((item, index) => (
        <div key={index} className="flex flex-col items-center gap-2">
          {item.battery !== undefined && (
            <span className="text-xs font-bold text-foreground/80">
              {item.battery}% 🔋
            </span>
          )}
          <div className="relative">
            <div className={`p-3 rounded-xl ${item.active ? 'bg-white/30' : 'bg-white/10'} transition-colors`}>
              <item.icon className={`h-8 w-8 ${item.active ? 'text-foreground' : 'text-foreground/50'}`} />
            </div>
            {item.active && (
              <div className="absolute -bottom-1 -right-1 w-5 h-5 bg-secondary rounded-full flex items-center justify-center pulse-check">
                <Check className="h-3 w-3 text-success-foreground stroke-[3]" />
              </div>
            )}
          </div>
          <span className={`text-xs font-bold ${item.active ? 'text-foreground' : 'text-foreground/50'}`}>
            {item.label}
          </span>
        </div>
      ))}
    </div>
  );
}
