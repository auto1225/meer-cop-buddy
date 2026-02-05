import { Activity, AlertCircle, CheckCircle, Info, Clock } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { formatDistanceToNow } from "date-fns";
import { ko } from "date-fns/locale";

interface ActivityLogEntry {
  id: string;
  device_id: string;
  event_type: string;
  event_data: Record<string, unknown>;
  created_at: string;
  devices?: {
    device_name: string;
  };
}

interface ActivityLogProps {
  logs: ActivityLogEntry[];
  isLoading?: boolean;
}

export function ActivityLog({ logs, isLoading }: ActivityLogProps) {
  const getEventIcon = (eventType: string) => {
    switch (eventType) {
      case "connected":
        return <CheckCircle className="h-4 w-4 text-success" />;
      case "disconnected":
        return <AlertCircle className="h-4 w-4 text-warning" />;
      case "error":
        return <AlertCircle className="h-4 w-4 text-destructive" />;
      default:
        return <Info className="h-4 w-4 text-primary" />;
    }
  };

  const getEventLabel = (eventType: string) => {
    switch (eventType) {
      case "connected":
        return "연결됨";
      case "disconnected":
        return "연결 해제";
      case "battery_update":
        return "배터리 업데이트";
      case "location_update":
        return "위치 업데이트";
      case "error":
        return "오류 발생";
      default:
        return eventType;
    }
  };

  return (
    <Card className="glass-card fade-in h-full">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Activity className="h-5 w-5 text-primary" />
          활동 로그
        </CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-[400px] pr-4">
          {isLoading ? (
            <div className="flex items-center justify-center h-full">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
            </div>
          ) : logs.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-full text-muted-foreground">
              <Activity className="h-12 w-12 mb-4 opacity-50" />
              <p>아직 활동 기록이 없습니다</p>
            </div>
          ) : (
            <div className="space-y-4">
              {logs.map((log) => (
                <div
                  key={log.id}
                  className="flex items-start gap-3 p-3 rounded-lg bg-secondary/30 hover:bg-secondary/50 transition-colors"
                >
                  <div className="mt-0.5">{getEventIcon(log.event_type)}</div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-2">
                      <p className="text-sm font-medium text-foreground truncate">
                        {log.devices?.device_name || "알 수 없는 디바이스"}
                      </p>
                      <div className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
                        <Clock className="h-3 w-3" />
                        {formatDistanceToNow(new Date(log.created_at), {
                          addSuffix: true,
                          locale: ko,
                        })}
                      </div>
                    </div>
                    <p className="text-sm text-muted-foreground mt-0.5">
                      {getEventLabel(log.event_type)}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
