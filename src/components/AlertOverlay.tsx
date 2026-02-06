import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { X } from "lucide-react";
import meercopAlert from "@/assets/meercop-alert.png";

interface AlertOverlayProps {
  isActive: boolean;
  onDismiss: () => void;
  eventType?: string;
}

export function AlertOverlay({ isActive, onDismiss, eventType }: AlertOverlayProps) {
  const [isFlashing, setIsFlashing] = useState(false);

  useEffect(() => {
    if (isActive) {
      // Start flashing effect
      const interval = setInterval(() => {
        setIsFlashing(prev => !prev);
      }, 300);
      
      return () => clearInterval(interval);
    } else {
      setIsFlashing(false);
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-colors duration-150 ${
        isFlashing ? "bg-destructive/90" : "bg-destructive/70"
      }`}
    >
      {/* Dismiss button - tabIndex -1 prevents spacebar activation */}
      <Button
        variant="ghost"
        size="icon"
        onClick={onDismiss}
        tabIndex={-1}
        className="absolute top-4 right-4 text-white hover:bg-white/20 h-10 w-10"
      >
        <X className="h-6 w-6" />
      </Button>
      
      {/* Alert mascot */}
      <img 
        src={meercopAlert} 
        alt="Alert!" 
        className="h-48 object-contain animate-bounce drop-shadow-2xl"
      />
      
      {/* Alert text */}
      <div className="mt-6 text-center">
        <h2 className="text-3xl font-black text-white mb-2">
          ⚠️ 경보 발생! ⚠️
        </h2>
        <p className="text-white/90 text-lg">
          {eventType === "keyboard" && "키보드 입력이 감지되었습니다!"}
          {eventType === "mouse" && "마우스 움직임이 감지되었습니다!"}
          {eventType === "usb" && "USB 장치 변경이 감지되었습니다!"}
          {eventType === "lid" && "노트북 덮개 변화가 감지되었습니다!"}
          {!eventType && "움직임이 감지되었습니다!"}
        </p>
      </div>
      
      {/* Stop button - tabIndex -1 prevents auto-focus from spacebar */}
      <Button
        onClick={onDismiss}
        tabIndex={-1}
        className="mt-8 bg-white text-destructive hover:bg-white/90 font-bold text-lg px-8 py-6"
      >
        경보 해제
      </Button>
    </div>
  );
}
