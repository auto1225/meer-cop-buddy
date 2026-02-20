import { X, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTranslation } from "@/lib/i18n";
import type { Alert } from "@/hooks/useAlerts";

interface AlertScreenProps {
  alert: Alert;
  onStop: () => void;
}

const alertTypeI18nKeys: Record<string, string> = {
  alert_shock: "notification.alertShock",
  alert_mouse: "notification.alertMouse",
  alert_keyboard: "notification.alertKeyboard",
  alert_movement: "notification.alertMovement",
};

export function AlertScreen({ alert, onStop }: AlertScreenProps) {
  const { t } = useTranslation();
  const alertLabel = alertTypeI18nKeys[alert.event_type]
    ? t(alertTypeI18nKeys[alert.event_type])
    : t("alertScreen.alertOccurred");
  const images = (alert.event_data?.images as string[]) || [];
  const message = alert.event_data?.message || t("alertScreen.suspiciousActivity");

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
                alt={`${t("alertScreen.capture")} ${idx + 1}`} 
                className="w-full h-full object-cover"
              />
              <span className="absolute bottom-0 left-0 text-[8px] text-white bg-black/50 px-1">
                -{idx + 2}s
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
          {alertLabel}{t("alertScreen.confirmed")}
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
        {t("alertScreen.dismiss")}
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
