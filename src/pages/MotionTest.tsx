import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MotionDetector, captureFrameData } from "@/lib/motionDetection";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft, Camera, Activity, Settings, List } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

const MotionTest = () => {
  const navigate = useNavigate();
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const analysisCanvasRef = useRef<HTMLCanvasElement>(null);
  const diffCanvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const prevFrameRef = useRef<ImageData | null>(null);
  const detectorRef = useRef<MotionDetector | null>(null);
  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const [isRunning, setIsRunning] = useState(false);
  const [changePercent, setChangePercent] = useState(0);
  const [consecutiveCount, setConsecutiveCount] = useState(0);
  const [eventLog, setEventLog] = useState<string[]>([]);
  const [threshold, setThreshold] = useState(15);
  const [consecutiveRequired, setConsecutiveRequired] = useState(2);
  const [cooldown, setCooldown] = useState(1);
  const [peakPercent, setPeakPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const { t } = useTranslation();

  const glass = "rounded-2xl border border-white/20 bg-white/15 backdrop-blur-xl shadow-[0_8px_32px_rgba(0,0,0,0.08)]";

  const addLog = useCallback((msg: string) => {
    const time = new Date().toLocaleTimeString("ko-KR", { hour12: false });
    setEventLog(prev => [`[${time}] ${msg}`, ...prev].slice(0, 50));
  }, []);

  const startCamera = useCallback(async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { width: { ideal: 640 }, height: { ideal: 480 } },
        audio: false,
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        await videoRef.current.play();
      }

      detectorRef.current = new MotionDetector(threshold, consecutiveRequired, cooldown * 1000);
      prevFrameRef.current = null;
      setIsRunning(true);
      setError(null);
      addLog(t("motion.cameraStarted"));

      intervalRef.current = setInterval(() => {
        if (!videoRef.current || !analysisCanvasRef.current || !detectorRef.current) return;

        const frameData = captureFrameData(videoRef.current, analysisCanvasRef.current);
        if (!frameData) return;

        const result = detectorRef.current.analyze(frameData);
        setChangePercent(result.changePercent);

        if (result.changePercent > 0) {
          setPeakPercent(prev => Math.max(prev, result.changePercent));
        }

        if (result.changePercent >= threshold) {
          setConsecutiveCount(prev => prev + 1);
        } else {
          setConsecutiveCount(0);
        }

        if (prevFrameRef.current && diffCanvasRef.current) {
          renderDiffVisualization(prevFrameRef.current, frameData, diffCanvasRef.current);
        }
        prevFrameRef.current = frameData;

        if (result.detected) {
          addLog(`${t("motion.detected")}: ${result.changePercent.toFixed(1)}%`);
        }
      }, 1000);
    } catch (err: any) {
      setError(err.message || t("motion.cameraError"));
      addLog(`❌ ${err.message}`);
    }
  }, [threshold, consecutiveRequired, cooldown, addLog, t]);

  const stopCamera = useCallback(() => {
    if (intervalRef.current) {
      clearInterval(intervalRef.current);
      intervalRef.current = null;
    }
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(t => t.stop());
      streamRef.current = null;
    }
    detectorRef.current?.reset();
    detectorRef.current = null;
    prevFrameRef.current = null;
    setIsRunning(false);
    setChangePercent(0);
    setConsecutiveCount(0);
    addLog(t("motion.cameraStopped"));
  }, [addLog, t]);

  const resetPeak = () => setPeakPercent(0);

  useEffect(() => {
    if (isRunning && detectorRef.current) {
      detectorRef.current = new MotionDetector(threshold, consecutiveRequired, cooldown * 1000);
      addLog(`${t("motion.settingsChanged")}: ${threshold}%, ${consecutiveRequired}${t("motion.times")}, ${cooldown}${t("motion.seconds")}`);
    }
  }, [threshold, consecutiveRequired, cooldown, isRunning, addLog, t]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  function renderDiffVisualization(prev: ImageData, curr: ImageData, canvas: HTMLCanvasElement) {
    canvas.width = 160;
    canvas.height = 120;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const output = ctx.createImageData(160, 120);
    for (let i = 0; i < prev.data.length; i += 4) {
      const dr = Math.abs(prev.data[i] - curr.data[i]);
      const dg = Math.abs(prev.data[i + 1] - curr.data[i + 1]);
      const db = Math.abs(prev.data[i + 2] - curr.data[i + 2]);
      const avg = (dr + dg + db) / 3;

      if (avg > 30) {
        output.data[i] = 255;
        output.data[i + 1] = 80;
        output.data[i + 2] = 80;
        output.data[i + 3] = 220;
      } else {
        output.data[i] = curr.data[i] * 0.3;
        output.data[i + 1] = curr.data[i + 1] * 0.3;
        output.data[i + 2] = curr.data[i + 2] * 0.3;
        output.data[i + 3] = 255;
      }
    }
    ctx.putImageData(output, 0, 0);
  }

  const getBarColor = (pct: number) => {
    if (pct >= threshold) return "bg-destructive";
    if (pct >= threshold * 0.6) return "bg-warning";
    return "bg-success";
  };

  return (
    <div
      className="min-h-screen p-4"
      style={{
        background: "linear-gradient(180deg, hsl(199 85% 60%) 0%, hsl(199 80% 50%) 100%)",
      }}
    >
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <button
          onClick={() => navigate("/")}
          className="w-8 h-8 flex items-center justify-center rounded-full bg-white/20 hover:bg-white/30 backdrop-blur-sm transition-colors"
        >
          <ArrowLeft className="h-4 w-4 text-white drop-shadow-sm" />
        </button>
        <h1 className="text-base font-extrabold text-white drop-shadow-[0_1px_3px_rgba(0,0,0,0.25)]">
          {t("motion.title")}
        </h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 max-w-6xl mx-auto">
        {/* Left Column */}
        <div className="space-y-3">
          {/* Camera Feed */}
          <section className={glass + " p-3"}>
            <h3 className="text-[11px] font-extrabold text-white/80 mb-2 flex items-center gap-1.5 drop-shadow-sm">
              <Camera className="w-3.5 h-3.5 text-secondary" />
              {t("motion.cameraFeed")}
            </h3>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded-xl bg-black/30 aspect-video"
            />
            <canvas ref={canvasRef} className="hidden" />
            <canvas ref={analysisCanvasRef} className="hidden" />
          </section>

          {/* Diff Visualization */}
          <section className={glass + " p-3"}>
            <h3 className="text-[11px] font-extrabold text-white/80 mb-2 drop-shadow-sm">
              {t("motion.diffVisualization")}
            </h3>
            <canvas
              ref={diffCanvasRef}
              className="w-full rounded-xl bg-black/30"
              style={{ imageRendering: "pixelated", aspectRatio: "4/3" }}
            />
          </section>

          {/* Start/Stop */}
          <div className="flex gap-2">
            {!isRunning ? (
              <button
                onClick={startCamera}
                className={`${glass} flex-1 py-3 text-sm font-extrabold text-white hover:bg-white/25 transition-all drop-shadow-sm`}
              >
                {t("motion.startTest")}
              </button>
            ) : (
              <button
                onClick={stopCamera}
                className="flex-1 py-3 text-sm font-extrabold text-white rounded-2xl border border-destructive/40 bg-destructive/20 backdrop-blur-xl hover:bg-destructive/30 transition-all drop-shadow-sm"
              >
                {t("motion.stop")}
              </button>
            )}
          </div>
          {error && <p className="text-destructive-foreground bg-destructive/20 rounded-xl px-3 py-2 text-xs font-bold backdrop-blur-sm">{error}</p>}
        </div>

        {/* Right Column */}
        <div className="space-y-3">
          {/* Real-time Stats */}
          <section className={glass + " p-3"}>
            <h3 className="text-[11px] font-extrabold text-white/80 mb-2.5 flex items-center gap-1.5 drop-shadow-sm">
              <Activity className="w-3.5 h-3.5 text-secondary" />
              {t("motion.realtimeStatus")}
            </h3>

            {/* Change Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-xs mb-1">
                <span className="font-bold text-white/80 drop-shadow-sm">{t("motion.changeRate")}</span>
                <span className={`font-extrabold drop-shadow-sm ${changePercent >= threshold ? "text-destructive-foreground" : "text-white"}`}>
                  {changePercent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-white/10 rounded-full h-5 relative overflow-hidden backdrop-blur-sm">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getBarColor(changePercent)}`}
                  style={{ width: `${Math.min(changePercent, 100)}%` }}
                />
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white/70"
                  style={{ left: `${threshold}%` }}
                />
                <span
                  className="absolute text-[9px] font-bold text-white/80 top-0.5 drop-shadow-sm"
                  style={{ left: `${Math.min(threshold + 1, 85)}%` }}
                >
                  {threshold}%
                </span>
              </div>
            </div>

            {/* Stats Cards */}
            <div className="grid grid-cols-2 gap-2">
              <div className="rounded-xl bg-white/10 backdrop-blur-sm p-2.5 text-center">
                <div className="text-[10px] font-bold text-white/60">{t("motion.consecutiveDetection")}</div>
                <div className={`text-xl font-extrabold drop-shadow-sm ${consecutiveCount >= consecutiveRequired ? "text-destructive-foreground" : "text-white"}`}>
                  {consecutiveCount} / {consecutiveRequired}
                </div>
              </div>
              <div className="rounded-xl bg-white/10 backdrop-blur-sm p-2.5 text-center">
                <div className="text-[10px] font-bold text-white/60">{t("motion.maxChangeRate")}</div>
                <div className="text-xl font-extrabold text-secondary drop-shadow-sm">{peakPercent.toFixed(1)}%</div>
                <button onClick={resetPeak} className="text-[9px] text-white/50 underline font-semibold">{t("motion.reset")}</button>
              </div>
            </div>
          </section>

          {/* Settings */}
          <section className={glass + " p-3"}>
            <h3 className="text-[11px] font-extrabold text-white/80 mb-2.5 flex items-center gap-1.5 drop-shadow-sm">
              <Settings className="w-3.5 h-3.5 text-secondary" />
              {t("motion.sensitivitySettings")}
            </h3>

            <div className="space-y-3">
              {/* Sensitivity Presets */}
              <div className="grid grid-cols-3 gap-1.5">
                {[
                  { label: t("motion.sensitive"), value: 10, emoji: "🔴" },
                  { label: t("motion.normal"), value: 50, emoji: "🟡" },
                  { label: t("motion.insensitive"), value: 80, emoji: "🟢" },
                ].map((opt) => (
                  <button
                    key={opt.value}
                    onClick={() => setThreshold(opt.value)}
                    className={`rounded-xl p-2 text-center transition-all ${
                      threshold === opt.value
                        ? "bg-secondary/25 ring-1 ring-secondary/50"
                        : "bg-white/8 hover:bg-white/12"
                    }`}
                  >
                    <div className="text-sm">{opt.emoji}</div>
                    <div className={`text-[11px] font-extrabold drop-shadow-sm ${threshold === opt.value ? "text-secondary" : "text-white/80"}`}>{opt.label}</div>
                    <div className="text-[9px] font-bold text-white/50">{opt.value}%</div>
                  </button>
                ))}
              </div>

              {/* Consecutive Frames */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-white/80 drop-shadow-sm">{t("motion.consecutiveFrames")}</span>
                  <span className="font-extrabold text-secondary drop-shadow-sm">{consecutiveRequired}{t("motion.times")}</span>
                </div>
                <Slider
                  value={[consecutiveRequired]}
                  onValueChange={([v]) => setConsecutiveRequired(v)}
                  min={1}
                  max={5}
                  step={1}
                  className="w-full"
                />
              </div>

              {/* Cooldown */}
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="font-bold text-white/80 drop-shadow-sm">{t("motion.cooldown")}</span>
                  <span className="font-extrabold text-secondary drop-shadow-sm">{cooldown}{t("motion.seconds")}</span>
                </div>
                <Slider
                  value={[cooldown]}
                  onValueChange={([v]) => setCooldown(v)}
                  min={1}
                  max={60}
                  step={1}
                  className="w-full"
                />
              </div>
            </div>
          </section>

          {/* Event Log */}
          <section className={glass + " p-3"}>
            <h3 className="text-[11px] font-extrabold text-white/80 mb-2 flex items-center gap-1.5 drop-shadow-sm">
              <List className="w-3.5 h-3.5 text-secondary" />
              {t("motion.eventLog")}
            </h3>
            <div className="h-40 overflow-y-auto styled-scrollbar text-[10px] font-mono space-y-0.5">
              {eventLog.length === 0 && (
                <p className="text-white/40 font-sans text-xs">{t("motion.emptyLog")}</p>
              )}
              {eventLog.map((log, i) => (
                <div key={i} className={`drop-shadow-sm ${log.includes("🚨") ? "text-destructive-foreground font-bold" : "text-white/80"}`}>
                  {log}
                </div>
              ))}
            </div>
          </section>
        </div>
      </div>
    </div>
  );
};

export default MotionTest;
