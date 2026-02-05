import { useEffect } from "react";
import { X, Camera, Video, Loader2, Radio, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import { useWebRTCBroadcaster } from "@/hooks/useWebRTCBroadcaster";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCameraStatusChange: (isAvailable: boolean) => void;
  deviceId?: string;
}

export function CameraModal({ isOpen, onClose, onCameraStatusChange, deviceId }: CameraModalProps) {
  const {
    videoRef,
    canvasRef,
    stream,
    snapshot,
    error,
    isStarted,
    isLoading,
    startCamera,
    reset,
    takeSnapshot,
    downloadSnapshot,
    clearSnapshot,
  } = useCamera({ onStatusChange: onCameraStatusChange });

  const {
    isBroadcasting,
    viewerCount,
    startBroadcasting,
    stopBroadcasting,
  } = useWebRTCBroadcaster({ deviceId: deviceId || "" });

  // Start WebRTC broadcasting when camera is active
  useEffect(() => {
    if (stream && deviceId && !isBroadcasting) {
      startBroadcasting(stream);
    }
  }, [stream, deviceId, isBroadcasting, startBroadcasting]);

  // Stop broadcasting when modal closes or camera stops
  useEffect(() => {
    if (!isOpen || !stream) {
      stopBroadcasting();
    }
  }, [isOpen, stream, stopBroadcasting]);

  useEffect(() => {
    if (!isOpen) reset();
  }, [isOpen, reset]);

  const handleClose = () => {
    stopBroadcasting();
    reset();
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 bg-black/70 z-50 flex items-center justify-center p-4">
      <div className="bg-primary rounded-2xl overflow-hidden max-w-md w-full">
        <div className="flex items-center justify-between p-4 border-b border-white/20">
          <div className="flex items-center gap-2">
            <h2 className="font-bold text-lg text-white">카메라</h2>
            {isBroadcasting && (
              <div className="flex items-center gap-1 bg-red-500/20 px-2 py-0.5 rounded-full">
                <Radio className="w-3 h-3 text-red-400 animate-pulse" />
                <span className="text-[10px] text-red-400 font-bold">LIVE</span>
              </div>
            )}
            {viewerCount > 0 && (
              <div className="flex items-center gap-1 bg-green-500/20 px-2 py-0.5 rounded-full">
                <Users className="w-3 h-3 text-green-400" />
                <span className="text-[10px] text-green-400 font-bold">{viewerCount}</span>
              </div>
            )}
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={handleClose}
            className="text-white hover:bg-white/20"
          >
            <X className="w-5 h-5" />
          </Button>
        </div>

        <div className="p-4 space-y-4">
          {!isStarted ? (
            <div className="aspect-video bg-black/50 rounded-xl flex flex-col items-center justify-center gap-4">
              {isLoading ? (
                <>
                  <Loader2 className="w-12 h-12 text-white/50 animate-spin" />
                  <p className="text-white/70 text-center">카메라 연결 중...</p>
                </>
              ) : (
                <>
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
                </>
              )}
            </div>
          ) : error ? (
            <div className="aspect-video bg-black/50 rounded-xl flex flex-col items-center justify-center gap-4 p-4">
              <p className="text-white/70 text-center whitespace-pre-line text-sm">{error}</p>
              <Button
                onClick={startCamera}
                disabled={isLoading}
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                {isLoading ? <Loader2 className="w-4 h-4 mr-2 animate-spin" /> : null}
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
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-xl bg-black aspect-video object-cover"
                />
                {isBroadcasting && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 px-2 py-1 rounded">
                    <div className="w-2 h-2 bg-red-500 rounded-full animate-pulse" />
                    <span className="text-[10px] text-white font-bold">
                      {viewerCount > 0 ? `${viewerCount}명 시청 중` : "WebRTC 대기 중"}
                    </span>
                  </div>
                )}
              </div>
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
