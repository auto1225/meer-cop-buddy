import { useState, useRef, useEffect, useCallback } from "react";

interface UseCameraOptions {
  onStatusChange?: (isAvailable: boolean) => void;
}

export function useCamera({ onStatusChange }: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);

  // Attach stream to video element
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  const stopCamera = useCallback(() => {
    if (stream) {
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const reset = useCallback(() => {
    stopCamera();
    setIsStarted(false);
    setSnapshot(null);
    setError(null);
  }, [stopCamera]);

  const startCamera = useCallback(async () => {
    try {
      const mediaStream = await navigator.mediaDevices.getUserMedia({ 
        video: true,
        audio: false,
      });
      
      setError(null);
      setStream(mediaStream);
      setIsStarted(true);
      onStatusChange?.(true);
    } catch (err: any) {
      setIsStarted(true);
      onStatusChange?.(false);
      
      if (err.name === "NotAllowedError") {
        setError("카메라 권한이 거부되었습니다.\n\n브라우저 주소창 옆 자물쇠 아이콘을 클릭하여 카메라 권한을 허용해주세요.");
      } else if (err.name === "NotFoundError") {
        setError("카메라를 찾을 수 없습니다.\n\n1. 카메라가 연결되어 있는지 확인하세요\n2. 다른 앱에서 카메라를 사용 중인지 확인하세요\n3. 브라우저를 재시작해보세요");
      } else if (err.name === "NotReadableError") {
        setError("카메라가 이미 사용 중입니다.\n\n다른 앱이나 탭에서 카메라를 종료해주세요.");
      } else if (err.name === "OverconstrainedError") {
        setError(`카메라 설정 오류: ${err.constraint}\n\n다른 카메라를 시도해보세요.`);
      } else {
        setError(`카메라 오류: ${err.name}\n${err.message}`);
      }
    }
  }, [onStatusChange]);

  const takeSnapshot = useCallback(() => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      const context = canvas.getContext("2d");
      
      if (context && video.videoWidth > 0) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        context.drawImage(video, 0, 0);
        setSnapshot(canvas.toDataURL("image/png"));
      }
    }
  }, []);

  const downloadSnapshot = useCallback(() => {
    if (snapshot) {
      const link = document.createElement("a");
      link.href = snapshot;
      link.download = `snapshot_${Date.now()}.png`;
      link.click();
    }
  }, [snapshot]);

  const clearSnapshot = useCallback(() => setSnapshot(null), []);

  return {
    videoRef,
    canvasRef,
    stream,
    snapshot,
    error,
    isStarted,
    startCamera,
    stopCamera,
    reset,
    takeSnapshot,
    downloadSnapshot,
    clearSnapshot,
  };
}
