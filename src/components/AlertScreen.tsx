import { X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { Alert } from "@/hooks/useAlerts";

interface AlertScreenProps {
  alert: Alert;
  onStop: () => void;
}

const alertTypeLabels: Record<string, string> = {
  alert_shock: "충격 감지",
  alert_mouse: "마우스 움직임 감지",
  alert_keyboard: "키보드 입력 감지",
  alert_movement: "이동 감지",
};

export function AlertScreen({ alert, onStop }: AlertScreenProps) {
  const alertLabel = alertTypeLabels[alert.event_type] || "경보 발생";
  const images = (alert.event_data?.images as string[]) || [];
  const message = alert.event_data?.message || "노트북에서 의심스러운 활동이 감지되었습니다.";

  return (
    <div className="absolute inset-0 z-50 bg-destructive flex flex-col items-center justify-center animate-pulse-alert">
      {/* Camera capture grid */}
      {images.length > 0 && (
        <div className="flex gap-2 mb-4">
          {images.slice(0, 3).map((img, idx) => (
            <div 
              key={idx}
              className="w-20 h-16 bg-black/50 rounded-lg overflow-hidden border-2 border-white/50"
            >
              <img 
                src={img} 
                alt={`캡처 ${idx + 1}`} 
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0 left-0 text-[8px] text-white bg-black/50 px-1">
                -{idx + 2}초
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Alert icon */}
      <div className="w-16 h-16 bg-white/20 rounded-full flex items-center justify-center mb-4 animate-bounce">
        <ShieldAlert className="w-8 h-8 text-white" />
      </div>

      {/* Alert message */}
      <div className="bg-white/90 rounded-xl px-6 py-3 mx-4 mb-6 text-center">
        <p className="text-destructive font-bold text-sm">
          {alertLabel}되었습니다. 확인해주세요.
        </p>
        <p className="text-xs text-muted-foreground mt-1">
          {message}
        </p>
      </div>

      {/* Stop button */}
      <Button
        onClick={onStop}
        className="bg-destructive-foreground text-destructive hover:bg-white/90 font-bold px-8 py-3 rounded-full text-sm"
      >
        <X className="w-4 h-4 mr-2" />
        경보 해제
      </Button>

      <style>{`
        @keyframes pulse-alert {
          0%, 100% { background-color: hsl(0 72% 51%); }
          50% { background-color: hsl(0 72% 40%); }
        }
        .animate-pulse-alert {
          animation: pulse-alert 1s ease-in-out infinite;
        }
      `}</style>
    </div>
  );
}
