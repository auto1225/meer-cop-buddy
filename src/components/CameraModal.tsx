import { useEffect } from "react";
import { X, Camera, Video } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCameraStatusChange: (isAvailable: boolean) => void;
}

export function CameraModal({ isOpen, onClose, onCameraStatusChange }: CameraModalProps) {
  const {
    videoRef,
    canvasRef,
    stream,
    snapshot,
    error,
    isStarted,
    startCamera,
    reset,
    takeSnapshot,
    downloadSnapshot,
    clearSnapshot,
  } = useCamera({ onStatusChange: onCameraStatusChange });

  // Cleanup on close
  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  const handleClose = () => {
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-primary rounded-2xl overflow-hidden max-w-md w-full">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-white/20">
          <h2 className="font-bold text-lg text-white">카메라</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        {/* Content */}
        <div className="p-4 space-y-4">
          {!isStarted ? (
            <div className="aspect-video bg-black/50 rounded-xl flex flex-col items-center justify-center gap-4">
              <Video className="w-12 h-12 text-white/50" />
              <p className="text-white/70 text-center px-4">
                카메라를 시작하려면 아래 버튼을 눌러주세요
              </p>
              <Button
                onClick={startCamera}
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold"
              >
                <Camera className="w-4 h-4 mr-2" />
                카메라 시작
              </Button>
            </div>
          ) : error ? (
            <div className="aspect-video bg-black/50 rounded-xl flex flex-col items-center justify-center gap-4">
              <p className="text-white/70 text-center px-4 whitespace-pre-line">{error}</p>
              <Button
                onClick={startCamera}
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                다시 시도
              </Button>
            </div>
          ) : snapshot ? (
            <div className="space-y-4">
              <img src={snapshot} alt="Snapshot" className="w-full rounded-xl" />
              <div className="flex gap-2">
                <Button
                  onClick={clearSnapshot}
                  variant="outline"
                  className="flex-1 bg-white/10 border-white/20 text-white hover:bg-white/20"
                >
                  다시 찍기
                </Button>
                <Button
                  onClick={downloadSnapshot}
                  className="flex-1 bg-secondary hover:bg-secondary/90 text-secondary-foreground"
                >
                  저장하기
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-xl bg-black aspect-video"
              />
              <Button
                onClick={takeSnapshot}
                disabled={!stream}
                className="w-full bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold"
              >
                <Camera className="w-4 h-4 mr-2" />
                스냅샷 찍기
              </Button>
            </div>
          )}
        </div>

        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
