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
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div className="w-[92%] max-w-md overflow-hidden rounded-2xl border border-white/20 bg-white/10 backdrop-blur-xl shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5 border-b border-white/15">
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-lg bg-accent/20 flex items-center justify-center">
              <Camera className="h-4 w-4 text-accent" />
            </div>
            <span className="font-extrabold text-sm text-white drop-shadow">카메라</span>
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
            className="h-7 w-7 text-white/70 hover:bg-white/15 rounded-lg"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Content - minimal padding for max video area */}
        <div className="p-2">
          {!isStarted ? (
            <div className="aspect-video rounded-xl bg-black/30 flex flex-col items-center justify-center gap-3">
              {isLoading ? (
                <>
                  <Loader2 className="w-10 h-10 text-accent animate-spin" />
                  <p className="text-white/70 text-sm font-bold">카메라 연결 중...</p>
                </>
              ) : (
                <>
                  <Video className="w-10 h-10 text-white/40" />
                  <p className="text-white/60 text-sm font-semibold text-center px-4">
                    카메라를 시작하려면 아래 버튼을 눌러주세요
                  </p>
                  <Button
                    onClick={startCamera}
                    className="bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-xs px-4 py-2"
                  >
                    <Camera className="w-3.5 h-3.5 mr-1.5" />
                    카메라 시작
                  </Button>
                </>
              )}
            </div>
          ) : error ? (
            <div className="aspect-video rounded-xl bg-black/30 flex flex-col items-center justify-center gap-3 p-4">
              <p className="text-white/70 text-center whitespace-pre-line text-sm font-semibold">{error}</p>
              <Button
                onClick={startCamera}
                disabled={isLoading}
                className="bg-white/10 border border-white/20 text-white hover:bg-white/20 font-bold text-xs"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                다시 시도
              </Button>
            </div>
          ) : snapshot ? (
            <div className="space-y-2">
              <img src={snapshot} alt="Snapshot" className="w-full rounded-xl" />
              <div className="flex gap-2">
                <Button
                  onClick={clearSnapshot}
                  className="flex-1 bg-white/10 border border-white/20 text-white hover:bg-white/20 font-bold text-xs"
                >
                  다시 찍기
                </Button>
                <Button
                  onClick={downloadSnapshot}
                  className="flex-1 bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-xs"
                >
                  저장하기
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="relative">
                <video
                  ref={videoRef}
                  autoPlay
                  playsInline
                  muted
                  className="w-full rounded-xl bg-black aspect-video object-cover"
                />
                {isBroadcasting && (
                  <div className="absolute top-2 right-2 flex items-center gap-1 bg-black/60 backdrop-blur-sm px-2 py-1 rounded-lg">
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
                className="w-full bg-accent hover:bg-accent/90 text-accent-foreground font-bold text-xs py-2"
              >
                <Camera className="w-3.5 h-3.5 mr-1.5" />
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
