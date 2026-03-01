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

// WebHID API
interface HIDDevice {
  readonly opened: boolean;
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
}

interface HIDConnectionEvent extends Event {
  readonly device: HIDDevice;
}

interface HID extends EventTarget {
  getDevices(): Promise<HIDDevice[]>;
  requestDevice(options: { filters: Array<{ vendorId?: number; productId?: number }> }): Promise<HIDDevice[]>;
  addEventListener(type: "connect" | "disconnect", listener: (e: HIDConnectionEvent) => void): void;
  removeEventListener(type: "connect" | "disconnect", listener: (e: HIDConnectionEvent) => void): void;
}

// WebUSB API
interface USBDevice {
  readonly vendorId: number;
  readonly productId: number;
  readonly productName: string;
}

interface USBConnectionEvent extends Event {
  readonly device: USBDevice;
}

interface USB extends EventTarget {
  getDevices(): Promise<USBDevice[]>;
  requestDevice(options: { filters: Array<{ vendorId?: number; productId?: number }> }): Promise<USBDevice>;
  addEventListener(type: "connect" | "disconnect", listener: (e: USBConnectionEvent) => void): void;
  removeEventListener(type: "connect" | "disconnect", listener: (e: USBConnectionEvent) => void): void;
}

interface Navigator {
  getBattery?(): Promise<BatteryManager>;
  readonly connection?: NetworkInformation;
  readonly mozConnection?: NetworkInformation;
  readonly webkitConnection?: NetworkInformation;
  readonly hid?: HID;
  readonly usb?: USB;
}

interface Window {
  AudioContext: typeof AudioContext;
  webkitAudioContext?: typeof AudioContext;
}
