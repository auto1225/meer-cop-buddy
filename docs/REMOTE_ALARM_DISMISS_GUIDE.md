# 원격 경보 해제 가이드 (스마트폰 → 컴퓨터)

## 📋 개요

스마트폰 앱에서 컴퓨터(랩탑)의 경보를 원격으로 해제하는 기능입니다.
Supabase Presence 채널을 통해 실시간으로 해제 신호를 전달합니다.

## 🔧 스마트폰 앱에서 구현해야 할 사항

### 1. Presence 채널 연결

```typescript
const channel = supabase.channel(`device-alerts-${DEVICE_ID}`, {
  config: { presence: { key: DEVICE_ID } },
});

channel.subscribe((status) => {
  if (status === "SUBSCRIBED") {
    console.log("Alert channel connected");
  }
});
```

### 2. 원격 경보 해제 신호 전송

스마트폰에서 **"컴퓨터 경보음 해제"** 버튼을 누를 때:

```typescript
// 경보음만 중지 (remote_alarm_off)
await channel.track({
  remote_alarm_off: true,
  dismissed_at: new Date().toISOString(),
});
```

전체 경보 해제 (active_alert도 함께 클리어):

```typescript
// 전체 경보 해제
await channel.track({
  active_alert: null,
  dismissed_at: new Date().toISOString(),
  remote_alarm_off: true,
});
```

### 3. 컴퓨터 앱의 수신 로직 (이미 구현됨)

컴퓨터 앱(`useAlerts.ts`)은 Presence sync 이벤트에서 다음을 감지합니다:

| 조건 | 동작 |
|------|------|
| `remote_alarm_off === true` | PIN 입력 없이 즉시 경보음 중지 |
| `active_alert === null && dismissed_at` 존재 | 전체 경보 해제 (알림 상태 초기화) |

## ⚡ 핵심 포인트

1. **채널 이름**: `device-alerts-${DEVICE_ID}` (반드시 동일해야 함)
2. **Presence key**: `DEVICE_ID` (config에서 설정)
3. **`remote_alarm_off: true`** 를 track하면 컴퓨터 경보음이 즉시 중단됨
4. **`dismissed_at`** 타임스탬프를 함께 전송하여 중복 처리 방지
5. 컴퓨터 앱은 `require_pc_pin` 설정과 무관하게 스마트폰 해제 신호를 수신하면 PIN 없이 해제

## 🔄 전체 흐름

```
스마트폰                              컴퓨터(랩탑)
   |                                      |
   |  channel.track({                     |
   |    remote_alarm_off: true,           |
   |    dismissed_at: "..."               |
   |  })                                  |
   |  ─────────────────────────────────>  |
   |       (Presence sync event)          |
   |                                      | → dismissedBySmartphone = true
   |                                      | → stopAlarm() (경보음 중지)
   |                                      | → setCurrentEventType(undefined)
   |                                      | → showPinKeypad(false)
   |                                      |
```

## ⚠️ 주의사항

- 채널 구독이 `SUBSCRIBED` 상태일 때만 `track()` 호출 가능
- 동일한 Supabase 프로젝트(`sltxwkdvaapyeosikegj`)를 사용해야 함
- Presence 상태는 연결이 끊기면 자동 소멸되므로, 해제 신호는 연결 상태에서만 유효
