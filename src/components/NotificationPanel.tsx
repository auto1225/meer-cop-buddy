import { X, ShieldAlert, Laptop, Wifi, WifiOff, BatteryLow, Moon, Sun } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ScrollArea } from "@/components/ui/scroll-area";
import type { Alert } from "@/hooks/useAlerts";

interface ActivityLog {
  id: string;
  device_id: string;
  event_type: string;
  event_data: Record<string, unknown> | null;
  created_at: string;
}

interface NotificationPanelProps {
  isOpen: boolean;
  onClose: () => void;
  logs: ActivityLog[];
  deviceName?: string;
}

const eventTypeIcons: Record<string, React.ReactNode> = {
  connected: <Wifi className="w-4 h-4 text-success" />,
  disconnected: <WifiOff className="w-4 h-4 text-muted-foreground" />,
  alert_shock: <ShieldAlert className="w-4 h-4 text-destructive" />,
  alert_mouse: <ShieldAlert className="w-4 h-4 text-destructive" />,
  alert_keyboard: <ShieldAlert className="w-4 h-4 text-destructive" />,
  alert_movement: <ShieldAlert className="w-4 h-4 text-destructive" />,
  alert_stopped: <ShieldAlert className="w-4 h-4 text-warning" />,
  dark_mode_on: <Moon className="w-4 h-4 text-primary" />,
  dark_mode_off: <Sun className="w-4 h-4 text-secondary" />,
  low_battery: <BatteryLow className="w-4 h-4 text-warning" />,
};

const eventTypeLabels: Record<string, string> = {
  connected: "연결됨",
  disconnected: "연결 해제",
  alert_shock: "충격 감지",
  alert_mouse: "마우스 움직임",
  alert_keyboard: "키보드 입력",
  alert_movement: "이동 감지",
  alert_stopped: "경보 해제",
  dark_mode_on: "다크 모드 ON",
  dark_mode_off: "다크 모드 OFF",
  low_battery: "배터리 부족",
};

function formatTime(dateStr: string): string {
  const date = new Date(dateStr);
  return date.toLocaleString("ko-KR", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

export function NotificationPanel({
  isOpen,
  onClose,
  logs,
  deviceName = "Laptop1",
}: NotificationPanelProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="absolute inset-0 z-40 bg-black/50"
        onClick={onClose}
      />

      {/* Panel */}
      <div className="absolute right-0 top-0 bottom-0 w-[85%] max-w-[320px] z-50 bg-white flex flex-col animate-slide-in-right rounded-l-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between p-4 bg-primary text-primary-foreground">
          <div className="flex items-center gap-2">
            <Laptop className="w-5 h-5" />
            <h2 className="font-bold text-sm">{deviceName} 알림</h2>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onClose}
            className="text-white hover:bg-white/20 h-8 w-8"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Logs */}
        <ScrollArea className="flex-1">
          <div className="p-2">
            {logs.length === 0 ? (
              <p className="text-center text-muted-foreground text-sm py-8">
                알림이 없습니다.
              </p>
            ) : (
              logs.map((log) => (
                <div 
                  key={log.id}
                  className="flex items-start gap-3 p-3 border-b border-border/50 hover:bg-muted/30 transition-colors"
                >
                  <div className="w-8 h-8 rounded-full bg-muted flex items-center justify-center flex-shrink-0">
                    {eventTypeIcons[log.event_type] || <Laptop className="w-4 h-4" />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold text-foreground">
                      {eventTypeLabels[log.event_type] || log.event_type}
                    </p>
                    <p className="text-[10px] text-muted-foreground mt-0.5">
                      {formatTime(log.created_at)}
                    </p>
                    {log.event_data && (log.event_data as { message?: string }).message && (
                      <p className="text-[10px] text-muted-foreground mt-1">
                        {(log.event_data as { message?: string }).message}
                      </p>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </div>

      <style>{`
        @keyframes slide-in-right {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right {
          animation: slide-in-right 0.2s ease-out;
        }
      `}</style>
    </>
  );
}
