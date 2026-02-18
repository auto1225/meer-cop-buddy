/**
 * MeerCOP 애플리케이션 상수
 * 
 * 매직 넘버를 중앙 관리하여 유지보수성을 높입니다.
 * 스마트폰 앱과 동일한 값을 사용해야 하는 상수는 주석으로 표시합니다.
 */

// ── Heartbeat & Status ──
export const HEARTBEAT_INTERVAL_MS = 120_000;       // 🔗 양쪽 동일: 2분
export const HEARTBEAT_STALE_THRESHOLD_MS = 150_000; // 하트비트 미수신 시 오프라인 판정 (2.5분)
export const STATUS_THROTTLE_MS = 5_000;             // DB 업데이트 최소 간격

// ── GPS ──
export const GPS_TIMEOUT_MS = 5_000;
export const GPS_HIGH_ACCURACY = true;
export const GPS_MAX_AGE_MS = 30_000;
export const STEAL_TRACKING_INTERVAL_MS = 30_000;    // 도난 복구 GPS 폴링

// ── Photo Transmission ──
export const PHOTO_CHUNK_SIZE = 2;                   // 🔗 양쪽 동일
export const PHOTO_CHUNK_DELAY_MS = 300;             // 🔗 양쪽 동일
export const MAX_PENDING_PHOTOS = 5;
export const MAX_STORED_ALERTS = 50;                 // IndexedDB 최대 보관 수

// ── Alarm & PIN ──
export const DEFAULT_PIN = "1234";
export const PIN_MAX_ATTEMPTS = 5;
export const PIN_LOCKOUT_MS = 300_000;               // 5분 잠금

// ── Surveillance ──
export const DEFAULT_BUFFER_DURATION = 10;           // 사진 버퍼 유지 시간 (초)
export const DEFAULT_CAPTURE_INTERVAL_MS = 1_000;    // 캡처 간격
export const DEFAULT_MOUSE_SENSITIVITY_PX = 30;      // 마우스 민감도 (px/200ms)
export const DEFAULT_MOTION_THRESHOLD = 15;          // 모션 감지 임계값 (%)
export const DEFAULT_MOTION_CONSECUTIVE = 2;         // 연속 초과 프레임 수
export const DEFAULT_MOTION_COOLDOWN_MS = 1_000;     // 감지 후 쿨다운

// ── Presence & Channel ──
export const PRESENCE_THROTTLE_MS = 1_000;
export const MAX_RECONNECT_ATTEMPTS = 5;
export const BASE_RECONNECT_DELAY_MS = 3_000;

// ── WebRTC ──
export const WEBRTC_DISCONNECT_GRACE_MS = 10_000;    // disconnected 상태 유예 시간
export const WEBRTC_POLL_INTERVAL_MS = 3_000;        // 시그널 폴링 간격
export const WEBRTC_KEYFRAME_DELAY_MS = 1_000;       // 키프레임 강제 생성 딜레이

// ── Network ──
export const IP_FETCH_TIMEOUT_MS = 3_000;
export const NETWORK_RECOVERY_DELAY_MS = 2_000;      // 네트워크 복구 후 딜레이
