# 원격 경보 해제 가이드 (스마트폰 → 컴퓨터)

## 📋 개요

스마트폰 앱에서 컴퓨터(랩탑)의 경보를 원격으로 해제하는 기능입니다.
**Broadcast** 또는 **Presence** 방식 모두 지원합니다.

## 🔧 스마트폰 앱에서 구현해야 할 사항

### 1. 채널 연결

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

### 2. 원격 경보 해제 전송 (✅ 권장: Broadcast 방식)

`channel.send()`를 사용하면 이미 구독 중인 채널에서 중복 subscribe 없이 즉시 전송 가능합니다.

```typescript
// 경보 해제 버튼 클릭 시
await channel.send({
  type: "broadcast",
  event: "remote_alarm_off",
  payload: {
    dismissed_at: new Date().toISOString(),
    dismissed_by: "smartphone",
  },
});
```

### 3. 대체 방식: Presence track (하위 호환)

```typescript
// Presence 방식 (기존 방식, 여전히 동작함)
await channel.track({
  remote_alarm_off: true,
  active_alert: null,
  dismissed_at: new Date().toISOString(),
});
```

### 4. 컴퓨터 앱의 수신 로직 (이미 구현됨)

컴퓨터 앱(`useAlerts.ts`)은 **두 가지 방식 모두** 감지합니다:

| 방식 | 이벤트 | 동작 |
|------|--------|------|
| **Broadcast** | `remote_alarm_off` event | PIN 없이 즉시 경보 해제 + 알림 상태 초기화 |
| **Presence** | `remote_alarm_off === true` in sync | PIN 없이 즉시 경보음 중지 |
| **Presence** | `active_alert === null && dismissed_at` | 전체 경보 해제 |

## ⚡ 핵심 포인트

1. **채널 이름**: `device-alerts-${DEVICE_ID}` (반드시 동일해야 함)
2. **Presence key**: `DEVICE_ID` (config에서 설정)
3. **권장 방식**: `channel.send({ type: "broadcast", event: "remote_alarm_off" })` — 중복 subscribe 문제 없음
4. **`dismissed_at`** 타임스탬프를 함께 전송하여 중복 처리 방지
5. 컴퓨터 앱은 `require_pc_pin` 설정과 무관하게 스마트폰 해제 신호를 수신하면 PIN 없이 해제

## 🔄 전체 흐름

```
스마트폰                              컴퓨터(랩탑)
   |                                      |
   |  channel.send({                     |
   |    type: "broadcast",               |
   |    event: "remote_alarm_off",       |
   |    payload: { dismissed_at: "..." } |
   |  })                                 |
   |  ─────────────────────────────────>  |
   |       (broadcast event)             |
   |                                      | → setActiveAlert(null)
   |                                      | → dismissedBySmartphone = true
   |                                      | → 경보음 중지
   |                                      | → toast("원격 경보 해제")
   |                                      |
```

## ⚠️ 주의사항

- 채널 구독이 `SUBSCRIBED` 상태일 때만 `send()` / `track()` 호출 가능
- 동일한 Supabase 프로젝트(`sltxwkdvaapyeosikegj`)를 사용해야 함
- Broadcast 메시지는 발신자에게는 전달되지 않음 (자기 자신 제외)
