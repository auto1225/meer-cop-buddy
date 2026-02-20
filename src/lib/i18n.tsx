/**
 * MeerCOP 다국어 번역 시스템
 * - ko/en 정적 매핑
 * - React Context 기반 전역 언어 관리
 */

import React, { createContext, useContext, useState, useCallback, useEffect } from "react";

type Lang = "ko" | "en";

const translations: Record<string, Record<Lang, string>> = {
  // ── Header / Common ──
  "alarm.on": { ko: "경보음 켜짐", en: "Alarm On" },
  "alarm.off": { ko: "경보음 꺼짐", en: "Alarm Off" },
  "loading": { ko: "로딩 중...", en: "Loading..." },

  // ── Mascot / Status ──
  "mascot.monitoring": { ko: "미어캅이 당신의 노트북을 감시중입니다.", en: "MeerCOP is monitoring your laptop." },
  "mascot.idle": { ko: "스마트폰에서 감시를 ", en: "Turn monitoring " },
  "mascot.idle.on": { ko: "ON", en: "ON" },
  "mascot.idle.suffix": { ko: "해 주세요.", en: " from your smartphone." },

  // ── Settings Panel ──
  "settings.title": { ko: "설정", en: "Settings" },
  "settings.deviceType": { ko: "기기 타입", en: "Device Type" },
  "settings.laptop": { ko: "노트북", en: "Laptop" },
  "settings.desktop": { ko: "데스크탑", en: "Desktop" },
  "settings.tablet": { ko: "태블릿", en: "Tablet" },
  "settings.alarmSound": { ko: "경보음", en: "Alarm Sound" },
  "settings.volume": { ko: "볼륨", en: "Volume" },
  "settings.uploadSound": { ko: "내 기기에서 경보음 선택...", en: "Select alarm sound from device..." },
  "settings.audioOnly": { ko: "오디오 파일만 업로드할 수 있습니다.", en: "Only audio files can be uploaded." },
  "settings.fileTooLarge": { ko: "파일 크기는 5MB 이하여야 합니다.", en: "File size must be 5MB or less." },

  // ── Sensor Section ──
  "sensor.title": { ko: "감지 센서", en: "Detection Sensors" },
  "sensor.changeFromPhone": { ko: "스마트폰에서 변경", en: "Change from phone" },
  "sensor.cameraMotion": { ko: "카메라 모션", en: "Camera Motion" },
  "sensor.lid": { ko: "덮개 감지", en: "Lid Detection" },
  "sensor.microphone": { ko: "마이크", en: "Microphone" },
  "sensor.keyboard": { ko: "키보드", en: "Keyboard" },
  "sensor.mouse": { ko: "마우스", en: "Mouse" },
  "sensor.usb": { ko: "USB", en: "USB" },
  "sensor.power": { ko: "전원 케이블", en: "Power Cable" },
  "sensor.motionTest": { ko: "모션 테스트", en: "Motion Test" },

  // ── Language Section ──
  "language.title": { ko: "언어 / Language", en: "Language" },
  "language.changeFromPhone": { ko: "스마트폰 앱에서도 변경 가능", en: "Also changeable from smartphone app" },

  // ── Alert Overlay ──
  "alert.title": { ko: "⚠️ 경보 발생! ⚠️", en: "⚠️ ALERT! ⚠️" },
  "alert.dismiss": { ko: "경보 해제", en: "Dismiss Alert" },
  "alert.keyboard": { ko: "키보드 입력이 감지되었습니다!", en: "Keyboard input detected!" },
  "alert.mouse": { ko: "마우스 움직임이 감지되었습니다!", en: "Mouse movement detected!" },
  "alert.usb": { ko: "USB 장치 변경이 감지되었습니다!", en: "USB device change detected!" },
  "alert.lid": { ko: "노트북 덮개 변화가 감지되었습니다!", en: "Laptop lid change detected!" },
  "alert.default": { ko: "움직임이 감지되었습니다!", en: "Movement detected!" },

  // ── PIN Keypad ──
  "pin.title": { ko: "경보 해제", en: "Dismiss Alert" },
  "pin.subtitle": { ko: "4자리 비밀번호를 입력하세요", en: "Enter 4-digit PIN" },
  "pin.wrong": { ko: "비밀번호가 틀렸습니다", en: "Incorrect PIN" },

  // ── Device Name Badge ──
  "device.duplicateName": { ko: "중복된 이름", en: "Duplicate Name" },
  "device.duplicateDesc": { ko: "이름은 이미 다른 기기에서 사용 중입니다.", en: "This name is already used by another device." },
  "device.nameChanged": { ko: "이름 변경 완료", en: "Name Changed" },
  "device.nameChangedDesc": { ko: "기기 이름이 변경되었습니다.", en: "Device name has been changed." },
  "device.changeFailed": { ko: "변경 실패", en: "Change Failed" },
  "device.changeFailedDesc": { ko: "이름 변경에 실패했습니다.", en: "Failed to change device name." },

  // ── Toast / Lock / Message ──
  "lock.title": { ko: "🔒 기기 잠금", en: "🔒 Device Locked" },
  "lock.desc": { ko: "스마트폰에서 원격 잠금이 활성화되었습니다.", en: "Remote lock activated from smartphone." },
  "message.default": { ko: "메시지가 도착했습니다.", en: "Message received." },
  "message.title": { ko: "📩 원격 메시지", en: "📩 Remote Message" },
};

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, fallback?: string) => string;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "ko",
  setLang: () => {},
  t: (key) => key,
});

export function I18nProvider({ children, initialLang }: { children: React.ReactNode; initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang || (localStorage.getItem("meercop-language") as Lang) || "ko");

  useEffect(() => {
    if (initialLang && initialLang !== lang) {
      setLang(initialLang);
    }
  }, [initialLang]);

  const t = useCallback((key: string, fallback?: string): string => {
    return translations[key]?.[lang] ?? fallback ?? key;
  }, [lang]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}

export type { Lang };
