import { Laptop, Battery, Wifi, WifiOff, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface Device {
  id: string;
  device_id: string;
  device_name: string;
  device_type: string;
  status: string;
  last_seen_at: string | null;
  battery_level: number | null;
  is_charging: boolean;
  ip_address: string | null;
  os_info: string | null;
  app_version: string | null;
}

interface DeviceCardProps {
  device: Device;
}

export function DeviceCard({ device }: DeviceCardProps) {
  const isOnline = device.status === "online";
  
  const getStatusBadge = () => {
    if (isOnline) {
      return (
        <Badge className="bg-success/20 text-success border-success/30 hover:bg-success/30">
          <span className="mr-1.5 h-2 w-2 rounded-full bg-success animate-pulse-glow" />
          온라인
        </Badge>
      );
    }
    return (
      <Badge variant="secondary" className="bg-muted text-muted-foreground border-border">
        <span className="mr-1.5 h-2 w-2 rounded-full bg-muted-foreground" />
        오프라인
      </Badge>
    );
  };

  const getBatteryColor = () => {
    if (!device.battery_level) return "text-muted-foreground";
    if (device.battery_level > 50) return "text-success";
    if (device.battery_level > 20) return "text-warning";
    return "text-destructive";
  };

  const formatLastSeen = () => {
    if (!device.last_seen_at) return "알 수 없음";
    return formatDistanceToNow(new Date(device.last_seen_at), {
      addSuffix: true,
      locale: ko,
    });
  };

  return (
    <Card className="glass-card fade-in hover:border-primary/30 transition-all duration-300 group">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-3">
        <div className="flex items-center gap-3">
          <div className="p-2.5 rounded-xl bg-primary/10 group-hover:bg-primary/20 transition-colors">
            <Laptop className="h-5 w-5 text-primary" />
          </div>
          <div>
            <CardTitle className="text-lg font-semibold text-foreground">
              {device.device_name}
            </CardTitle>
            <p className="text-xs text-muted-foreground font-mono mt-0.5">
              {device.device_id}
            </p>
          </div>
        </div>
        {getStatusBadge()}
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="flex items-center gap-2">
            <Battery className={`h-4 w-4 ${getBatteryColor()}`} />
            <span className="text-sm text-foreground">
              {device.battery_level !== null ? `${device.battery_level}%` : "-"}
              {device.is_charging && (
                <span className="text-primary ml-1">⚡</span>
              )}
            </span>
          </div>
          <div className="flex items-center gap-2">
            {isOnline ? (
              <Wifi className="h-4 w-4 text-success" />
            ) : (
              <WifiOff className="h-4 w-4 text-muted-foreground" />
            )}
            <span className="text-sm text-muted-foreground font-mono">
              {device.ip_address || "-"}
            </span>
          </div>
        </div>

        <div className="pt-3 border-t border-border/50">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            <span>마지막 연결: {formatLastSeen()}</span>
          </div>
          {device.os_info && (
            <p className="text-xs text-muted-foreground mt-1.5 font-mono">
              {device.os_info}
            </p>
          )}
        </div>
      </CardContent>
    </Card>
  );
}
