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
      const interval = setInterval(() => {
        setIsFlashing(prev => !prev);
      }, 500);
      return () => clearInterval(interval);
    } else {
      setIsFlashing(false);
    }
  }, [isActive]);

  if (!isActive) return null;

  return (
    <div 
      className={`fixed inset-0 z-50 flex flex-col items-center justify-center transition-colors duration-300 ${
        isFlashing ? "bg-destructive/85" : "bg-destructive/70"
      }`}
      style={{ backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)" }}
    >
      {/* Dismiss button */}
      <button
        onClick={onDismiss}
        tabIndex={-1}
        className="absolute top-5 right-5 w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center text-white/80 hover:bg-white/25 transition-colors"
      >
        <X className="h-5 w-5" />
      </button>
      
      {/* Alert mascot */}
      <img 
        src={meercopAlert} 
        alt="Alert!" 
        className="h-44 object-contain animate-bounce drop-shadow-2xl"
      />
      
      {/* Alert text card - glassmorphism */}
      <div className="mt-6 text-center px-4">
        <div className="bg-white/10 backdrop-blur-xl rounded-2xl border border-white/20 px-8 py-5 shadow-lg">
          <h2 className="text-3xl font-black text-white mb-2 drop-shadow-md">
            ⚠️ 경보 발생! ⚠️
          </h2>
          <p className="text-white/90 text-lg font-semibold drop-shadow-sm">
            {eventType === "keyboard" && "키보드 입력이 감지되었습니다!"}
            {eventType === "mouse" && "마우스 움직임이 감지되었습니다!"}
            {eventType === "usb" && "USB 장치 변경이 감지되었습니다!"}
            {eventType === "lid" && "노트북 덮개 변화가 감지되었습니다!"}
            {!eventType && "움직임이 감지되었습니다!"}
          </p>
        </div>
      </div>
      
      {/* Stop button - glassmorphism style */}
      <Button
        onClick={onDismiss}
        tabIndex={-1}
        className="mt-8 bg-white/90 backdrop-blur-sm text-destructive hover:bg-white font-extrabold text-lg px-10 py-6 rounded-full border border-white/50 shadow-xl transition-all hover:scale-105"
      >
        경보 해제
      </Button>
    </div>
  );
}
