import { useState, useRef, useEffect, useCallback } from "react";

interface UseCameraOptions {
  onStatusChange?: (isAvailable: boolean) => void;
}

const IS_MOBILE = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent);

// Fallback constraints - try simpler options if advanced ones fail
const CAMERA_CONSTRAINTS_FALLBACKS: MediaStreamConstraints[] = [
  { video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false },
  { video: { width: { ideal: 640 }, height: { ideal: 480 } }, audio: false },
  { video: true, audio: false },
  { video: {} },
];

/**
 * 전략 A: 숨겨진 video에서 실제 프레임이 나올 때까지 대기한 후 resolve.
 * Android 카메라 HAL 워밍업(1~3초)을 완전히 우회합니다.
 */
async function warmUpStream(stream: MediaStream, timeoutMs = 10000): Promise<void> {
  const videoTrack = stream.getVideoTracks()[0];
  if (!videoTrack || videoTrack.readyState !== "live") return;

  return new Promise<void>((resolve) => {
    const tempVideo = document.createElement("video");
    tempVideo.srcObject = new MediaStream([videoTrack]);
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.setAttribute("playsinline", "true");
    tempVideo.setAttribute("webkit-playsinline", "true");
    // 화면에 보이지 않도록 숨김
    tempVideo.style.position = "fixed";
    tempVideo.style.top = "-9999px";
    tempVideo.style.width = "1px";
    tempVideo.style.height = "1px";
    tempVideo.style.opacity = "0";
    document.body.appendChild(tempVideo);

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");

    let resolved = false;
    let checkCount = 0;
    const MAX_CHECKS = 40; // 최대 40번 (약 8초)
    const CHECK_INTERVAL = 200;

    const cleanup = () => {
      if (intervalId) clearInterval(intervalId);
      if (overallTimeout) clearTimeout(overallTimeout);
      tempVideo.srcObject = null;
      tempVideo.remove();
    };

    const done = () => {
      if (resolved) return;
      resolved = true;
      cleanup();
      resolve();
    };

    const checkPixels = () => {
      if (resolved || !ctx) return;
      checkCount++;
      try {
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;
        let nonBlack = 0;
        const total = pixels.length / 4;
        for (let i = 0; i < pixels.length; i += 4) {
          if (pixels[i] > 10 || pixels[i + 1] > 10 || pixels[i + 2] > 10) {
            nonBlack++;
          }
        }
        const ratio = nonBlack / total;
        if (checkCount % 5 === 0) {
          console.log(`[Camera:WarmUp] Check ${checkCount}: ${(ratio * 100).toFixed(1)}% non-black`);
        }
        if (ratio > 0.01) {
          console.log("[Camera:WarmUp] ✅ Real frames detected!");
          done();
        }
      } catch { /* canvas draw fail — ignore */ }

      if (checkCount >= MAX_CHECKS && !resolved) {
        console.warn("[Camera:WarmUp] ⏰ Max checks — proceeding anyway");
        done();
      }
    };

    const overallTimeout = setTimeout(() => {
      console.warn("[Camera:WarmUp] ⏰ Overall timeout — proceeding");
      done();
    }, timeoutMs);

    let intervalId: ReturnType<typeof setInterval> | null = null;

    tempVideo.play().then(() => {
      console.log("[Camera:WarmUp] ▶️ Hidden video playing");
      // 첫 체크 전 약간 대기 (카메라 첫 프레임 생성 시간)
      setTimeout(() => {
        checkPixels();
        intervalId = setInterval(checkPixels, CHECK_INTERVAL);
      }, IS_MOBILE ? 500 : 100);
    }).catch((e) => {
      console.warn("[Camera:WarmUp] ⚠️ Hidden video play failed:", e);
      // play 실패 시에도 대기 후 진행
      setTimeout(done, IS_MOBILE ? 3000 : 800);
    });
  });
}

export function useCamera({ onStatusChange }: UseCameraOptions = {}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [stream, setStream] = useState<MediaStream | null>(null);
  const [snapshot, setSnapshot] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isStarted, setIsStarted] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const intentionalStopRef = useRef(false);

  // ────────────────────────────────────────────────
  // 전략 A: 프레임 확인 후 srcObject 연결
  // 전략 B: onunmute 강제 리셋 안전망
  // ────────────────────────────────────────────────
  useEffect(() => {
    const video = videoRef.current;
    if (!stream || !video) return;

    let cancelled = false;

    video.setAttribute("playsinline", "true");
    video.setAttribute("webkit-playsinline", "true");

    const attachAndPlay = async () => {
      if (cancelled) return;

      // 전략 A (모바일): 숨겨진 video로 워밍업 후 연결
      if (IS_MOBILE) {
        console.log("[Camera] 📱 Android detected — warming up before attach...");
        await warmUpStream(stream, 10000);
        if (cancelled) return;
        console.log("[Camera] 📱 Warm-up complete — attaching to UI video");
      }

      // 이제 실제 프레임이 나오고 있으므로 UI video에 연결
      video.pause();
      video.srcObject = stream;

      try {
        await video.play();
        console.log("[Camera] ✅ Video play() succeeded");
      } catch (err: any) {
        if (cancelled) return;
        if (err.name === "AbortError") {
          console.log("[Camera] ⏭️ play() AbortError, ignoring");
          return;
        }
        if (err.name === "NotAllowedError") {
          console.warn("[Camera] ⚠️ Autoplay blocked");
          return;
        }
        console.error("[Camera] ❌ play() failed:", err);
        // 모바일 재시도
        if (IS_MOBILE) {
          for (let retry = 1; retry <= 3; retry++) {
            await new Promise(r => setTimeout(r, retry * 500));
            if (cancelled) return;
            try {
              await video.play();
              console.log(`[Camera] ✅ play() succeeded on retry ${retry}`);
              break;
            } catch { /* continue */ }
          }
        }
      }

      // 전략 B 안전망: play 후에도 검정일 수 있으므로 onunmute 감지 시 강제 리셋
      if (IS_MOBILE) {
        const videoTrack = stream.getVideoTracks()[0];
        if (videoTrack && videoTrack.muted) {
          console.log("[Camera] 🔇 Track still muted after play — setting up onunmute force-reset");
          videoTrack.onunmute = () => {
            if (cancelled) return;
            console.log("[Camera] 🔊 Track unmuted! Force-resetting video element");
            videoTrack.onunmute = null;
            // 강제 리셋: srcObject 재할당 → play
            video.pause();
            video.srcObject = null;
            // 짧은 대기 후 재할당 (브라우저가 이전 소스를 완전히 해제하도록)
            setTimeout(() => {
              if (cancelled) return;
              video.srcObject = stream;
              video.play().then(() => {
                console.log("[Camera] ✅ Force-reset play() succeeded");
              }).catch(() => {});
            }, 100);
          };
        }

        // 추가 안전망: 2초 후에도 videoWidth가 0이면 강제 리셋
        setTimeout(() => {
          if (cancelled || !video.srcObject) return;
          if (video.videoWidth === 0 || video.videoHeight === 0) {
            console.warn("[Camera] ⚠️ Video dimensions still 0 after 2s — force-resetting");
            video.pause();
            video.srcObject = null;
            setTimeout(() => {
              if (cancelled) return;
              video.srcObject = stream;
              video.play().catch(() => {});
            }, 200);
          }
        }, 2000);
      }
    };

    attachAndPlay();

    return () => {
      cancelled = true;
      // onunmute 핸들러 정리
      const vt = stream.getVideoTracks()[0];
      if (vt) vt.onunmute = null;
    };
  }, [stream]);

  // Handle stream track ended (camera physically disconnected or spurious)
  const isReacquiringRef = useRef(false);

  useEffect(() => {
    if (!stream) return;

    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    const handleEnded = async () => {
      if (intentionalStopRef.current) return;
      
      if (stream.active && !isReacquiringRef.current) {
        console.warn("[Camera] ⚠️ Track ended but stream active — auto re-acquiring camera...");
        isReacquiringRef.current = true;
        try {
          const newStream = await tryGetUserMedia();
          console.log("[Camera] ✅ Camera re-acquired successfully");
          setStream(newStream);
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
    setTimeout(() => { intentionalStopRef.current = false; }, 100);
  }, [stopCamera]);

  // Try each constraint set until one works (with timeout)
  const tryGetUserMedia = async (): Promise<MediaStream> => {
    let lastError: Error | null = null;

    for (const constraints of CAMERA_CONSTRAINTS_FALLBACKS) {
      try {
        const mediaStream = await Promise.race([
          navigator.mediaDevices.getUserMedia(constraints),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error("CAMERA_TIMEOUT")), 10000)
          ),
        ]);
        if (mediaStream.getVideoTracks().length > 0) {
          return mediaStream;
        }
        mediaStream.getTracks().forEach(t => t.stop());
      } catch (err) {
        lastError = err as Error;
        if ((err as Error).name === "NotAllowedError" || (err as Error).message === "CAMERA_TIMEOUT") {
          throw err;
        }
      }
    }

    throw lastError || new Error("Failed to access camera");
  };

  const retryCountRef = useRef(0);
  const MAX_AUTO_RETRIES = 2;

  const startCamera = useCallback(async () => {
    if (isLoading) return;
    
    setIsLoading(true);
    setError(null);
    console.log("[Camera] Starting camera...");

    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error("CAMERA_NOT_SUPPORTED");
      }

      try {
        const permStatus = await navigator.permissions.query({ name: 'camera' as PermissionName });
        console.log("[Camera] Permission status:", permStatus.state);
      } catch (e) {
        console.log("[Camera] Permissions API not available");
      }

      const mediaStream = await tryGetUserMedia();
      console.log("[Camera] ✅ Got stream, tracks:", mediaStream.getVideoTracks().length);
      
      // 스트림을 state에 넣으면 useEffect가 워밍업 → 연결 처리
      setStream(mediaStream);
      setIsStarted(true);
      retryCountRef.current = 0;
      onStatusChange?.(true);
    } catch (err: any) {
      console.error("[Camera] ❌ Error:", err.name, err.message);
      
      if (err.name === "NotFoundError" && retryCountRef.current < MAX_AUTO_RETRIES) {
        retryCountRef.current++;
        console.log(`[Camera] 🔄 Auto-retry ${retryCountRef.current}/${MAX_AUTO_RETRIES} in 1s...`);
        setIsLoading(false);
        setTimeout(() => { startCamera(); }, 1000);
        return;
      }
      
      setIsStarted(true);
      onStatusChange?.(false);
      
      switch (err.name) {
        case "NotAllowedError": setError("CAMERA_NOT_ALLOWED"); break;
        case "NotFoundError": setError("CAMERA_NOT_FOUND"); break;
        case "NotReadableError": setError("CAMERA_NOT_READABLE"); break;
        case "OverconstrainedError": setError("CAMERA_OVERCONSTRAINED"); break;
        case "AbortError": setError("CAMERA_ABORT"); break;
        case "SecurityError": setError("CAMERA_SECURITY"); break;
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
