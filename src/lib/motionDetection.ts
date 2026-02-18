/**
 * 카메라 프레임 간 모션 감지 알고리즘
 * 
 * 두 프레임의 축소된 이미지를 픽셀 단위로 비교하여
 * 변화율(%)을 계산합니다. 단순 진동/흔들림을 무시하고
 * 큰 움직임만 감지하기 위해 임계값과 연속 프레임 조건을 사용합니다.
 */

// 분석용 축소 해상도 (성능 최적화)
const ANALYSIS_WIDTH = 160;
const ANALYSIS_HEIGHT = 120;

// 픽셀 단위 차이 임계값 (0-255 범위에서 이 이상 차이나면 "변화된 픽셀"로 판정)
const PIXEL_DIFF_THRESHOLD = 30;

/**
 * 비디오 프레임을 축소된 ImageData로 캡처
 */
export function captureFrameData(
  video: HTMLVideoElement,
  canvas: HTMLCanvasElement
): ImageData | null {
  if (video.videoWidth === 0 || video.videoHeight === 0) return null;

  canvas.width = ANALYSIS_WIDTH;
  canvas.height = ANALYSIS_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) return null;

  ctx.drawImage(video, 0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
  return ctx.getImageData(0, 0, ANALYSIS_WIDTH, ANALYSIS_HEIGHT);
}

/**
 * 두 프레임 간 변화율(%) 계산
 * 
 * @returns 0~100 사이의 변화율 (변화된 픽셀 비율)
 */
export function compareFrames(
  prev: ImageData,
  curr: ImageData,
  pixelThreshold: number = PIXEL_DIFF_THRESHOLD
): number {
  const len = prev.data.length;
  if (len !== curr.data.length) return 0;

  const totalPixels = len / 4; // RGBA → 픽셀 수
  let changedPixels = 0;

  for (let i = 0; i < len; i += 4) {
    const dr = Math.abs(prev.data[i] - curr.data[i]);
    const dg = Math.abs(prev.data[i + 1] - curr.data[i + 1]);
    const db = Math.abs(prev.data[i + 2] - curr.data[i + 2]);

    // RGB 평균 차이가 임계값 이상이면 "변화된 픽셀"
    const avgDiff = (dr + dg + db) / 3;
    if (avgDiff > pixelThreshold) {
      changedPixels++;
    }
  }

  return (changedPixels / totalPixels) * 100;
}

/**
 * 모션 감지 상태 관리자
 * 
 * 연속 프레임에서 임계값을 초과하는지 추적하여
 * 단발성 진동과 실제 움직임을 구분합니다.
 */
export class MotionDetector {
  private prevFrame: ImageData | null = null;
  private consecutiveCount = 0;
  private lastTriggerTime = 0;

  // L-11: 적응형 임계값 — 최근 변화율의 이동 평균으로 환경 변화 학습
  private readonly baseThreshold: number;
  private recentChanges: number[] = [];
  private readonly historySize = 30; // 최근 30프레임의 변화율 기록

  constructor(
    private motionThreshold: number = 15,
    private consecutiveRequired: number = 2,
    private cooldownMs: number = 30000
  ) {
    this.baseThreshold = motionThreshold;
  }

  /**
   * 적응형 임계값 계산
   * 환경의 기본 노이즈(조명 변화, 미세 떨림 등)를 학습하여
   * 실제 움직임만 감지하도록 임계값을 동적 조정합니다.
   */
  private getAdaptiveThreshold(): number {
    if (this.recentChanges.length < 10) {
      return this.baseThreshold; // 데이터 부족 시 기본값
    }

    const avg = this.recentChanges.reduce((a, b) => a + b, 0) / this.recentChanges.length;
    const stdDev = Math.sqrt(
      this.recentChanges.reduce((sum, v) => sum + (v - avg) ** 2, 0) / this.recentChanges.length
    );

    // 임계값 = max(기본값, 평균 + 2σ) — 환경 노이즈를 초과하는 움직임만 감지
    const adaptive = Math.max(this.baseThreshold, avg + 2 * stdDev);
    // 기본값의 3배를 상한으로 제한 (너무 둔감해지는 것 방지)
    return Math.min(adaptive, this.baseThreshold * 3);
  }

  analyze(currentFrame: ImageData): { detected: boolean; changePercent: number } {
    if (!this.prevFrame) {
      this.prevFrame = currentFrame;
      return { detected: false, changePercent: 0 };
    }

    const changePercent = compareFrames(this.prevFrame, currentFrame);
    this.prevFrame = currentFrame;

    // 이동 평균 기록 (쿨다운/감지 트리거 시에는 제외)
    const now = Date.now();
    const inCooldown = now - this.lastTriggerTime < this.cooldownMs;
    if (!inCooldown) {
      this.recentChanges.push(changePercent);
      if (this.recentChanges.length > this.historySize) {
        this.recentChanges.shift();
      }
    }

    if (inCooldown) {
      return { detected: false, changePercent };
    }

    const threshold = this.getAdaptiveThreshold();

    if (changePercent >= threshold) {
      this.consecutiveCount++;

      if (this.consecutiveCount >= this.consecutiveRequired) {
        this.consecutiveCount = 0;
        this.lastTriggerTime = now;
        return { detected: true, changePercent };
      }
    } else {
      this.consecutiveCount = 0;
    }

    return { detected: false, changePercent };
  }

  reset(): void {
    this.prevFrame = null;
    this.consecutiveCount = 0;
    this.lastTriggerTime = 0;
    this.recentChanges = [];
  }
}
