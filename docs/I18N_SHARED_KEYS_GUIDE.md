# 🌐 다국어(i18n) 공유 키 가이드

## 📋 개요

랩탑 앱과 스마트폰 앱 간에 동일한 의미로 사용되는 번역 키 구조를 정의합니다.
양쪽 앱에서 사용자에게 일관된 메시지를 표시하기 위한 공유 규약입니다.

---

## 1️⃣ 경보 이벤트 타입 키

| event_type 키 | 한국어 | English |
|---|---|---|
| `alert_camera_motion` | 카메라 모션 감지 | Camera motion detected |
| `alert_keyboard` | 키보드 입력 감지 | Keyboard input detected |
| `alert_mouse` | 마우스 움직임 감지 | Mouse movement detected |
| `alert_lid` | 덮개 열림/닫힘 감지 | Lid open/close detected |
| `alert_power` | 전원 케이블 변화 감지 | Power cable change detected |
| `alert_shock` | 충격/진동 감지 | Shock/vibration detected |
| `alert_movement` | 기기 이동 감지 | Device movement detected |

## 2️⃣ 상태 메시지 키

| 키 | 한국어 | English |
|---|---|---|
| `status.online` | 온라인 | Online |
| `status.offline` | 오프라인 | Offline |
| `status.monitoring` | 감시 중 | Monitoring |
| `status.idle` | 대기 중 | Idle |
| `status.alarming` | 경보 발생 | Alarm active |

## 3️⃣ 명령/동작 키

| 키 | 한국어 | English |
|---|---|---|
| `action.start_monitoring` | 감시 시작 | Start monitoring |
| `action.stop_monitoring` | 감시 중지 | Stop monitoring |
| `action.dismiss_alarm` | 경보 해제 | Dismiss alarm |
| `action.lock_device` | 기기 잠금 | Lock device |
| `action.unlock_device` | 기기 잠금 해제 | Unlock device |
| `action.send_message` | 메시지 전송 | Send message |
| `action.request_location` | 위치 요청 | Request location |
| `action.toggle_camouflage` | 위장 모드 전환 | Toggle camouflage |

## 4️⃣ 알림 메시지 키

| 키 | 한국어 | English |
|---|---|---|
| `notification.alarm_dismissed_remote` | 스마트폰에서 경보가 해제되었습니다 | Alarm dismissed from smartphone |
| `notification.device_locked` | 스마트폰에서 원격 잠금이 활성화되었습니다 | Device locked remotely from smartphone |
| `notification.network_recovered` | 네트워크 연결이 복구되었습니다 | Network connection recovered |
| `notification.steal_recovery` | 도난 복구 모드 활성화 | Steal recovery mode activated |
| `notification.low_battery` | 배터리가 부족합니다 | Battery is low |

## 5️⃣ 센서 설정 키

| 키 | 한국어 | English |
|---|---|---|
| `sensor.camera` | 카메라 | Camera |
| `sensor.keyboard` | 키보드 | Keyboard |
| `sensor.mouse` | 마우스 | Mouse |
| `sensor.lid` | 덮개 | Lid |
| `sensor.power` | 전원 | Power |
| `sensor.microphone` | 마이크 | Microphone |
| `sensor.usb` | USB | USB |

## 6️⃣ 민감도 키

| 키 | 한국어 | English |
|---|---|---|
| `sensitivity.sensitive` | 민감 | Sensitive |
| `sensitivity.normal` | 보통 | Normal |
| `sensitivity.insensitive` | 둔감 | Insensitive |

---

## ⚠️ 사용 규약

1. **event_type은 코드 내부 상수**: DB와 Broadcast payload에 직접 사용되는 값이므로 번역하지 않음
2. **UI 표시 시 매핑**: `event_type` → 해당 로케일 번역 문자열로 변환하여 표시
3. **양쪽 앱 동기화**: 새 이벤트 타입이나 상태 추가 시 이 문서를 먼저 업데이트한 후 양쪽 앱에 반영
4. **기본 로케일**: 한국어 (`ko`), 보조 로케일: 영어 (`en`)
