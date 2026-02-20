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

  // Attach stream to video element and ensure playback
  useEffect(() => {
    const video = videoRef.current;
    if (!stream || !video) return;

    // Cancel any pending play before changing source
    video.pause();
    video.srcObject = stream;

    const attemptPlay = async () => {
      try {
        await video.play();
        console.log("[Camera] ✅ Video play() succeeded");
      } catch (err: any) {
        if (err.name === "AbortError") {
          // Stream was replaced before play completed — safe to ignore
          console.log("[Camera] ⏭️ play() AbortError (stream replaced), ignoring");
        } else if (err.name === "NotAllowedError") {
          console.warn("[Camera] ⚠️ Autoplay blocked, user gesture required");
        } else {
          console.error("[Camera] ❌ play() failed:", err);
        }
      }
    };

    // Small delay to let the video element process the new srcObject
    const timer = setTimeout(attemptPlay, 50);
    return () => clearTimeout(timer);
  }, [stream]);

  // Handle stream track ended (camera physically disconnected or spurious)
  const isReacquiringRef = useRef(false);

  useEffect(() => {
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const handleEnded = async () => {
      if (intentionalStopRef.current) return;
      
      // If stream is still "active" but track ended, the track won't produce frames.
      // Try to re-acquire the camera automatically.
      if (stream.active && !isReacquiringRef.current) {
        console.warn("[Camera] ⚠️ Track ended but stream active — auto re-acquiring camera...");
        isReacquiringRef.current = true;
        try {
          const newStream = await navigator.mediaDevices.getUserMedia(
            { video: { width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false }
          );
          if (newStream.getVideoTracks().length > 0) {
            console.log("[Camera] ✅ Camera re-acquired successfully");
            setStream(newStream);
          }
        } catch (err) {
          console.error("[Camera] ❌ Re-acquire failed:", err);
          setError("CAMERA_DISCONNECTED");
          setStream(null);
          onStatusChange?.(false);
        } finally {
          isReacquiringRef.current = false;
        }
        return;
      }
      
      if (!stream.active) {
        console.log("[Camera] 🔌 Track ended, stream inactive — camera disconnected");
        setError("CAMERA_DISCONNECTED");
        setStream(null);
        onStatusChange?.(false);
      }
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
            setTimeout(() => reject(new Error("CAMERA_TIMEOUT")), 10000)
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
        if ((err as Error).name === "NotAllowedError" || (err as Error).message === "CAMERA_TIMEOUT") {
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
        throw new Error("CAMERA_NOT_SUPPORTED");
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
          setError("CAMERA_NOT_ALLOWED");
          break;
        case "NotFoundError":
          setError("CAMERA_NOT_FOUND");
          break;
        case "NotReadableError":
          setError("CAMERA_NOT_READABLE");
          break;
        case "OverconstrainedError":
          setError("CAMERA_OVERCONSTRAINED");
          break;
        case "AbortError":
          setError("CAMERA_ABORT");
          break;
        case "SecurityError":
          setError("CAMERA_SECURITY");
          break;
        default:
          if (err.message === "CAMERA_TIMEOUT") setError("CAMERA_TIMEOUT");
          else if (err.message === "CAMERA_NOT_SUPPORTED") setError("CAMERA_NOT_SUPPORTED");
          else if (err.message === "CAMERA_DISCONNECTED") setError("CAMERA_DISCONNECTED");
          else setError("CAMERA_DEFAULT");
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
