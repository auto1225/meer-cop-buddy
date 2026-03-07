// Streaming quality presets
export type StreamingQuality = "vga" | "hd" | "fhd";

export const QUALITY_CONSTRAINTS: Record<StreamingQuality, MediaTrackConstraints> = {
  vga: {
    width: { ideal: 640, max: 640 },
    height: { ideal: 480, max: 480 },
    frameRate: { ideal: 15, max: 30 },
    facingMode: { ideal: "user" },
  },
  hd: {
    width: { ideal: 1280, max: 1280 },
    height: { ideal: 720, max: 720 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: { ideal: "user" },
  },
  fhd: {
    width: { ideal: 1920, max: 1920 },
    height: { ideal: 1080, max: 1080 },
    frameRate: { ideal: 24, max: 30 },
    facingMode: { ideal: "user" },
  },
};

export function getVideoConstraints(quality?: string): MediaTrackConstraints {
  const q = (quality || "vga") as StreamingQuality;
  return QUALITY_CONSTRAINTS[q] || QUALITY_CONSTRAINTS.vga;
}

/**
 * 비디오 트랙이 실제로 프레임을 생성할 때까지 대기합니다.
 * Android 태블릿 등 모바일 기기에서 카메라 하드웨어 워밍업 시간이 필요합니다.
 * 
 * @param track - 확인할 비디오 트랙
 * @param timeoutMs - 최대 대기 시간 (기본 5000ms)
 * @returns 프레임 생성 여부
 */
export async function waitForVideoFrames(track: MediaStreamTrack, timeoutMs = 5000): Promise<boolean> {
  if (track.kind !== "video" || track.readyState !== "live") return false;

  // 방법 1: requestVideoFrameCallback 지원 시 (Chrome 83+)
  if ("requestVideoFrameCallback" in HTMLVideoElement.prototype) {
    return new Promise<boolean>((resolve) => {
      const tempVideo = document.createElement("video");
      tempVideo.srcObject = new MediaStream([track]);
      tempVideo.muted = true;
      tempVideo.playsInline = true;

      const timeout = setTimeout(() => {
        tempVideo.srcObject = null;
        console.warn("[waitForVideoFrames] ⏰ Timeout — proceeding anyway");
        resolve(true); // proceed anyway rather than fail
      }, timeoutMs);

      tempVideo.play().then(() => {
        (tempVideo as any).requestVideoFrameCallback(() => {
          clearTimeout(timeout);
          tempVideo.srcObject = null;
          console.log("[waitForVideoFrames] ✅ First video frame produced");
          resolve(true);
        });
      }).catch(() => {
        clearTimeout(timeout);
        tempVideo.srcObject = null;
        resolve(true); // proceed anyway
      });
    });
  }

  // 방법 2: 폴백 — 고정 대기 (모바일 카메라 초기화 시간)
  const isMobile = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
  const warmupDelay = isMobile ? 1500 : 500;
  console.log(`[waitForVideoFrames] ⏳ Waiting ${warmupDelay}ms for camera warm-up (mobile=${isMobile})`);
  await new Promise(r => setTimeout(r, warmupDelay));
  return track.readyState === "live";
}