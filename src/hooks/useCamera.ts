import { useState, useRef, useEffect, useCallback } from "react";

interface UseCameraOptions {
  onStatusChange?: (isAvailable: boolean) => void;
}

// Fallback constraints - try simpler options if advanced ones fail
const CAMERA_CONSTRAINTS_FALLBACKS: MediaStreamConstraints[] = [
  // 1. Ideal: front camera with reasonable resolution
  { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
  // 2. Any camera with lower resolution
  { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
  // 3. Just video, no constraints
  { video: true, audio: false },
  // 4. Absolute minimum - deviceId will be auto-selected
  { video: {} },
];

export function useCamera({ onStatusChange }: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const intentionalStopRef = useRef(false);

  // Attach stream to video element
  useEffect(() => {
    if (stream && videoRef.current) {
      videoRef.current.srcObject = stream;
    }
  }, [stream]);

  // Handle stream track ended (camera physically disconnected)
  useEffect(() => {
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const handleEnded = () => {
      if (intentionalStopRef.current) return;
      // Double-check: if the stream is still active, this is a spurious event
      if (stream.active) {
        console.warn("[Camera] ⚠️ Track ended but stream still active — ignoring");
        return;
      }
      console.log("[Camera] 🔌 Track ended, stream inactive — camera disconnected");
      setError("카메라 연결이 끊어졌습니다.\n\n카메라를 다시 연결하고 재시도해주세요.");
      setStream(null);
      onStatusChange?.(false);
    };

    videoTrack.addEventListener("ended", handleEnded);
    return () => videoTrack.removeEventListener("ended", handleEnded);
  }, [stream, onStatusChange]);

  const stopCamera = useCallback(() => {
    if (stream) {
      intentionalStopRef.current = true;
      stream.getTracks().forEach(track => track.stop());
      setStream(null);
    }
  }, [stream]);

  const reset = useCallback(() => {
    stopCamera();
    setIsStarted(false);
    setSnapshot(null);
    setError(null);
    setIsLoading(false);
    // Reset intentional stop flag after a tick so ended events are fully ignored
    setTimeout(() => { intentionalStopRef.current = false; }, 100);
  }, [stopCamera]);

  // Try each constraint set until one works (with timeout)
  const tryGetUserMedia = async (): Promise<MediaStream> => {
    let lastError: Error | null = null;

    for (const constraints of CAMERA_CONSTRAINTS_FALLBACKS) {
      try {
        // Add 10s timeout to prevent hanging forever
        const mediaStream = await Promise.race([
          navigator.mediaDevices.getUserMedia(constraints),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("카메라 연결 시간이 초과되었습니다.\n\n브라우저 권한 팝업이 표시되지 않았다면 주소창의 카메라 아이콘을 클릭하여 권한을 허용해주세요.")), 10000)
          ),
        ]);
        // Verify we actually got a video track
        if (mediaStream.getVideoTracks().length > 0) {
          return mediaStream;
        }
        mediaStream.getTracks().forEach(t => t.stop());
      } catch (err) {
        lastError = err as Error;
        // If permission denied or timeout, don't try other constraints
        if ((err as Error).name === "NotAllowedError" || (err as Error).message.includes("시간이 초과")) {
          throw err;
        }
        // Continue to next fallback
      }
    }

    throw lastError || new Error("Failed to access camera");
  };

  const retryCountRef = useRef(0);
  const MAX_AUTO_RETRIES = 2;

  const startCamera = useCallback(async () => {
    // Prevent multiple simultaneous attempts
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);
    console.log("[Camera] Starting camera...");

    try {
      // Check if mediaDevices API is available
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("이 브라우저는 카메라를 지원하지 않습니다.");
      }

      // Check permissions API first
      try {
        const permStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        console.log("[Camera] Permission status:", permStatus.state);
      } catch (e) {
        console.log("[Camera] Permissions API not available");
      }

      const mediaStream = await tryGetUserMedia();
      console.log("[Camera] ✅ Got stream, tracks:", mediaStream.getVideoTracks().length);
      
      setStream(mediaStream);
      setIsStarted(true);
      retryCountRef.current = 0;
      onStatusChange?.(true);
    } catch (err: any) {
      console.error("[Camera] ❌ Error:", err.name, err.message);
      
      // Auto-retry for NotFoundError (device may not be ready yet)
      if (err.name === "NotFoundError" && retryCountRef.current < MAX_AUTO_RETRIES) {
        retryCountRef.current++;
        console.log(`[Camera] 🔄 Auto-retry ${retryCountRef.current}/${MAX_AUTO_RETRIES} in 1s...`);
        setIsLoading(false);
        setTimeout(() => {
          startCamera();
        }, 1000);
        return;
      }
      
      setIsStarted(true);
      onStatusChange?.(false);
      
      // User-friendly error messages in Korean
      switch (err.name) {
        case "NotAllowedError":
          setError("카메라 권한이 거부되었습니다.\n\n브라우저 주소창 옆 자물쇠 아이콘을 클릭하여 카메라 권한을 허용해주세요.");
          break;
        case "NotFoundError":
          setError("카메라를 찾을 수 없습니다.\n\n• 카메라가 연결되어 있는지 확인하세요\n• 다른 앱에서 카메라를 사용 중인지 확인하세요\n• 브라우저를 재시작해보세요");
          break;
        case "NotReadableError":
          setError("카메라에 접근할 수 없습니다.\n\n• 다른 앱이나 탭에서 카메라를 종료해주세요\n• 카메라 연결을 확인해주세요");
          break;
        case "OverconstrainedError":
          setError("카메라 설정을 적용할 수 없습니다.\n\n다른 카메라를 사용해보세요.");
          break;
        case "AbortError":
          setError("카메라 연결이 중단되었습니다.\n\n다시 시도해주세요.");
          break;
        case "SecurityError":
          setError("보안 설정으로 인해 카메라를 사용할 수 없습니다.\n\nHTTPS 연결이 필요합니다.");
          break;
        default:
          setError(err.message || "카메라를 시작할 수 없습니다.\n\n다시 시도해주세요.");
      }
    } finally {
      setIsLoading(false);
    }
  }, [isLoading, onStatusChange]);

  const takeSnapshot = useCallback(() => {
    if (!videoRef.current || !canvasRef.current) return;
    
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const context = canvas.getContext("2d");
    
    // Ensure video is ready
    if (!context || video.videoWidth === 0 || video.readyState < 2) return;
    
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    context.drawImage(video, 0, 0);
    setSnapshot(canvas.toDataURL("image/png"));
  }, []);

  const downloadSnapshot = useCallback(() => {
    if (!snapshot) return;
    
    const link = document.createElement("a");
    link.href = snapshot;
    link.download = `meercop_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, "")}.png`;
    link.click();
  }, [snapshot]);

  const clearSnapshot = useCallback(() => setSnapshot(null), []);

  return {
    videoRef,
    canvasRef,
    stream,
    snapshot,
    error,
    isStarted,
    isLoading,
    startCamera,
    stopCamera,
    reset,
    takeSnapshot,
    downloadSnapshot,
    clearSnapshot,
  };
}
