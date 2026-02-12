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

  constructor(
    private motionThreshold: number = 15, // 전체 픽셀 중 변화율(%) 임계값
    private consecutiveRequired: number = 2, // 연속 초과 프레임 수
    private cooldownMs: number = 30000 // 감지 후 쿨다운 (ms)
  ) {}

  /**
   * 새 프레임을 분석하고 모션 감지 여부를 반환
   * 
   * @returns { detected: boolean, changePercent: number }
   */
  analyze(currentFrame: ImageData): { detected: boolean; changePercent: number } {
    if (!this.prevFrame) {
      this.prevFrame = currentFrame;
      return { detected: false, changePercent: 0 };
    }

    const changePercent = compareFrames(this.prevFrame, currentFrame);
    this.prevFrame = currentFrame;

    // 쿨다운 중이면 무시
    const now = Date.now();
    if (now - this.lastTriggerTime < this.cooldownMs) {
      return { detected: false, changePercent };
    }

    if (changePercent >= this.motionThreshold) {
      this.consecutiveCount++;

      if (this.consecutiveCount >= this.consecutiveRequired) {
        this.consecutiveCount = 0;
        this.lastTriggerTime = now;
        return { detected: true, changePercent };
      }
    } else {
      // 연속성이 깨지면 리셋
      this.consecutiveCount = 0;
    }

    return { detected: false, changePercent };
  }

  /** 상태 초기화 */
  reset(): void {
    this.prevFrame = null;
    this.consecutiveCount = 0;
    this.lastTriggerTime = 0;
  }
}
