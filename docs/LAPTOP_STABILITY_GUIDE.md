# 노트북 앱 안정화 가이드

MeerCOP 노트북(랩탑) 앱의 장기 실행 안정성을 보장하기 위한 기술 가이드입니다.

---

## 1. 크래시 자동 복구

### ErrorBoundary

전역 `ErrorBoundary`가 React 렌더링 에러를 포착합니다.

```
- HMR 훅 순서 오류 ("Should have a queue") 감지 시 자동 새로고침
- 일반 에러: fallback UI 표시 → 사용자 재시도 가능
```

### 파일: `src/components/ErrorBoundary.tsx`

---

## 2. 화면 꺼짐 / 절전 방지

### Wake Lock API

```typescript
// src/hooks/useWakeLock.ts
useWakeLock(isMonitoring); // 감시 중일 때만 활성화
```

| 상황 | 동작 |
|------|------|
| 감시 시작 | Wake Lock 획득 → 화면 꺼짐 방지 |
| `visibilitychange` | 자동 재획득 |
| 감시 종료 | Wake Lock 해제 |
| 브라우저 미지원 | Graceful fallback (경고 로그) |

### Electron 환경 (선택적)

```javascript
// Electron의 powerSaveBlocker (웹앱에서는 불가)
const { powerSaveBlocker } = require('electron');
const id = powerSaveBlocker.start('prevent-display-sleep');
// 해제: powerSaveBlocker.stop(id);
```

> ⚠️ MeerCOP는 순수 웹 앱이므로 `powerSaveBlocker`는 사용 불가합니다. Wake Lock API로 대체합니다.

---

## 3. 앱 안정화 (포그라운드 복귀)

### `useAppStabilizer` 훅

```typescript
// src/hooks/useAppStabilizer.ts
useAppStabilizer();
```

| 기능 | 설명 |
|------|------|
| 포그라운드 복귀 | 30초 이상 백그라운드 → 모든 쿼리 캐시 invalidate |
| 채널 건강성 체크 | 복귀 시 Realtime 채널 상태 확인 (closed/errored 경고) |
| 캐시 정리 | 10분마다 10분 이상 된 쿼리 캐시 자동 제거 |

---

## 4. 오프라인 큐잉

### PhotoTransmitter

사진 전송 실패 시 IndexedDB에 큐잉 → 네트워크 복구 시 자동 재전송:

```
1. 경보 발생 → 사진 캡처
2. Broadcast 전송 시도
3. 실패 시 → IndexedDB 저장 (localPhotoStorage)
4. 네트워크 복구 시 → 큐에서 꺼내 재전송
```

### Heartbeat 오프라인 감지

```
- sendBeacon API: 브라우저 종료/탭 닫기 시 오프라인 상태 전송
- visibilitychange: 절전모드 진입 시 offline 전환
```

---

## 5. Realtime 재연결

### Presence 채널 (`useDeviceStatus.ts`)

```
- 지수 백오프: 3s → 6s → 12s → 24s → 48s (최대 5회)
- CHANNEL_ERROR/CLOSED 시 자동 재연결
- 성공 시 재시도 카운터 리셋
```

### ChannelManager 싱글톤

```
- channelManager.getOrCreate(name): 중복 구독 방지
- channelManager.remove(name): 명시적 정리
- channelManager.removeAll(): 전체 채널 일괄 해제
```

---

## 6. 메모리 누수 방지

### 원칙

| 패턴 | 적용 |
|------|------|
| `useEffect` cleanup | 모든 이벤트 리스너, 타이머, 채널 구독 해제 |
| `useRef` 안정성 | 설정값을 ref로 관리 → 불필요한 재구독 방지 |
| `channelManager` | 채널 중복 생성 방지 (싱글톤) |
| 쿼리 캐시 정리 | 10분 이상 된 캐시 자동 제거 |

### 주의 사항

```
- setInterval/setTimeout → 반드시 clearInterval/clearTimeout
- addEventListener → 반드시 removeEventListener
- supabase.channel() → 반드시 supabase.removeChannel()
- Web Worker → 반드시 worker.terminate()
```

---

## 7. 서버 사이드 크론 감시

### `monitor-heartbeat` Edge Function

서버에서 2분마다 자동 실행:

```
1. 5분 이상 무응답 노트북 → status='offline' + 알림 삽입
2. 10분 이상 무응답 스마트폰 → status='offline' + 소유 기기 감시 OFF
```

이를 통해 클라이언트 측 `sendBeacon` 실패 시에도 서버가 오프라인 상태를 보장합니다.

---

## 8. 체크리스트

- [x] `ErrorBoundary` 전역 적용
- [x] `useWakeLock` — 감시 중 화면 꺼짐 방지
- [x] `useAppStabilizer` — 포그라운드 복귀 재확인 + 캐시 정리
- [x] `sendBeacon` — 브라우저 종료 시 오프라인 전송
- [x] `visibilitychange` — 절전 모드 감지 및 상태 전환
- [x] Presence 지수 백오프 — 재연결 안정성
- [x] `ChannelManager` — 채널 중복 구독 방지
- [x] `PhotoTransmitter` — 오프라인 큐잉
- [x] Web Worker 타이머 — 백그라운드 스로틀링 우회
- [x] 워치독 메커니즘 — 감시 루프 중단 자동 재시작
- [x] `useRef` 설정 관리 — 플래핑 방지
- [x] 서버 크론 감시 — `monitor-heartbeat` (2분 주기)
