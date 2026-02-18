/**
 * Window 타입 확장 (L-15)
 * 
 * `window as any` 사용을 제거하고 타입 안전성을 확보합니다.
 */

interface BatteryManager extends EventTarget {
  readonly charging: boolean;
  readonly chargingTime: number;
  readonly dischargingTime: number;
  readonly level: number;
  addEventListener(type: "chargingchange" | "chargingtimechange" | "dischargingtimechange" | "levelchange", listener: EventListener): void;
  removeEventListener(type: "chargingchange" | "chargingtimechange" | "dischargingtimechange" | "levelchange", listener: EventListener): void;
}

interface NetworkInformation extends EventTarget {
  readonly type?: string;
  readonly effectiveType?: string;
  readonly downlink?: number;
  readonly rtt?: number;
  readonly saveData?: boolean;
  addEventListener(type: "change", listener: EventListener): void;
  removeEventListener(type: "change", listener: EventListener): void;
}

interface Navigator {
  getBattery?(): Promise<BatteryManager>;
  readonly connection?: NetworkInformation;
  readonly mozConnection?: NetworkInformation;
  readonly webkitConnection?: NetworkInformation;
}

interface Window {
  AudioContext: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}
