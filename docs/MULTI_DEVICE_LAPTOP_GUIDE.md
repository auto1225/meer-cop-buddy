# 다중 기기 지원 - 노트북 앱 작업 가이드 (v2 — 통합 채널)

## 1. 채널 구조 변경 (v2)

### 변경 전 (기기별 N개 채널)
```
device-presence-{deviceId} × N대
device-alerts-{deviceId}   × N대
device-photos-{deviceId}   × N대
→ 기기 100대 = 300개 채널
```

### 변경 후 (사용자당 3개 고정 채널)
```
user-presence-{userId}   → 모든 기기의 온라인/오프라인 Presence (device_id로 구분)
user-alerts-{userId}     → 모든 기기의 경보 발생/해제 (device_id로 구분)
user-photos-{userId}     → 모든 기기의 사진 전송 (device_id로 구분)
→ 기기 100대 = 3개 채널
```

## 2. 핵심 변경사항

### 2.1 `userId` 확보
- `serialAuth.ts`의 `validateSerial()` 응답에서 `user_id` 저장 (이미 구현됨)
- `savedAuth.user_id`를 모든 채널 키로 사용

### 2.2 채널명 변경
| Hook/Class | 변경 전 | 변경 후 |
|---|---|---|
| `useDeviceStatus` | `device-presence-{deviceId}` | `user-presence-{userId}` |
| `useAlerts` | `device-alerts-{deviceId}` | `user-alerts-{userId}` |
| `PhotoTransmitter` | `device-photos-{deviceId}` | `user-photos-{userId}` |
| `useStealRecovery` | `device-alerts-{devId}` | `user-alerts-{userId}` |

### 2.3 모든 Presence/Broadcast payload에 `device_id` 포함
```typescript
// Presence track 시
await channel.track({
  device_id: deviceId,  // ← 반드시 포함
  status: "online",
  is_network_connected: true,
  last_seen_at: new Date().toISOString(),
});
```

### 2.4 `remote_alarm_off` 수신 필터링
```typescript
// 통합 채널이므로 다른 기기의 해제 신호를 무시해야 함
.on("broadcast", { event: "remote_alarm_off" }, (payload) => {
  const targetDeviceId = payload?.payload?.device_id;
  if (targetDeviceId && targetDeviceId !== myDeviceId) {
    return; // 다른 기기 대상 → 무시
  }
  // 자기 기기 대상 → 경보 해제
});
```

## 3. 파일별 변경 요약

| 파일 | 변경 내용 |
|---|---|
| `src/hooks/useDeviceStatus.ts` | `userId` 파라미터 추가, 채널명 변경, payload에 device_id |
| `src/hooks/useAlerts.ts` | `userId` 파라미터 추가, 채널명 변경, remote_alarm_off 필터링, payload에 device_id |
| `src/lib/photoTransmitter.ts` | `userId` 파라미터 추가, 채널명 변경 |
| `src/hooks/useStealRecovery.ts` | `userId` 파라미터 추가, 채널명 변경, payload에 device_id |
| `src/pages/Index.tsx` | `savedAuth.user_id`를 모든 hook에 전달 |

## 4. 시리얼 넘버 매핑

| 시리얼 넘버 | 기기 이름 | Device UUID |
|---|---|---|
| `HKXQ-XG7W-54NY` | minho com | `3d9b2272-...` |
| `5G7Z-NH53-SPCN` | minho com2 | `843adc55-...` |

## 5. 테스트 체크리스트

- [ ] 채널이 `user-presence-{userId}` / `user-alerts-{userId}` / `user-photos-{userId}`로 생성되는지 확인
- [ ] 여러 기기에서 동시 접속 시 하나의 채널을 공유하는지 확인
- [ ] 경보 발생 시 payload에 `device_id`가 포함되는지 확인
- [ ] `remote_alarm_off` 수신 시 다른 기기 대상이면 무시하는지 확인
- [ ] 도난 복구 시 `user-alerts-{userId}` 채널로 재전송되는지 확인
