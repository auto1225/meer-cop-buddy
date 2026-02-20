import { useEffect, useRef, useState, useCallback } from "react";
import { X, Camera, Video, VideoOff, Loader2, Radio, Users, Volume2, VolumeX, Circle, Pause, Play, RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import { useWebRTCBroadcaster } from "@/hooks/useWebRTCBroadcaster";
import { useTranslation } from "@/lib/i18n";

interface CameraSettings {
  deviceId: string;
  groupId: string;
  label: string;
}

interface CameraModalProps {
  isOpen: boolean;
  onClose: () => void;
  deviceId?: string;
}

export function CameraModal({ isOpen, onClose, deviceId }: CameraModalProps) {
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
  } = useCamera();

  const {
    isBroadcasting,
    viewerCount,
    startBroadcasting,
    stopBroadcasting,
  } = useWebRTCBroadcaster({ deviceId: deviceId || "" });

  const [isMuted, setIsMuted] = useState(true);
  const [isAudioMonitoring] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const [isPaused, setIsPaused] = useState(false);
  const [audioLevel, setAudioLevel] = useState(0);
  const [snapshotPreview, setSnapshotPreview] = useState<string | null>(null);
  const [recordingTime, setRecordingTime] = useState(0);
  const recordingTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const audioSourceRef = useRef<MediaStreamAudioSourceNode | null>(null);
  const gainNodeRef = useRef<GainNode | null>(null);
  const animFrameRef = useRef<number>(0);
  const pauseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const broadcastStartedRef = useRef(false);
  const [isCameraLost, setIsCameraLost] = useState(false);
  const cameraRecoveryRef = useRef(false);
  const audioStreamRef = useRef<MediaStream | null>(null);

  const { t } = useTranslation();

  // Map error codes from useCamera to i18n keys
  const cameraErrorMap: Record<string, string> = {
    CAMERA_TIMEOUT: "camera.error.timeout",
    CAMERA_NOT_ALLOWED: "camera.error.notAllowed",
    CAMERA_NOT_FOUND: "camera.error.notFound",
    CAMERA_NOT_READABLE: "camera.error.notReadable",
    CAMERA_OVERCONSTRAINED: "camera.error.overconstrained",
    CAMERA_ABORT: "camera.error.abort",
    CAMERA_SECURITY: "camera.error.security",
    CAMERA_DISCONNECTED: "camera.error.disconnected",
    CAMERA_NOT_SUPPORTED: "camera.error.notSupported",
    CAMERA_DEFAULT: "camera.error.default",
  };

  const translateCameraError = (errorCode: string) => {
    const key = cameraErrorMap[errorCode];
    return key ? t(key) : errorCode;
  };

  // Auto-start camera when modal opens
  useEffect(() => {
    if (isOpen && !isStarted && !isLoading) {
      startCamera();
    }
    if (!isOpen) {
      if (isBroadcasting) stopBroadcasting();
      broadcastStartedRef.current = false;
      stopAudioSystem();
      reset();
      setIsMuted(true);
      setIsRecording(false);
      setIsPaused(false);
      setAudioLevel(0);
      setSnapshotPreview(null);
      setRecordingTime(0);
      setIsCameraLost(false);
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    }
  }, [isOpen]);

  // Auto-broadcast when stream is ready + start audio capture
  useEffect(() => {
    if (stream && deviceId && !broadcastStartedRef.current && !isCameraLost) {
      broadcastStartedRef.current = true;
      
      // Capture audio separately for analysis & monitoring
      captureAudioStream().then((audioStream) => {
        if (audioStream) {
          // Default mute: disable audio tracks initially
          audioStream.getAudioTracks().forEach(t => { t.enabled = false; });
          // Merge video + audio for broadcasting
          const combinedStream = new MediaStream([
            ...stream.getVideoTracks(),
            ...audioStream.getAudioTracks(),
          ]);
          startBroadcasting(combinedStream);
          startAudioSystem(audioStream);
        } else {
          startBroadcasting(stream);
        }
      });
    }
  }, [stream, deviceId, isCameraLost]);

  // Camera lost detection
  useEffect(() => {
    if (!stream) return;
    const tracks = stream.getVideoTracks();
    if (tracks.length === 0) return;

    const onEnded = () => {
      console.warn("[CameraModal] Camera track ended - camera disconnected");
      setIsCameraLost(true);
      stopBroadcasting();
      broadcastStartedRef.current = false;
    };

    tracks.forEach(track => track.addEventListener("ended", onEnded));
    return () => {
      tracks.forEach(track => track.removeEventListener("ended", onEnded));
    };
  }, [stream]);

  // Auto-recovery when camera comes back
  useEffect(() => {
    if (!isCameraLost || !isOpen) return;
    
    const checkCamera = async () => {
      try {
        const devices = await navigator.mediaDevices.enumerateDevices();
        const hasCamera = devices.some(d => d.kind === "videoinput");
        if (hasCamera && !cameraRecoveryRef.current) {
          cameraRecoveryRef.current = true;
          console.log("[CameraModal] Camera re-detected, attempting recovery...");
          setIsCameraLost(false);
          broadcastStartedRef.current = false;
          reset();
          setTimeout(() => {
            startCamera();
            cameraRecoveryRef.current = false;
          }, 500);
        }
      } catch { /* silent */ }
    };

    const interval = setInterval(checkCamera, 3000);
    return () => clearInterval(interval);
  }, [isCameraLost, isOpen]);

  // Capture a separate audio stream from the microphone
  const captureAudioStream = useCallback(async (): Promise<MediaStream | null> => {
    try {
      const audioStream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
        video: false,
      });
      audioStreamRef.current = audioStream;
      console.log("[CameraModal] 🎤 Audio stream captured");
      return audioStream;
    } catch (err) {
      console.warn("[CameraModal] ⚠️ Failed to capture audio:", err);
      return null;
    }
  }, []);

  // Start audio analysis + prepare monitoring graph
  const startAudioSystem = useCallback((audioStream: MediaStream) => {
    try {
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(audioStream);
      audioSourceRef.current = source;

      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 256;
      analyserRef.current = analyser;

      // Gain node for speaker monitoring (starts disconnected from destination)
      const gain = audioCtx.createGain();
      gain.gain.value = 0.8;
      gainNodeRef.current = gain;

      // Audio graph: source → analyser (always for level meter)
      source.connect(analyser);
      // source → gain → destination (only when monitoring is ON)
      source.connect(gain);
      // Don't connect gain to destination yet — user must toggle

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const update = () => {
        analyser.getByteFrequencyData(dataArray);
        const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
        setAudioLevel(Math.min(avg / 128, 1));
        animFrameRef.current = requestAnimationFrame(update);
      };
      update();
    } catch (err) {
      console.warn("[CameraModal] Audio system init failed:", err);
    }
  }, []);

  const stopAudioSystem = useCallback(() => {
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    if (gainNodeRef.current) {
      try { gainNodeRef.current.disconnect(); } catch {}
      gainNodeRef.current = null;
    }
    if (audioSourceRef.current) {
      try { audioSourceRef.current.disconnect(); } catch {}
      audioSourceRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
    analyserRef.current = null;
    if (audioStreamRef.current) {
      audioStreamRef.current.getTracks().forEach(t => t.stop());
      audioStreamRef.current = null;
    }
    // Audio monitoring state is now fixed to false
  }, []);

  // Audio monitoring removed — toggleAudioMonitoring kept as no-op for safety
  const toggleAudioMonitoring = useCallback(() => {}, []);

  const toggleMute = useCallback(() => {
    if (!audioStreamRef.current) return;
    const audioTracks = audioStreamRef.current.getAudioTracks();
    audioTracks.forEach(track => {
      track.enabled = !track.enabled;
    });
    setIsMuted(prev => !prev);
  }, []);

  const toggleRecording = useCallback(() => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setIsRecording(false);
      setRecordingTime(0);
    } else if (stream) {
      recordedChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported("video/webm;codecs=vp9,opus")
        ? "video/webm;codecs=vp9,opus"
        : MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? "video/webm;codecs=vp9"
          : "video/webm";
      // Combine video + audio tracks for recording
      const recordingStream = new MediaStream([
        ...stream.getVideoTracks(),
        ...(audioStreamRef.current ? audioStreamRef.current.getAudioTracks() : []),
      ]);
      const recorder = new MediaRecorder(recordingStream, { mimeType });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = `meercop_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, "")}.webm`;
        a.click();
        URL.revokeObjectURL(url);
      };
      recorder.start(1000);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime(prev => prev + 1);
      }, 1000);
    }
  }, [isRecording, stream]);

  const togglePause = useCallback(() => {
    if (!videoRef.current || !stream) return;
    if (isPaused) {
      videoRef.current.play();
      setIsPaused(false);
    } else {
      const canvas = document.createElement("canvas");
      canvas.width = videoRef.current.videoWidth || 640;
      canvas.height = videoRef.current.videoHeight || 480;
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.drawImage(videoRef.current, 0, 0);
      pauseCanvasRef.current = canvas;
      videoRef.current.pause();
      setIsPaused(true);
    }
  }, [isPaused, stream, videoRef]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const handleClose = useCallback(() => {
    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      if (recordingTimerRef.current) clearInterval(recordingTimerRef.current);
      setIsRecording(false);
      setRecordingTime(0);
    }
    onClose();
  }, [isRecording, onClose]);

  const handleSnapshot = useCallback(() => {
    if (!stream || !videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth || 640;
    canvas.height = videoRef.current.videoHeight || 480;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      setSnapshotPreview(canvas.toDataURL("image/png"));
    }
  }, [stream, videoRef]);

  const downloadSnapshotPreview = useCallback(() => {
    if (!snapshotPreview) return;
    const a = document.createElement("a");
    a.href = snapshotPreview;
    a.download = `meercop_${new Date().toISOString().slice(0, 19).replace(/[:-]/g, "")}.png`;
    a.click();
  }, [snapshotPreview]);

  if (!isOpen) return null;

  // Number of active audio bars (0-5)
  const activeBars = Math.round(audioLevel * 5);

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 backdrop-blur-sm">
      <div
        className="w-[92%] max-w-md overflow-hidden rounded-2xl border border-white/20 shadow-2xl"
        style={{
          background: "linear-gradient(180deg, hsla(199, 70%, 55%, 0.85) 0%, hsla(199, 65%, 45%, 0.9) 100%)",
          backdropFilter: "blur(24px)",
          WebkitBackdropFilter: "blur(24px)",
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-2.5">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-white/15 backdrop-blur-sm flex items-center justify-center border border-white/20">
              <Video className="h-4 w-4 text-white" />
            </div>
            <span className="font-extrabold text-base text-white drop-shadow">{t("camera.title")}</span>
          </div>
          <Button
            variant="ghost"
            size="icon"
            className="h-8 w-8 text-white/70 hover:bg-white/15 rounded-xl"
            onClick={handleClose}
          >
            <X className="h-4 w-4" />
          </Button>
        </div>

        {/* Video Area */}
        <div className="px-3 pb-2">
          {isLoading && !stream ? (
            <div className="aspect-video rounded-xl bg-black/40 flex flex-col items-center justify-center gap-3">
              <Loader2 className="w-10 h-10 text-white animate-spin" />
              <p className="text-white/80 text-sm font-bold">{t("camera.connecting")}</p>
            </div>
          ) : error && !stream ? (
            <div className="aspect-video rounded-xl bg-black/40 flex flex-col items-center justify-center gap-3 p-4">
              <p className="text-white/80 text-center whitespace-pre-line text-sm font-semibold">{translateCameraError(error)}</p>
              <Button
                onClick={startCamera}
                disabled={isLoading}
                className="bg-white/15 border border-white/20 text-white hover:bg-white/25 font-bold text-xs backdrop-blur-sm"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                {t("camera.retry")}
              </Button>
            </div>
          ) : (
            <div className="relative">
              <video
                ref={videoRef}
                autoPlay
                playsInline
                muted
                className="w-full rounded-xl bg-black aspect-video object-cover"
              />

              {/* Camera disconnected overlay */}
              {isCameraLost && (
                <div className="absolute inset-0 rounded-xl bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center gap-3 z-10">
                  <VideoOff className="w-10 h-10 text-white/60" />
                  <p className="text-white/80 text-sm font-bold">{t("camera.notDetected")}</p>
                  <p className="text-white/50 text-xs">{t("camera.reconnectHint")}</p>
                  <Button
                    onClick={() => {
                      setIsCameraLost(false);
                      broadcastStartedRef.current = false;
                      stopBroadcasting();
                      reset();
                      setTimeout(() => startCamera(), 300);
                    }}
                    className="mt-1 bg-white/15 border border-white/20 text-white hover:bg-white/25 font-bold text-xs backdrop-blur-sm"
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    {t("camera.retry")}
                  </Button>
                </div>
              )}

              {/* Frozen frame overlay when paused */}
              {isPaused && pauseCanvasRef.current && (
                <img
                  src={pauseCanvasRef.current.toDataURL()}
                  alt="Paused frame"
                  className="absolute inset-0 w-full h-full rounded-xl object-cover"
                />
              )}

              {/* Audio Level Indicator - top left (half size) */}
              {stream && (
                <div className="absolute top-1.5 left-1.5 flex items-center gap-0.5 bg-black/50 backdrop-blur-sm px-1 py-0.5 rounded border border-white/10" style={{ transform: "scale(0.7)", transformOrigin: "top left" }}>
                  <div className={`w-3 h-3 rounded-full flex items-center justify-center ${isMuted ? "bg-red-500/60" : "bg-green-500/60"}`}>
                    {isMuted ? (
                      <VolumeX className="w-2 h-2 text-white" />
                    ) : (
                      <svg width="7" height="7" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" className="text-white">
                        <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3Z" />
                      </svg>
                    )}
                  </div>
                  <div className="flex items-end gap-[1px] h-2.5">
                    {[0, 1, 2, 3, 4].map((i) => (
                      <div
                        key={i}
                        className="w-[2px] rounded-full transition-all duration-100"
                        style={{
                          height: `${40 + i * 15}%`,
                          backgroundColor: i < activeBars && !isMuted
                            ? `hsl(120, 70%, ${55 - i * 5}%)`
                            : "hsla(0, 0%, 100%, 0.25)",
                        }}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Recording timer - top center */}
              {isRecording && (
                <div className="absolute top-1.5 left-1/2 -translate-x-1/2 flex items-center gap-1 bg-black/50 backdrop-blur-sm px-2 py-0.5 rounded border border-white/10">
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[10px] text-white font-bold tabular-nums">{formatTime(recordingTime)}</span>
                </div>
              )}

              {/* LIVE badge - top right (half size) */}
              {isBroadcasting && (
                <div className="absolute top-1.5 right-1.5 flex items-center gap-1 bg-black/50 backdrop-blur-sm px-1.5 py-0.5 rounded border border-white/10" style={{ transform: "scale(0.7)", transformOrigin: "top right" }}>
                  <div className="w-1.5 h-1.5 bg-red-500 rounded-full animate-pulse" />
                  <span className="text-[9px] text-white font-extrabold tracking-wide">LIVE</span>
                  {viewerCount > 0 && (
                    <>
                      <div className="w-px h-2 bg-white/30" />
                      <div className="flex items-center gap-0.5">
                        <Users className="w-2 h-2 text-white/80" />
                        <span className="text-[8px] text-white/80 font-bold">{viewerCount}</span>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          )}
        </div>

        {/* Bottom Control Bar */}
        {stream && (
          <div className="flex items-center justify-center gap-4 px-4 py-3">
            <button
              onClick={toggleMute}
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/25 active:scale-95 transition-all"
            >
              {isMuted ? (
                <VolumeX className="w-4 h-4 text-white/70" />
              ) : (
                <Volume2 className="w-4 h-4 text-white" />
              )}
            </button>

            <button
              onClick={toggleRecording}
              className={`w-10 h-10 rounded-full backdrop-blur-sm border flex items-center justify-center hover:scale-105 active:scale-95 transition-all ${
                isRecording
                  ? "bg-red-500/30 border-red-400/40"
                  : "bg-white/15 border-white/20 hover:bg-white/25"
              }`}
            >
              <Circle
                className={`w-4 h-4 ${isRecording ? "text-red-400 fill-red-400 animate-pulse" : "text-white"}`}
                strokeWidth={isRecording ? 0 : 2}
              />
            </button>

            <button
              onClick={togglePause}
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/25 active:scale-95 transition-all"
            >
              {isPaused ? (
                <Play className="w-4 h-4 text-white" />
              ) : (
                <Pause className="w-4 h-4 text-white" />
              )}
            </button>

            <button
              onClick={handleSnapshot}
              disabled={!stream}
              className="w-10 h-10 rounded-full bg-white/15 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-white/25 active:scale-95 transition-all"
            >
              <Camera className="w-4 h-4 text-white" />
            </button>
          </div>
        )}

        <canvas ref={canvasRef} className="hidden" />
      </div>

      {/* Snapshot Preview Modal */}
      {snapshotPreview && (
        <div
          className="w-[92%] max-w-md overflow-hidden rounded-2xl border border-white/20 shadow-2xl absolute"
          style={{
            background: "linear-gradient(180deg, hsla(199, 70%, 55%, 0.85) 0%, hsla(199, 65%, 45%, 0.9) 100%)",
            backdropFilter: "blur(24px)",
            WebkitBackdropFilter: "blur(24px)",
          }}
        >
          <div className="flex items-center justify-between px-4 py-2.5">
            <span className="font-extrabold text-base text-white drop-shadow">{t("camera.snapshot")}</span>
            <Button
              variant="ghost"
              size="icon"
              className="h-8 w-8 text-white/70 hover:bg-white/15 rounded-xl"
              onClick={() => setSnapshotPreview(null)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>
          <div className="px-3 pb-2">
            <img src={snapshotPreview} alt="Snapshot" className="w-full rounded-xl" />
          </div>
          <div className="flex gap-2 px-3 pb-3">
            <Button
              onClick={downloadSnapshotPreview}
              className="flex-1 bg-white/20 border border-white/25 text-white hover:bg-white/30 font-bold text-xs backdrop-blur-sm"
            >
              {t("camera.save")}
            </Button>
            <Button
              onClick={() => setSnapshotPreview(null)}
              className="flex-1 bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 font-bold text-xs backdrop-blur-sm"
            >
              {t("camera.close")}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
