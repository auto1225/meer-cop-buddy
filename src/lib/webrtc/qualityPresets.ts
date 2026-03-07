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
 * 3단계 검증:
 * 1. muted 상태면 unmute 이벤트 대기
 * 2. requestVideoFrameCallback으로 첫 프레임 대기
 * 3. Canvas로 실제 픽셀이 검정이 아닌지 확인
 */
export async function waitForVideoFrames(track: MediaStreamTrack, timeoutMs = 8000): Promise<boolean> {
  if (track.kind !== "video" || track.readyState !== "live") return false;

  const isMobile = /Android|iPad|iPhone|iPod/i.test(navigator.userAgent);
  console.log(`[waitForVideoFrames] 🎬 Starting (mobile=${isMobile}, muted=${track.muted}, enabled=${track.enabled})`);

  // 1단계: track.enabled 강제 활성화
  if (!track.enabled) {
    track.enabled = true;
    console.log("[waitForVideoFrames] 🔧 Force-enabled track");
  }

  // 2단계: muted 상태면 unmute 대기 (Android에서 흔함)
  if (track.muted) {
    console.log("[waitForVideoFrames] 🔇 Track is muted, waiting for unmute...");
    const unmuted = await new Promise<boolean>((resolve) => {
      const timeout = setTimeout(() => {
        console.warn("[waitForVideoFrames] ⏰ Unmute timeout — proceeding");
        resolve(false);
      }, Math.min(timeoutMs / 2, 4000));

      track.onunmute = () => {
        clearTimeout(timeout);
        console.log("[waitForVideoFrames] 🔊 Track unmuted!");
        track.onunmute = null;
        resolve(true);
      };
    });

    if (!unmuted) {
      // muted timeout이지만 계속 진행 (간헐적으로 muted 상태여도 프레임은 전송됨)
      console.warn("[waitForVideoFrames] ⚠️ Still muted, but proceeding with pixel check");
    }
  }

  // 3단계: 실제 비디오 프레임 확인 (Canvas 픽셀 검증)
  return new Promise<boolean>((resolve) => {
    const tempVideo = document.createElement("video");
    tempVideo.srcObject = new MediaStream([track]);
    tempVideo.muted = true;
    tempVideo.playsInline = true;
    tempVideo.setAttribute("playsinline", "true");
    tempVideo.setAttribute("webkit-playsinline", "true");

    const canvas = document.createElement("canvas");
    canvas.width = 64;
    canvas.height = 48;
    const ctx = canvas.getContext("2d");

    let resolved = false;
    let checkCount = 0;
    const MAX_CHECKS = 20; // 최대 20번 체크 (약 4초)
    const CHECK_INTERVAL = 200;

    const cleanup = () => {
      if (intervalId) clearInterval(intervalId);
      if (timeoutId) clearTimeout(timeoutId);
      tempVideo.srcObject = null;
      tempVideo.remove();
    };

    const checkPixels = () => {
      if (resolved || !ctx) return;
      checkCount++;

      try {
        ctx.drawImage(tempVideo, 0, 0, canvas.width, canvas.height);
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const pixels = imageData.data;

        // 전체 픽셀 중 비검정 픽셀 비율 확인
        let nonBlackPixels = 0;
        const totalPixels = pixels.length / 4;
        for (let i = 0; i < pixels.length; i += 4) {
          // R, G, B 중 하나라도 10 이상이면 비검정
          if (pixels[i] > 10 || pixels[i + 1] > 10 || pixels[i + 2] > 10) {
            nonBlackPixels++;
          }
        }

        const ratio = nonBlackPixels / totalPixels;
        console.log(`[waitForVideoFrames] 📊 Check ${checkCount}: non-black=${(ratio * 100).toFixed(1)}% (${nonBlackPixels}/${totalPixels})`);

        if (ratio > 0.01) { // 1% 이상 비검정 → 실제 영상
          resolved = true;
          cleanup();
          console.log("[waitForVideoFrames] ✅ Real video frames detected!");
          resolve(true);
        }
      } catch (e) {
        // Canvas draw 실패 (보안 정책 등) — 무시하고 계속
      }

      if (checkCount >= MAX_CHECKS && !resolved) {
        resolved = true;
        cleanup();
        console.warn("[waitForVideoFrames] ⏰ Max checks reached — proceeding anyway");
        resolve(true);
      }
    };

    const timeoutId = setTimeout(() => {
      if (!resolved) {
        resolved = true;
        cleanup();
        console.warn("[waitForVideoFrames] ⏰ Overall timeout — proceeding");
        resolve(true);
      }
    }, timeoutMs);

    let intervalId: ReturnType<typeof setInterval> | null = null;

    tempVideo.play().then(() => {
      console.log("[waitForVideoFrames] ▶️ Temp video playing");
      // 첫 체크 전 짧은 대기 (카메라 첫 프레임 생성 시간)
      setTimeout(() => {
        checkPixels();
        intervalId = setInterval(checkPixels, CHECK_INTERVAL);
      }, isMobile ? 500 : 200);
    }).catch((e) => {
      console.warn("[waitForVideoFrames] ⚠️ Temp video play failed:", e);
      // play 실패해도 모바일에서는 추가 대기 후 진행
      if (!resolved) {
        const fallbackDelay = isMobile ? 2000 : 800;
        console.log(`[waitForVideoFrames] ⏳ Fallback wait ${fallbackDelay}ms`);
        setTimeout(() => {
          if (!resolved) {
            resolved = true;
            cleanup();
            resolve(true);
          }
        }, fallbackDelay);
      }
    });
  });
}