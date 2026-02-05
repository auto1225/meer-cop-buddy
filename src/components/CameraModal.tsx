import { useState, useRef, useEffect } from "react";
import { X, Camera, Video } from "lucide-react";
import { Button } from "@/components/ui/button";

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  onCameraStatusChange: (isAvailable: boolean) => void;
}

export function CameraModal({ isOpen, onClose, onCameraStatusChange }: CameraModalProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [availableDevices, setAvailableDevices] = useState<MediaDeviceInfo[]>([]);

  // Cleanup on close
  useEffect(() => {
    if (!isOpen) {
      stopCamera();
      setIsStarted(false);
      setSnapshot(null);
      setError(null);
    }
  }, [isOpen]);

  // CRITICAL: getUserMedia must be first async call in click handler
  const handleStartCamera = async () => {
    setError(null);
    
    try {
      // Request camera FIRST before any state updates
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 }
        },
        audio: false
      });
      
      console.log("Camera stream obtained:", mediaStream.getVideoTracks().map(t => t.label));
      
      setStream(mediaStream);
      setIsStarted(true);
      onCameraStatusChange(true);
      
      // Set srcObject after state update
      setTimeout(() => {
        if (videoRef.current) {
          videoRef.current.srcObject = mediaStream;
        }
      }, 0);
    } catch (err: any) {
      console.error("Camera error:", err);
      setIsStarted(true);
      onCameraStatusChange(false);
      
      if (err.name === "NotAllowedError") {
        setError("카메라 권한이 거부되었습니다.\n\n브라우저 설정에서 권한을 허용해주세요.");
      } else if (err.name === "NotFoundError") {
        setError("카메라를 찾을 수 없습니다.\n\nUSB 카메라가 연결되어 있는지 확인해주세요.");
      } else if (err.name === "NotReadableError") {
        setError("카메라가 이미 사용 중입니다.\n\n다른 앱에서 카메라를 사용하고 있는지 확인해주세요.");
      } else {
        setError(`카메라 오류: ${err.name}\n${err.message || "접근할 수 없습니다."}`);
      }
    }
  };

  const stopCamera = () => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  };

  const takeSnapshot = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      
      if (context) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0, video.videoWidth, video.videoHeight);
        
        const dataUrl = canvas.toDataURL("image/png");
        setSnapshot(dataUrl);
      }
    }
  };

  const downloadSnapshot = () => {
    if (snapshot) {
      const link = document.createElement("a");
      link.href = snapshot;
      link.download = `snapshot_${Date.now()}.png`;
      link.click();
    }
  };

  const handleClose = () => {
    stopCamera();
    setSnapshot(null);
    setError(null);
    setIsStarted(false);
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
            // Initial state - show button to start camera (direct user gesture)
            <div className="aspect-video bg-black/50 rounded-xl flex flex-col items-center justify-center gap-4">
              <Video className="w-12 h-12 text-white/50" />
              <p className="text-white/70 text-center px-4">
                카메라를 시작하려면 아래 버튼을 눌러주세요
              </p>
              <Button
                onClick={handleStartCamera}
                className="bg-secondary hover:bg-secondary/90 text-secondary-foreground font-bold"
              >
                <Camera className="w-4 h-4 mr-2" />
                카메라 시작
              </Button>
            </div>
          ) : error ? (
            <div className="aspect-video bg-black/50 rounded-xl flex flex-col items-center justify-center gap-4">
              <p className="text-white/70 text-center px-4">{error}</p>
              <Button
                onClick={handleStartCamera}
                variant="outline"
                className="bg-white/10 border-white/20 text-white hover:bg-white/20"
              >
                다시 시도
              </Button>
            </div>
          ) : snapshot ? (
            <div className="space-y-4">
              <img 
                src={snapshot} 
                alt="Snapshot" 
                className="w-full rounded-xl"
              />
              <div className="flex gap-2">
                <Button
                  onClick={() => setSnapshot(null)}
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

        {/* Hidden canvas for snapshot */}
        <canvas ref={canvasRef} className="hidden" />
      </div>
    </div>
  );
}
