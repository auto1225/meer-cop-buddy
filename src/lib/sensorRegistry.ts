/**
 * MeerCOP 통합 센서 레지스트리
 * 
 * 각 센서를 pluggable unit으로 정의하여 체계적으로 관리합니다.
 * attach()/detach() lifecycle을 통해 센서를 동적으로 등록/해제합니다.
 * 
 * 지원 센서:
 *  - keyboard: keydown 이벤트 감지
 *  - mouse: mousemove 누적 이동 거리 기반 감지
 *  - lid: Page Visibility API (document.hidden)
 *  - power: Battery Status API (충전→비충전 전환)
 *  - usb: WebHID / USB API (기기 연결/해제)
 */

import type { SecurityEvent } from "@/hooks/useSecuritySurveillance";

// ── 센서 인터페이스 ──

export interface SensorHandler {
  /** 센서 고유 이름 (SensorToggles 키와 일치) */
  readonly name: string;
  /** 트리거 시 발생하는 SecurityEvent 타입 */
  readonly eventType: SecurityEvent["type"];
  /** 센서 부착 — onTrigger 콜백을 호출하면 경보 발생 */
  attach(onTrigger: () => void): void;
  /** 센서 해제 — 모든 리스너 정리 */
  detach(): void;
  /** 현재 부착 상태 */
  isAttached(): boolean;
}

// ── 키보드 센서 ──

export function createKeyboardSensor(): SensorHandler {
  let handler: ((e: KeyboardEvent) => void) | null = null;
  let attached = false;

  return {
    name: "keyboard",
    eventType: "keyboard",
    attach(onTrigger) {
      if (attached) return;
      handler = (_e: KeyboardEvent) => {
        onTrigger();
      };
      window.addEventListener("keydown", handler);
      attached = true;
      console.log("[Sensor] ✅ keyboard attached");
    },
    detach() {
      if (handler) {
        window.removeEventListener("keydown", handler);
        handler = null;
      }
      attached = false;
    },
    isAttached: () => attached,
  };
}

// ── 마우스 센서 ──

export interface MouseSensorOptions {
  /** 트리거에 필요한 최소 이동 거리 (px) */
  getSensitivity: () => number;
}

export function createMouseSensor(options: MouseSensorOptions): SensorHandler {
  let handler: ((e: MouseEvent) => void) | null = null;
  let attached = false;
  let lastPosition: { x: number; y: number } | null = null;
  let accumDistance = 0;
  let accumStartTime = 0;
  const TIME_WINDOW_MS = 200;

  return {
    name: "mouse",
    eventType: "mouse",
    attach(onTrigger) {
      if (attached) return;
      lastPosition = null;
      accumDistance = 0;
      accumStartTime = 0;

      handler = (e: MouseEvent) => {
        const now = Date.now();
        const pos = { x: e.clientX, y: e.clientY };

        if (lastPosition) {
          const dx = pos.x - lastPosition.x;
          const dy = pos.y - lastPosition.y;
          const dist = Math.sqrt(dx * dx + dy * dy);

          if (now - accumStartTime > TIME_WINDOW_MS) {
            accumDistance = dist;
            accumStartTime = now;
          } else {
            accumDistance += dist;
          }

          if (accumDistance >= options.getSensitivity()) {
            onTrigger();
            accumDistance = 0;
            accumStartTime = now;
          }
        }
        lastPosition = pos;
      };

      window.addEventListener("mousemove", handler);
      attached = true;
      console.log("[Sensor] ✅ mouse attached");
    },
    detach() {
      if (handler) {
        window.removeEventListener("mousemove", handler);
        handler = null;
      }
      lastPosition = null;
      accumDistance = 0;
      attached = false;
    },
    isAttached: () => attached,
  };
}

// ── 덮개(Lid) 센서 ──

export function createLidSensor(): SensorHandler {
  let handler: (() => void) | null = null;
  let attached = false;

  return {
    name: "lid",
    eventType: "lid",
    attach(onTrigger) {
      if (attached) return;
      handler = () => {
        if (document.hidden) {
          console.log("[Sensor] 🔒 Lid closed / screen hidden detected");
          onTrigger();
        }
      };
      document.addEventListener("visibilitychange", handler);
      attached = true;
      console.log("[Sensor] ✅ lid attached");
    },
    detach() {
      if (handler) {
        document.removeEventListener("visibilitychange", handler);
        handler = null;
      }
      attached = false;
    },
    isAttached: () => attached,
  };
}

// ── 전원 케이블(Power) 센서 ──

export function createPowerSensor(): SensorHandler {
  let attached = false;
  let battery: any = null;
  let batteryHandler: (() => void) | null = null;
  let lastChargingState: boolean | null = null;

  return {
    name: "power",
    eventType: "power",
    attach(onTrigger) {
      if (attached) return;
      attached = true;

      const setup = async () => {
        try {
          if (!navigator.getBattery) {
            console.warn("[Sensor] ⚠️ Battery API not supported");
            return;
          }
          battery = await navigator.getBattery();
          lastChargingState = battery.charging;

          batteryHandler = () => {
            const nowCharging = battery.charging;
            // 충전 중 → 비충전 = 케이블 분리
            if (lastChargingState === true && nowCharging === false) {
              console.log("[Sensor] 🔌 Power cable unplugged detected");
              onTrigger();
            }
            lastChargingState = nowCharging;
          };

          battery.addEventListener("chargingchange", batteryHandler);
          console.log("[Sensor] ✅ power attached (charging:", battery.charging, ")");
        } catch (err) {
          console.warn("[Sensor] ⚠️ Battery API error:", err);
        }
      };
      setup();
    },
    detach() {
      if (battery && batteryHandler) {
        battery.removeEventListener("chargingchange", batteryHandler);
      }
      battery = null;
      batteryHandler = null;
      lastChargingState = null;
      attached = false;
    },
    isAttached: () => attached,
  };
}

// ── USB 센서 ──
// WebHID API 또는 USB API를 통해 기기 연결/해제를 감지합니다.
// 브라우저 지원: Chrome/Edge (Chromium 기반)

export function createUsbSensor(): SensorHandler {
  let attached = false;
  const cleanups: Array<() => void> = [];

  const nav = navigator as any;

  return {
    name: "usb",
    eventType: "usb",
    attach(onTrigger) {
      if (attached) return;
      attached = true;

      let anyApiAvailable = false;

      // 1) WebHID API
      if (nav.hid) {
        const onConnect = () => {
          console.log("[Sensor] 🔌 HID device connected");
          onTrigger();
        };
        const onDisconnect = () => {
          console.log("[Sensor] 🔌 HID device disconnected");
          onTrigger();
        };
        nav.hid.addEventListener("connect", onConnect);
        nav.hid.addEventListener("disconnect", onDisconnect);
        cleanups.push(() => {
          nav.hid?.removeEventListener("connect", onConnect);
          nav.hid?.removeEventListener("disconnect", onDisconnect);
        });
        anyApiAvailable = true;
        console.log("[Sensor] ✅ usb attached (HID API)");
      }

      // 2) WebUSB API
      if (nav.usb) {
        const onConnect = () => {
          console.log("[Sensor] 🔌 USB device connected");
          onTrigger();
        };
        const onDisconnect = () => {
          console.log("[Sensor] 🔌 USB device disconnected");
          onTrigger();
        };
        nav.usb.addEventListener("connect", onConnect);
        nav.usb.addEventListener("disconnect", onDisconnect);
        cleanups.push(() => {
          nav.usb?.removeEventListener("connect", onConnect);
          nav.usb?.removeEventListener("disconnect", onDisconnect);
        });
        anyApiAvailable = true;
        console.log("[Sensor] ✅ usb attached (WebUSB API)");
      }

      if (!anyApiAvailable) {
        console.warn("[Sensor] ⚠️ Neither WebHID nor WebUSB API available — USB detection disabled");
      }
    },
    detach() {
      cleanups.forEach(fn => fn());
      cleanups.length = 0;
      attached = false;
    },
    isAttached: () => attached,
  };
}

// ── 센서 레지스트리 ──

export interface SensorRegistryOptions {
  getMouseSensitivity: () => number;
}

export interface SensorRegistry {
  /** 모든 센서 인스턴스 */
  sensors: Map<string, SensorHandler>;
  /** 이름으로 센서 조회 */
  get(name: string): SensorHandler | undefined;
  /** 특정 센서들을 활성화 (onTrigger 콜백으로 연결) */
  attachSensors(
    enabledNames: string[],
    onTrigger: (eventType: SecurityEvent["type"]) => void,
  ): void;
  /** 모든 센서 해제 */
  detachAll(): void;
  /** 현재 활성 센서 목록 */
  getActiveNames(): string[];
}

export function createSensorRegistry(options: SensorRegistryOptions): SensorRegistry {
  const sensors = new Map<string, SensorHandler>();

  // 모든 센서 인스턴스 생성
  const allSensors: SensorHandler[] = [
    createKeyboardSensor(),
    createMouseSensor({ getSensitivity: options.getMouseSensitivity }),
    createLidSensor(),
    createPowerSensor(),
    createUsbSensor(),
  ];

  allSensors.forEach(s => sensors.set(s.name, s));

  return {
    sensors,
    get: (name) => sensors.get(name),
    attachSensors(enabledNames, onTrigger) {
      // 먼저 비활성화된 센서 해제
      sensors.forEach((sensor, name) => {
        if (!enabledNames.includes(name) && sensor.isAttached()) {
          sensor.detach();
          console.log(`[SensorRegistry] 🔕 ${name} detached (disabled)`);
        }
      });

      // 활성화된 센서 부착
      enabledNames.forEach(name => {
        const sensor = sensors.get(name);
        if (sensor && !sensor.isAttached()) {
          sensor.attach(() => onTrigger(sensor.eventType));
        }
      });

      console.log(`[SensorRegistry] Active sensors: [${this.getActiveNames().join(", ")}]`);
    },
    detachAll() {
      sensors.forEach(sensor => {
        if (sensor.isAttached()) sensor.detach();
      });
      console.log("[SensorRegistry] 🛑 All sensors detached");
    },
    getActiveNames() {
      return Array.from(sensors.entries())
        .filter(([_, s]) => s.isAttached())
        .map(([name]) => name);
    },
  };
}
