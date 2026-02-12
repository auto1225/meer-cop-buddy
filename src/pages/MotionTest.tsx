import React, { useState, useRef, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { MotionDetector, captureFrameData, compareFrames } from "@/lib/motionDetection";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { ArrowLeft } from "lucide-react";

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
  const [cooldown, setCooldown] = useState(1); // 테스트용 짧은 쿨다운
  const [peakPercent, setPeakPercent] = useState(0);
  const [error, setError] = useState<string | null>(null);

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
      addLog("✅ 카메라 시작됨");

      intervalRef.current = setInterval(() => {
        if (!videoRef.current || !analysisCanvasRef.current || !detectorRef.current) return;

        const frameData = captureFrameData(videoRef.current, analysisCanvasRef.current);
        if (!frameData) return;

        const result = detectorRef.current.analyze(frameData);
        setChangePercent(result.changePercent);

        if (result.changePercent > 0) {
          setPeakPercent(prev => Math.max(prev, result.changePercent));
        }

        // 연속 카운트 표시 (내부 상태 추적)
        if (result.changePercent >= threshold) {
          setConsecutiveCount(prev => prev + 1);
        } else {
          setConsecutiveCount(0);
        }

        // 차이 시각화
        if (prevFrameRef.current && diffCanvasRef.current) {
          renderDiffVisualization(prevFrameRef.current, frameData, diffCanvasRef.current);
        }
        prevFrameRef.current = frameData;

        if (result.detected) {
          addLog(`🚨 모션 감지! 변화율: ${result.changePercent.toFixed(1)}%`);
        }
      }, 1000);

    } catch (err: any) {
      setError(err.message || "카메라를 시작할 수 없습니다.");
      addLog(`❌ 카메라 오류: ${err.message}`);
    }
  }, [threshold, consecutiveRequired, cooldown, addLog]);

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
    addLog("⏹ 카메라 중지됨");
  }, [addLog]);

  const resetPeak = () => setPeakPercent(0);

  // 설정 변경 시 감지기 재생성
  useEffect(() => {
    if (isRunning && detectorRef.current) {
      detectorRef.current = new MotionDetector(threshold, consecutiveRequired, cooldown * 1000);
      addLog(`⚙️ 설정 변경: 임계값=${threshold}%, 연속=${consecutiveRequired}회, 쿨다운=${cooldown}초`);
    }
  }, [threshold, consecutiveRequired, cooldown, isRunning, addLog]);

  useEffect(() => {
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
      if (streamRef.current) streamRef.current.getTracks().forEach(t => t.stop());
    };
  }, []);

  // 변화 부분을 빨간색으로 시각화
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
        // 변화된 픽셀: 빨강
        output.data[i] = 255;
        output.data[i + 1] = 0;
        output.data[i + 2] = 0;
        output.data[i + 3] = 200;
      } else {
        // 변화 없음: 어두운 원본
        output.data[i] = curr.data[i] * 0.3;
        output.data[i + 1] = curr.data[i + 1] * 0.3;
        output.data[i + 2] = curr.data[i + 2] * 0.3;
        output.data[i + 3] = 255;
      }
    }
    ctx.putImageData(output, 0, 0);
  }

  const getBarColor = (pct: number) => {
    if (pct >= threshold) return "bg-red-500";
    if (pct >= threshold * 0.6) return "bg-yellow-500";
    return "bg-green-500";
  };

  return (
    <div className="min-h-screen bg-gray-900 text-white p-4">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4">
        <Button variant="ghost" size="icon" onClick={() => navigate("/")} className="text-white">
          <ArrowLeft className="h-5 w-5" />
        </Button>
        <h1 className="text-xl font-bold">🔬 모션 감지 테스트</h1>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 max-w-6xl mx-auto">
        {/* Left: Camera + Diff */}
        <div className="space-y-4">
          {/* Camera Feed */}
          <div className="bg-gray-800 rounded-lg p-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-400">📹 카메라 피드</h3>
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full rounded bg-black aspect-video"
            />
            <canvas ref={canvasRef} className="hidden" />
            <canvas ref={analysisCanvasRef} className="hidden" />
          </div>

          {/* Diff Visualization */}
          <div className="bg-gray-800 rounded-lg p-3">
            <h3 className="text-sm font-semibold mb-2 text-gray-400">🔴 변화 감지 시각화 (빨간색 = 변화 영역)</h3>
            <canvas
              ref={diffCanvasRef}
              className="w-full rounded bg-black"
              style={{ imageRendering: "pixelated", aspectRatio: "4/3" }}
            />
          </div>

          {/* Controls */}
          <div className="flex gap-2">
            {!isRunning ? (
              <Button onClick={startCamera} className="flex-1 bg-green-600 hover:bg-green-700">
                ▶ 테스트 시작
              </Button>
            ) : (
              <Button onClick={stopCamera} className="flex-1 bg-red-600 hover:bg-red-700">
                ⏹ 중지
              </Button>
            )}
          </div>
          {error && <p className="text-red-400 text-sm">{error}</p>}
        </div>

        {/* Right: Stats + Settings + Log */}
        <div className="space-y-4">
          {/* Real-time Stats */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-400">📊 실시간 감지 상태</h3>
            
            {/* Change Percent Bar */}
            <div className="mb-3">
              <div className="flex justify-between text-sm mb-1">
                <span>변화율</span>
                <span className={changePercent >= threshold ? "text-red-400 font-bold" : ""}>
                  {changePercent.toFixed(1)}%
                </span>
              </div>
              <div className="w-full bg-gray-700 rounded-full h-6 relative overflow-hidden">
                <div
                  className={`h-full rounded-full transition-all duration-300 ${getBarColor(changePercent)}`}
                  style={{ width: `${Math.min(changePercent, 100)}%` }}
                />
                {/* Threshold line */}
                <div
                  className="absolute top-0 bottom-0 w-0.5 bg-white/80"
                  style={{ left: `${threshold}%` }}
                />
                <span
                  className="absolute text-[10px] text-white/70 top-0"
                  style={{ left: `${threshold + 1}%` }}
                >
                  임계값 {threshold}%
                </span>
              </div>
            </div>

            {/* Consecutive Count */}
            <div className="flex gap-4 text-sm">
              <div className="flex-1 bg-gray-700 rounded p-2 text-center">
                <div className="text-gray-400 text-xs">연속 감지</div>
                <div className={`text-2xl font-bold ${consecutiveCount >= consecutiveRequired ? "text-red-400" : "text-white"}`}>
                  {consecutiveCount} / {consecutiveRequired}
                </div>
              </div>
              <div className="flex-1 bg-gray-700 rounded p-2 text-center">
                <div className="text-gray-400 text-xs">최대 변화율</div>
                <div className="text-2xl font-bold text-yellow-400">{peakPercent.toFixed(1)}%</div>
                <button onClick={resetPeak} className="text-[10px] text-gray-500 underline">리셋</button>
              </div>
            </div>
          </div>

          {/* Settings */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-3 text-gray-400">⚙️ 감도 설정 (실시간 적용)</h3>
            
            <div className="space-y-4">
            <div>
                <div className="text-sm mb-2">감지 민감도</div>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "민감", value: 10, desc: "작은 움직임도 감지", emoji: "🔴" },
                    { label: "보통", value: 50, desc: "일반적인 움직임 감지", emoji: "🟡" },
                    { label: "둔감", value: 80, desc: "큰 움직임만 감지", emoji: "🟢" },
                  ].map((opt) => (
                    <button
                      key={opt.value}
                      onClick={() => setThreshold(opt.value)}
                      className={`rounded-lg p-3 text-center transition-all border-2 ${
                        threshold === opt.value
                          ? "border-yellow-400 bg-yellow-400/10"
                          : "border-gray-600 bg-gray-700 hover:border-gray-500"
                      }`}
                    >
                      <div className="text-lg">{opt.emoji}</div>
                      <div className="text-sm font-bold">{opt.label}</div>
                      <div className="text-[10px] text-gray-400">{opt.desc}</div>
                      <div className="text-[10px] text-yellow-400/70 mt-1">{opt.value}%</div>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>연속 프레임 필요 수</span>
                  <span className="text-yellow-400">{consecutiveRequired}회</span>
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

              <div>
                <div className="flex justify-between text-sm mb-1">
                  <span>쿨다운 시간</span>
                  <span className="text-yellow-400">{cooldown}초</span>
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
          </div>

          {/* Event Log */}
          <div className="bg-gray-800 rounded-lg p-4">
            <h3 className="text-sm font-semibold mb-2 text-gray-400">📋 이벤트 로그</h3>
            <div className="h-48 overflow-y-auto text-xs font-mono space-y-0.5">
              {eventLog.length === 0 && (
                <p className="text-gray-500">테스트를 시작하면 이벤트가 표시됩니다</p>
              )}
              {eventLog.map((log, i) => (
                <div key={i} className={log.includes("🚨") ? "text-red-400 font-bold" : "text-gray-300"}>
                  {log}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default MotionTest;
