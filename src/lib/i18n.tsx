/**
 * MeerCOP 다국어 번역 시스템
 * - ko/en 정적 매핑
 * - 17개 언어 지원 (AI 동적 번역)
 * - React Context 기반 전역 언어 관리
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

// 17개 지원 언어
export type Lang = "ko" | "en" | "ja" | "zh" | "es" | "fr" | "de" | "pt" | "ru" | "vi" | "th" | "id" | "ms" | "hi" | "tr" | "ar" | "it";

export const SUPPORTED_LANGUAGES: { code: Lang; label: string; nativeLabel: string; rtl?: boolean }[] = [
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "th", label: "Thai", nativeLabel: "ไทย" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
  { code: "ms", label: "Malay", nativeLabel: "Bahasa Melayu" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", rtl: true },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
];

export function getLanguageNativeLabel(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.nativeLabel || code;
}

export function isRtlLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.rtl === true;
}

// Static translations for ko/en
const translations: Record<string, Record<"ko" | "en", string>> = {
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
  "language.changeFromPhone": { ko: "스마트폰 앱에서 변경 가능", en: "Changeable from smartphone app" },
  "language.current": { ko: "현재 언어", en: "Current Language" },

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

  // ── Status Icons ──
  "status.smartphone": { ko: "스마트폰", en: "Smartphone" },
  "status.network": { ko: "네트워크", en: "Network" },
  "status.camera": { ko: "카메라", en: "Camera" },
  "status.settings": { ko: "설정", en: "Settings" },

  // ── Side Menu ──
  "menu.serialNumber": { ko: "시리얼 넘버", en: "Serial Number" },
  "menu.membership": { ko: "멤버십", en: "Membership" },
  "menu.normalMember": { ko: "Normal Member", en: "Normal Member" },
  "menu.help": { ko: "Q&A / 도움말", en: "Q&A / Help" },
  "menu.logout": { ko: "로그아웃", en: "Logout" },
  "menu.guest": { ko: "게스트", en: "Guest" },

  // ── Serial Auth ──
  "auth.checkSerial": { ko: "스마트폰 앱 → 설정에서 시리얼 넘버를 확인하세요", en: "Check serial number in Smartphone App → Settings" },
  "auth.deviceName": { ko: "기기 이름 (예: 안방 노트북)", en: "Device name (e.g. My Laptop)" },
  "auth.rememberMe": { ko: "기억하기", en: "Remember me" },
  "auth.connect": { ko: "연결하기", en: "Connect" },
  "auth.connecting": { ko: "확인 중...", en: "Connecting..." },
  "auth.exit": { ko: "종료", en: "Exit" },
  "auth.exitConfirm": { ko: "종료하시겠습니까?", en: "Do you want to exit?" },
  "auth.exitDesc": { ko: "종료하면 저장된 컴퓨터 이름과 시리얼 넘버가 모두 삭제됩니다.", en: "All saved device name and serial number will be deleted." },
  "auth.cancel": { ko: "취소", en: "Cancel" },
  "auth.exitBtn": { ko: "종료", en: "Exit" },
  "auth.serialError": { ko: "시리얼 넘버를 모두 입력해주세요.", en: "Please enter the full serial number." },
  "auth.nameError": { ko: "기기 이름을 입력해주세요.", en: "Please enter a device name." },
  "auth.authFailed": { ko: "인증에 실패했습니다.", en: "Authentication failed." },

  // ── Help Modal ──
  "help.title": { ko: "사용 설명서", en: "User Manual" },
  "help.subtitle": { ko: "노트북 도난 방지 & 원격 감시 앱", en: "Laptop Anti-theft & Remote Monitoring App" },
  "help.appIntro": { ko: "앱 소개", en: "App Introduction" },
  "help.appIntroContent": { ko: "MeerCOP은 노트북(컴퓨터)의 도난 · 무단 사용을 방지하기 위한 실시간 감시 앱입니다. 스마트폰에서 감시를 켜면, 노트북에 움직임 · 터치 · 덮개 열림 등이 감지될 때 즉시 경보가 울리고 사진 · 위치 · 실시간 스트리밍을 통해 상황을 파악할 수 있습니다.", en: "MeerCOP is a real-time monitoring app to prevent theft and unauthorized use of your laptop. When monitoring is turned on from your smartphone, any movement, touch, or lid opening detected on the laptop triggers an immediate alarm with photos, location, and live streaming." },
  "help.gettingStarted": { ko: "시작하기", en: "Getting Started" },
  "help.mainScreen": { ko: "메인 화면", en: "Main Screen" },
  "help.monitoring": { ko: "감시 시작/중지", en: "Start/Stop Monitoring" },
  "help.liveCamera": { ko: "실시간 카메라", en: "Live Camera" },
  "help.location": { ko: "위치 확인", en: "Location" },
  "help.networkInfo": { ko: "네트워크 정보", en: "Network Info" },
  "help.settings": { ko: "설정", en: "Settings" },
  "help.deviceManagement": { ko: "기기 관리", en: "Device Management" },
  "help.alertsNotifications": { ko: "경보 및 알림", en: "Alerts & Notifications" },
  "help.camouflageMode": { ko: "위장 모드", en: "Camouflage Mode" },
  "help.stealRecovery": { ko: "도난 복구 모드", en: "Theft Recovery Mode" },
  "help.faq": { ko: "자주 묻는 질문 (FAQ)", en: "FAQ" },
  "help.contact": { ko: "문의", en: "Contact" },

  // ── Camera Modal ──
  "camera.title": { ko: "카메라", en: "Camera" },
  "camera.connecting": { ko: "카메라 연결 중...", en: "Connecting camera..." },
  "camera.retry": { ko: "다시 시도", en: "Retry" },
  "camera.notDetected": { ko: "카메라가 인식되지 않습니다", en: "Camera not detected" },
  "camera.reconnectHint": { ko: "카메라를 다시 연결하면 자동으로 재생됩니다", en: "Camera will auto-play when reconnected" },
  "camera.snapshot": { ko: "스냅샷", en: "Snapshot" },
  "camera.save": { ko: "저장하기", en: "Save" },
  "camera.close": { ko: "닫기", en: "Close" },

  // ── Camera Error Messages ──
  "camera.error.timeout": { ko: "카메라 연결 시간이 초과되었습니다.\n\n브라우저 권한 팝업이 표시되지 않았다면 주소창의 카메라 아이콘을 클릭하여 권한을 허용해주세요.", en: "Camera connection timed out.\n\nIf no permission popup appeared, click the camera icon in the address bar to allow access." },
  "camera.error.notAllowed": { ko: "카메라 권한이 거부되었습니다.\n\n브라우저 주소창 옆 자물쇠 아이콘을 클릭하여 카메라 권한을 허용해주세요.", en: "Camera permission denied.\n\nClick the lock icon next to the address bar to allow camera access." },
  "camera.error.notFound": { ko: "카메라를 찾을 수 없습니다.\n\n• 카메라가 연결되어 있는지 확인하세요\n• 다른 앱에서 카메라를 사용 중인지 확인하세요\n• 브라우저를 재시작해보세요", en: "Camera not found.\n\n• Check if the camera is connected\n• Check if another app is using the camera\n• Try restarting the browser" },
  "camera.error.notReadable": { ko: "카메라에 접근할 수 없습니다.\n\n• 다른 앱이나 탭에서 카메라를 종료해주세요\n• 카메라 연결을 확인해주세요", en: "Cannot access camera.\n\n• Close the camera in other apps or tabs\n• Check the camera connection" },
  "camera.error.overconstrained": { ko: "카메라 설정을 적용할 수 없습니다.\n\n다른 카메라를 사용해보세요.", en: "Cannot apply camera settings.\n\nTry using a different camera." },
  "camera.error.abort": { ko: "카메라 연결이 중단되었습니다.\n\n다시 시도해주세요.", en: "Camera connection was interrupted.\n\nPlease try again." },
  "camera.error.security": { ko: "보안 설정으로 인해 카메라를 사용할 수 없습니다.\n\nHTTPS 연결이 필요합니다.", en: "Cannot use camera due to security settings.\n\nHTTPS connection is required." },
  "camera.error.disconnected": { ko: "카메라 연결이 끊어졌습니다.\n\n카메라를 다시 연결하고 재시도해주세요.", en: "Camera disconnected.\n\nPlease reconnect the camera and try again." },
  "camera.error.notSupported": { ko: "이 브라우저는 카메라를 지원하지 않습니다.", en: "This browser does not support camera." },
  "camera.error.default": { ko: "카메라를 시작할 수 없습니다.\n\n다시 시도해주세요.", en: "Cannot start camera.\n\nPlease try again." },

  // ── Notification / Activity Log ──
  "notification.title": { ko: "알림", en: "Notifications" },
  "notification.empty": { ko: "알림이 없습니다.", en: "No notifications." },
  "notification.connected": { ko: "연결됨", en: "Connected" },
  "notification.disconnected": { ko: "연결 해제", en: "Disconnected" },
  "notification.alertShock": { ko: "충격 감지", en: "Shock detected" },
  "notification.alertMouse": { ko: "마우스 움직임", en: "Mouse movement" },
  "notification.alertKeyboard": { ko: "키보드 입력", en: "Keyboard input" },
  "notification.alertMovement": { ko: "이동 감지", en: "Movement detected" },
  "notification.alertStopped": { ko: "경보 해제", en: "Alarm dismissed" },
  "notification.darkModeOn": { ko: "다크 모드 ON", en: "Dark mode ON" },
  "notification.darkModeOff": { ko: "다크 모드 OFF", en: "Dark mode OFF" },
  "notification.lowBattery": { ko: "배터리 부족", en: "Low battery" },

  // ── Alert Screen (Smartphone viewer) ──
  "alertScreen.alertOccurred": { ko: "경보 발생", en: "Alert occurred" },
  "alertScreen.suspiciousActivity": { ko: "노트북에서 의심스러운 활동이 감지되었습니다.", en: "Suspicious activity detected on laptop." },
  "alertScreen.confirmed": { ko: "되었습니다. 확인해주세요.", en: " Please check." },
  "alertScreen.dismiss": { ko: "경보 해제", en: "Dismiss Alert" },
  "alertScreen.capture": { ko: "캡처", en: "Capture" },

  // ── WebRTC Viewer Errors ──
  "viewer.error.connectionFailed": { ko: "연결에 실패했습니다", en: "Connection failed" },
  "viewer.error.disconnected": { ko: "연결이 끊어졌습니다", en: "Disconnected" },
  "viewer.error.cameraNotOn": { ko: "노트북 카메라가 켜져 있지 않습니다", en: "Laptop camera is not on" },

  // ── Misc Errors ──
  "error.loadActivityLogs": { ko: "활동 로그를 불러오는데 실패했습니다.", en: "Failed to load activity logs." },
  "error.loadDevices": { ko: "디바이스 목록을 불러오는데 실패했습니다.", en: "Failed to load device list." },

  // ── Network Info Modal ──
  "network.title": { ko: "네트워크 정보", en: "Network Info" },
  "network.loading": { ko: "네트워크 정보를 가져오는 중...", en: "Fetching network info..." },
  "network.status": { ko: "연결 상태", en: "Connection Status" },
  "network.online": { ko: "온라인", en: "Online" },
  "network.offline": { ko: "오프라인", en: "Offline" },
  "network.ip": { ko: "IP 주소", en: "IP Address" },
  "network.ipUnavailable": { ko: "확인 불가", en: "Unavailable" },
  "network.connectionType": { ko: "연결 유형", en: "Connection Type" },
  "network.unknown": { ko: "알 수 없음", en: "Unknown" },
  "network.speed": { ko: "속도", en: "Speed" },
  "network.latency": { ko: "지연시간 (RTT)", en: "Latency (RTT)" },
  "network.effectiveGrade": { ko: "유효 연결 등급", en: "Effective Connection Grade" },
  "network.footer": { ko: "📡 브라우저 Network Information API 기반", en: "📡 Based on Browser Network Information API" },

  // ── Location Map Modal ──
  "location.title": { ko: "위치", en: "Location" },
  "location.update": { ko: "업데이트", en: "Updated" },
  "location.noSmartphone": { ko: "연결된 스마트폰이 없습니다.", en: "No connected smartphone." },
  "location.requesting": { ko: "스마트폰에 위치 요청 중...", en: "Requesting location from smartphone..." },
  "location.waiting": { ko: "스마트폰이 응답할 때까지 대기합니다", en: "Waiting for smartphone response" },
  "location.lastKnown": { ko: "스마트폰이 응답하지 않아 마지막 저장된 위치를 표시합니다.", en: "Smartphone not responding. Showing last saved location." },
  "location.noResponse": { ko: "스마트폰이 위치 요청에 응답하지 않습니다.\n스마트폰 앱이 실행 중인지 확인해주세요.", en: "Smartphone not responding to location request.\nPlease check if the app is running." },
  "location.error": { ko: "위치 요청 중 오류가 발생했습니다.", en: "Error occurred while requesting location." },
  "location.addressLoading": { ko: "📍 주소 확인 중...", en: "📍 Fetching address..." },
  "location.latitude": { ko: "위도", en: "Latitude" },
  "location.longitude": { ko: "경도", en: "Longitude" },
  "location.wifiWarning": { ko: "📶 Wi-Fi 기반 추정 위치 — 실제 위치와 수백 미터~수 킬로미터 오차가 있을 수 있습니다", en: "📶 Wi-Fi estimated location — may differ by hundreds of meters to kilometers" },
  "location.ipWarning": { ko: "🌐 IP 기반 추정 위치 — 실제 위치와 수 킬로미터 이상 차이가 날 수 있습니다", en: "🌐 IP estimated location — may differ by several kilometers" },
  "location.gpsInfo": { ko: "📡 GPS 기반 실시간 위치 정보", en: "📡 GPS-based real-time location" },
  "location.info": { ko: "📡 위치 정보", en: "📡 Location info" },
  "location.justNow": { ko: "방금 전", en: "Just now" },
  "location.minutesAgo": { ko: "분 전", en: "min ago" },
  "location.hoursAgo": { ko: "시간 전", en: "hr ago" },
  "location.popup": { ko: "위치", en: "Location" },

  // ── Motion Test ──
  "motion.title": { ko: "🔬 모션 감지 테스트", en: "🔬 Motion Detection Test" },
  "motion.cameraFeed": { ko: "카메라 피드", en: "Camera Feed" },
  "motion.diffVisualization": { ko: "🔴 변화 감지 시각화", en: "🔴 Change Detection Visualization" },
  "motion.startTest": { ko: "▶ 테스트 시작", en: "▶ Start Test" },
  "motion.stop": { ko: "⏹ 중지", en: "⏹ Stop" },
  "motion.realtimeStatus": { ko: "실시간 감지 상태", en: "Real-time Detection Status" },
  "motion.changeRate": { ko: "변화율", en: "Change Rate" },
  "motion.consecutiveDetection": { ko: "연속 감지", en: "Consecutive Detection" },
  "motion.maxChangeRate": { ko: "최대 변화율", en: "Max Change Rate" },
  "motion.reset": { ko: "리셋", en: "Reset" },
  "motion.sensitivitySettings": { ko: "감도 설정", en: "Sensitivity Settings" },
  "motion.sensitive": { ko: "민감", en: "Sensitive" },
  "motion.normal": { ko: "보통", en: "Normal" },
  "motion.insensitive": { ko: "둔감", en: "Insensitive" },
  "motion.consecutiveFrames": { ko: "연속 프레임", en: "Consecutive Frames" },
  "motion.cooldown": { ko: "쿨다운", en: "Cooldown" },
  "motion.eventLog": { ko: "이벤트 로그", en: "Event Log" },
  "motion.emptyLog": { ko: "테스트를 시작하면 이벤트가 표시됩니다", en: "Events will appear when test starts" },
  "motion.cameraStarted": { ko: "✅ 카메라 시작됨", en: "✅ Camera started" },
  "motion.cameraStopped": { ko: "⏹ 카메라 중지됨", en: "⏹ Camera stopped" },
  "motion.detected": { ko: "🚨 모션 감지! 변화율", en: "🚨 Motion detected! Change rate" },
  "motion.cameraError": { ko: "카메라를 시작할 수 없습니다.", en: "Cannot start camera." },
  "motion.settingsChanged": { ko: "⚙️ 설정 변경", en: "⚙️ Settings changed" },
  "motion.times": { ko: "회", en: "times" },
  "motion.seconds": { ko: "초", en: "sec" },

  // ── Device Settings Panel ──
  "deviceSettings.title": { ko: "디바이스 설정", en: "Device Settings" },
  "deviceSettings.register": { ko: "디바이스 등록", en: "Register Device" },
  "deviceSettings.deviceName": { ko: "디바이스 이름", en: "Device Name" },
  "deviceSettings.namePlaceholder": { ko: "예: 내 노트북", en: "e.g. My Laptop" },
  "deviceSettings.deviceType": { ko: "디바이스 타입", en: "Device Type" },
  "deviceSettings.laptop": { ko: "랩탑", en: "Laptop" },
  "deviceSettings.desktop": { ko: "데스크탑", en: "Desktop" },
  "deviceSettings.sensorHint": { ko: "💡 감지 센서 설정(카메라, 키보드, 마우스, USB 등)은 스마트폰 앱에서 관리합니다.", en: "💡 Detection sensor settings (camera, keyboard, mouse, USB, etc.) are managed from the smartphone app." },
  "deviceSettings.saving": { ko: "저장 중...", en: "Saving..." },
  "deviceSettings.save": { ko: "저장하기", en: "Save" },
  "deviceSettings.inputError": { ko: "입력 오류", en: "Input Error" },
  "deviceSettings.nameRequired": { ko: "디바이스 이름을 입력해주세요.", en: "Please enter a device name." },
  "deviceSettings.serialRequired": { ko: "시리얼 인증이 필요합니다.", en: "Serial authentication required." },
  "deviceSettings.registered": { ko: "디바이스 등록 완료", en: "Device Registered" },
  "deviceSettings.registeredDesc": { ko: "새 디바이스가 등록되었습니다.", en: "New device has been registered." },
  "deviceSettings.saved": { ko: "저장 완료", en: "Save Complete" },
  "deviceSettings.savedDesc": { ko: "디바이스 설정이 저장되었습니다.", en: "Device settings have been saved." },
  "deviceSettings.saveFailed": { ko: "저장 실패", en: "Save Failed" },
  "deviceSettings.saveFailedDesc": { ko: "설정 저장에 실패했습니다.", en: "Failed to save settings." },

  // ── Alarm Sound Selector ──
  "alarmSelector.title": { ko: "경보음 선택", en: "Select Alarm Sound" },

  // ── Alarm Sound Names ──
  "alarm.policeSiren": { ko: "🚨 경찰 사이렌", en: "🚨 Police Siren" },
  "alarm.securityAlarm": { ko: "🔔 보안 경보", en: "🔔 Security Alarm" },
  "alarm.airRaid": { ko: "⚠️ 공습 사이렌", en: "⚠️ Air Raid Siren" },
  "alarm.intruderAlert": { ko: "🚷 침입자 경보", en: "🚷 Intruder Alert" },
  "alarm.panicAlarm": { ko: "🆘 비상 경보", en: "🆘 Panic Alarm" },
  "alarm.carAlarm": { ko: "🚗 차량 경보", en: "🚗 Car Alarm" },
  "alarm.emergencyHorn": { ko: "📢 긴급 경적", en: "📢 Emergency Horn" },
  "alarm.theftDeterrent": { ko: "🛡️ 도난 방지음", en: "🛡️ Theft Deterrent" },
  "alarm.loudKlaxon": { ko: "📣 대형 클랙슨", en: "📣 Loud Klaxon" },
  "alarm.tripleThreat": { ko: "⚡ 트리플 경보", en: "⚡ Triple Threat" },

  // ── Index page events ──
  "event.cameraMotion": { ko: "카메라 모션 감지 (변화율", en: "Camera motion detected (Change rate" },
  "event.detected": { ko: "이벤트 감지됨", en: "event detected" },
};

// Get all translation keys (for AI translation)
const ALL_KEYS = Object.keys(translations);

// ── AI Translation Cache (localStorage) ──
const CACHE_PREFIX = "meercop-translations-";
const CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function getCachedTranslations(lang: string): Record<string, string> | null {
  try {
    const raw = localStorage.getItem(`${CACHE_PREFIX}${lang}`);
    if (!raw) return null;
    const cached = JSON.parse(raw);
    if (Date.now() - (cached._timestamp || 0) > CACHE_TTL_MS) {
      localStorage.removeItem(`${CACHE_PREFIX}${lang}`);
      return null;
    }
    return cached;
  } catch {
    return null;
  }
}

function setCachedTranslations(lang: string, data: Record<string, string>) {
  try {
    localStorage.setItem(`${CACHE_PREFIX}${lang}`, JSON.stringify({ ...data, _timestamp: Date.now() }));
  } catch {
    // localStorage full, ignore
  }
}

// ── AI Translation via Lovable AI Gateway ──
async function fetchAITranslation(targetLang: Lang): Promise<Record<string, string>> {
  const langInfo = SUPPORTED_LANGUAGES.find(l => l.code === targetLang);
  const langName = langInfo?.label || targetLang;

  // Build source strings from Korean
  const sourceMap: Record<string, string> = {};
  for (const key of ALL_KEYS) {
    sourceMap[key] = translations[key].ko;
  }

  const prompt = `Translate the following JSON object values from Korean to ${langName} (${langInfo?.nativeLabel || targetLang}). 
Keep the JSON keys exactly the same. Only translate the values.
Return ONLY valid JSON, no markdown, no explanation.

${JSON.stringify(sourceMap, null, 2)}`;

  try {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
    
    const response = await fetch(`${supabaseUrl}/functions/v1/ai-translate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${supabaseKey}`,
      },
      body: JSON.stringify({ targetLang, langName: langInfo?.nativeLabel || langName, sourceMap }),
    });

    if (!response.ok) throw new Error(`Translation API failed: ${response.status}`);
    
    const data = await response.json();
    return data.translations || {};
  } catch (e) {
    console.error("[i18n] AI translation failed:", e);
    // Fallback to English
    const fallback: Record<string, string> = {};
    for (const key of ALL_KEYS) {
      fallback[key] = translations[key].en;
    }
    return fallback;
  }
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, fallback?: string) => string;
  isTranslating: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "ko",
  setLang: () => {},
  t: (key) => key,
  isTranslating: false,
});

export function I18nProvider({ children, initialLang }: { children: React.ReactNode; initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang || (localStorage.getItem("meercop-language") as Lang) || "ko");
  const [dynamicTranslations, setDynamicTranslations] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState(false);
  const loadingLangRef = useRef<string | null>(null);

  // Update lang when initialLang changes (from smartphone sync)
  useEffect(() => {
    if (initialLang && initialLang !== lang) {
      console.log("[i18n] Language changed from external:", initialLang);
      setLang(initialLang);
    }
  }, [initialLang]);

  // Load dynamic translations for non-ko/en languages
  useEffect(() => {
    if (lang === "ko" || lang === "en") {
      setDynamicTranslations({});
      return;
    }

    // Check cache first
    const cached = getCachedTranslations(lang);
    if (cached) {
      console.log("[i18n] Using cached translations for:", lang);
      setDynamicTranslations(cached);
      return;
    }

    // Fetch AI translation
    if (loadingLangRef.current === lang) return;
    loadingLangRef.current = lang;
    setIsTranslating(true);
    
    fetchAITranslation(lang).then(result => {
      setDynamicTranslations(result);
      setCachedTranslations(lang, result);
      console.log("[i18n] AI translation loaded for:", lang);
    }).finally(() => {
      setIsTranslating(false);
      loadingLangRef.current = null;
    });
  }, [lang]);

  // RTL support
  useEffect(() => {
    document.documentElement.dir = isRtlLanguage(lang) ? "rtl" : "ltr";
  }, [lang]);

  const t = useCallback((key: string, fallback?: string): string => {
    // For ko/en, use static translations
    if (lang === "ko" || lang === "en") {
      return translations[key]?.[lang] ?? fallback ?? key;
    }
    // For other languages, use dynamic translations
    return dynamicTranslations[key] ?? translations[key]?.en ?? fallback ?? key;
  }, [lang, dynamicTranslations]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t, isTranslating }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
