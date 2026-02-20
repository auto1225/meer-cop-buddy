/**
 * Web Worker 기반 타이머
 * 
 * 브라우저가 백그라운드 탭의 setInterval을 스로틀링(1초→수십 초)하는 문제를 해결합니다.
 * Web Worker는 탭 활성 여부와 관계없이 정확한 간격으로 실행됩니다.
 */

const workerCode = `
  const timers = new Map();
  
  self.onmessage = (e) => {
    const { action, id, interval } = e.data;
    
    if (action === "start") {
      if (timers.has(id)) clearInterval(timers.get(id));
      const tid = setInterval(() => {
        self.postMessage({ id });
      }, interval);
      timers.set(id, tid);
    } else if (action === "stop") {
      if (timers.has(id)) {
        clearInterval(timers.get(id));
        timers.delete(id);
      }
    } else if (action === "stopAll") {
      timers.forEach((tid) => clearInterval(tid));
      timers.clear();
    }
  };
`;

let worker: Worker | null = null;
const callbacks = new Map<string, () => void>();

function getWorker(): Worker | null {
  if (worker) return worker;
  try {
    const blob = new Blob([workerCode], { type: "application/javascript" });
    const url = URL.createObjectURL(blob);
    worker = new Worker(url);
    worker.onmessage = (e) => {
      const cb = callbacks.get(e.data.id);
      cb?.();
    };
    worker.onerror = (err) => {
      console.warn("[WorkerTimer] Worker error, falling back to setInterval:", err);
      worker = null;
    };
    return worker;
  } catch {
    console.warn("[WorkerTimer] Web Worker unavailable, using setInterval fallback");
    return null;
  }
}

const fallbackTimers = new Map<string, ReturnType<typeof setInterval>>();

/**
 * Web Worker 기반 setInterval 시작
 * Worker 사용 불가 시 일반 setInterval로 폴백
 */
export function startWorkerInterval(
  id: string,
  callback: () => void,
  intervalMs: number
): void {
  stopWorkerInterval(id);
  callbacks.set(id, callback);

  const w = getWorker();
  if (w) {
    w.postMessage({ action: "start", id, interval: intervalMs });
  } else {
    // Fallback
    fallbackTimers.set(id, setInterval(callback, intervalMs));
  }
}

/**
 * 타이머 중지
 */
export function stopWorkerInterval(id: string): void {
  callbacks.delete(id);
  const w = getWorker();
  if (w) {
    w.postMessage({ action: "stop", id });
  }
  const fb = fallbackTimers.get(id);
  if (fb) {
    clearInterval(fb);
    fallbackTimers.delete(id);
  }
}

/**
 * 모든 타이머 중지 및 Worker 종료
 */
export function terminateWorkerTimers(): void {
  callbacks.clear();
  fallbackTimers.forEach((tid) => clearInterval(tid));
  fallbackTimers.clear();
  if (worker) {
    worker.postMessage({ action: "stopAll" });
    worker.terminate();
    worker = null;
  }
}
