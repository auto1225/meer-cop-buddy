import { useEffect, useRef, useState, useCallback } from "react";
import { X, Camera, Video, Loader2, Radio, Users, Volume2, VolumeX, Circle, Pause, Play } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useCamera } from "@/hooks/useCamera";
import { useWebRTCBroadcaster } from "@/hooks/useWebRTCBroadcaster";

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

  const [isMuted, setIsMuted] = useState(false);
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
  const animFrameRef = useRef<number>(0);
  const pauseCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const broadcastStartedRef = useRef(false);

  // Auto-start camera when modal opens
  useEffect(() => {
    if (isOpen && !isStarted && !isLoading) {
      startCamera();
    }
  }, [isOpen, isStarted, isLoading, startCamera]);

  // Start WebRTC broadcasting when camera is active
  useEffect(() => {
    if (stream && deviceId && !isBroadcasting && !broadcastStartedRef.current) {
      broadcastStartedRef.current = true;
      startBroadcasting(stream);
    }
  }, [stream, deviceId, isBroadcasting, startBroadcasting]);

  useEffect(() => {
    if (!isOpen || !stream) {
      if (broadcastStartedRef.current) {
        broadcastStartedRef.current = false;
        stopBroadcasting();
      }
    }
  }, [isOpen, stream, stopBroadcasting]);

  useEffect(() => {
    if (!isOpen) {
      broadcastStartedRef.current = false;
      reset();
      setIsRecording(false);
      setIsPaused(false);
      setIsMuted(false);
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
    }
  }, [isOpen, reset]);

  // Audio level analysis
  useEffect(() => {
    if (!stream) return;
    if (!stream.getAudioTracks().length) {
      console.warn("[CameraModal] No audio track in stream, skipping audio analysis");
      return;
    }

    const audioCtx = new AudioContext();
    const source = audioCtx.createMediaStreamSource(stream);
    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    source.connect(analyser);
    audioCtxRef.current = audioCtx;
    analyserRef.current = analyser;

    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    const tick = () => {
      analyser.getByteFrequencyData(dataArray);
      const avg = dataArray.reduce((a, b) => a + b, 0) / dataArray.length;
      setAudioLevel(Math.min(avg / 80, 1));
      animFrameRef.current = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(animFrameRef.current);
      audioCtx.close();
    };
  }, [stream]);

  const handleClose = () => {
    stopBroadcasting();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    reset();
    onClose();
  };

  const toggleMute = useCallback(() => {
    if (!stream) return;
    const audioTracks = stream.getAudioTracks();
    audioTracks.forEach(t => { t.enabled = isMuted; });
    setIsMuted(!isMuted);
  }, [stream, isMuted]);

  const toggleRecording = useCallback(() => {
    if (!stream) return;

    if (isRecording) {
      if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
        mediaRecorderRef.current.stop();
      }
      setIsRecording(false);
      setIsPaused(false);
      setRecordingTime(0);
      if (recordingTimerRef.current) {
        clearInterval(recordingTimerRef.current);
        recordingTimerRef.current = null;
      }
    } else {
      recordedChunksRef.current = [];
      const recorder = new MediaRecorder(stream, { mimeType: "video/webm;codecs=vp9,opus" });
      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) recordedChunksRef.current.push(e.data);
      };
      recorder.onstop = () => {
        const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
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
      setIsPaused(false);
      setRecordingTime(0);
      recordingTimerRef.current = setInterval(() => {
        setRecordingTime((prev) => prev + 1);
      }, 1000);
    }
  }, [stream, isRecording]);

  const formatTime = (seconds: number) => {
    const m = Math.floor(seconds / 60).toString().padStart(2, "0");
    const s = (seconds % 60).toString().padStart(2, "0");
    return `${m}:${s}`;
  };

  const togglePause = useCallback(() => {
    if (!stream || !videoRef.current) return;
    const videoTrack = stream.getVideoTracks()[0];
    if (!videoTrack) return;

    if (isPaused) {
      // Resume: remove frozen frame overlay
      videoTrack.enabled = true;
      if (mediaRecorderRef.current?.state === "paused") {
        mediaRecorderRef.current.resume();
      }
    } else {
      // Pause: capture current frame as overlay, then disable track
      const video = videoRef.current;
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (ctx) {
        ctx.drawImage(video, 0, 0);
        pauseCanvasRef.current = canvas;
      }
      videoTrack.enabled = false;
      if (mediaRecorderRef.current?.state === "recording") {
        mediaRecorderRef.current.pause();
      }
    }
    setIsPaused(!isPaused);
  }, [stream, isPaused, videoRef]);

  const handleSnapshot = useCallback(() => {
    if (!stream || !videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(video, 0, 0);
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
            <span className="font-extrabold text-base text-white drop-shadow">카메라</span>
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
              <p className="text-white/80 text-sm font-bold">카메라 연결 중...</p>
            </div>
          ) : error && !stream ? (
            <div className="aspect-video rounded-xl bg-black/40 flex flex-col items-center justify-center gap-3 p-4">
              <p className="text-white/80 text-center whitespace-pre-line text-sm font-semibold">{error}</p>
              <Button
                onClick={startCamera}
                disabled={isLoading}
                className="bg-white/15 border border-white/20 text-white hover:bg-white/25 font-bold text-xs backdrop-blur-sm"
              >
                {isLoading ? <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" /> : null}
                다시 시도
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
          <div className="flex items-center justify-center gap-5 px-4 py-3">
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
            <span className="font-extrabold text-base text-white drop-shadow">스냅샷</span>
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
              저장하기
            </Button>
            <Button
              onClick={() => setSnapshotPreview(null)}
              className="flex-1 bg-white/10 border border-white/15 text-white/80 hover:bg-white/20 font-bold text-xs backdrop-blur-sm"
            >
              닫기
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
