# 🕵️ 위장 모드 (Camouflage Mode) - 스마트폰 연동 가이드

## 개요

위장 모드는 랩탑 화면을 완전히 검은색으로 덮어 **모니터가 꺼진 것처럼** 보이게 하는 기능입니다.
- 감시(카메라, 키보드, 마우스 등)는 **백그라운드에서 계속 작동**합니다.
- 랩탑에서는 해제할 수 없으며, **오직 스마트폰 앱에서만 제어**합니다.
- 전체화면 모드를 요청하여 더 완벽하게 위장합니다.

---

## 스마트폰 앱 구현 사항

### 1. 위장 모드 ON/OFF 제어

`devices` 테이블의 `metadata` JSON 필드에 `camouflage_mode` 키를 설정합니다.

#### 위장 모드 활성화 (ON)
```typescript
await supabase
  .from("devices")
  .update({
    metadata: {
      ...currentMetadata,  // 기존 metadata 유지
      camouflage_mode: true,
    },
  })
  .eq("id", deviceId);
```

#### 위장 모드 비활성화 (OFF)
```typescript
await supabase
  .from("devices")
  .update({
    metadata: {
      ...currentMetadata,
      camouflage_mode: false,
    },
  })
  .eq("id", deviceId);
```

### 2. UI 구현 권장사항

스마트폰 앱의 장치 제어 화면에 **위장 모드 토글 버튼**을 추가합니다:

```tsx
// 예시: React Native
<View style={styles.controlRow}>
  <Text>🕵️ 위장 모드 (화면 끄기)</Text>
  <Switch
    value={isCamouflageMode}
    onValueChange={(value) => toggleCamouflageMode(value)}
  />
</View>
```

#### 토글 함수 예시:
```typescript
const toggleCamouflageMode = async (enabled: boolean) => {
  // 1. 현재 metadata 가져오기
  const { data } = await supabase
    .from("devices")
    .select("metadata")
    .eq("id", deviceId)
    .single();

  const currentMetadata = (data?.metadata as Record<string, unknown>) || {};

  // 2. camouflage_mode만 업데이트
  await supabase
    .from("devices")
    .update({
      metadata: {
        ...currentMetadata,
        camouflage_mode: enabled,
      },
    })
    .eq("id", deviceId);

  setIsCamouflageMode(enabled);
};
```

### 3. 상태 동기화

스마트폰 앱은 `devices` 테이블을 Realtime으로 구독하여 위장 모드 상태를 실시간으로 확인할 수 있습니다:

```typescript
const channel = supabase
  .channel(`device-camouflage-${deviceId}`)
  .on(
    "postgres_changes",
    {
      event: "UPDATE",
      schema: "public",
      table: "devices",
      filter: `id=eq.${deviceId}`,
    },
    (payload) => {
      const meta = payload.new.metadata as { camouflage_mode?: boolean };
      setIsCamouflageMode(meta?.camouflage_mode ?? false);
    }
  )
  .subscribe();
```

---

## 동작 흐름

```
스마트폰                          Supabase DB                       랩탑
   │                                  │                               │
   │── metadata.camouflage_mode=true ─▶│                               │
   │                                  │──── Realtime UPDATE ──────────▶│
   │                                  │                               │── 전체화면 검은 화면 표시
   │                                  │                               │── 키보드/마우스 이벤트 차단
   │                                  │                               │── 감시는 계속 작동
   │                                  │                               │
   │── metadata.camouflage_mode=false ▶│                               │
   │                                  │──── Realtime UPDATE ──────────▶│
   │                                  │                               │── 검은 화면 해제
   │                                  │                               │── 전체화면 종료
```

---

## 주의사항

1. **감시 모드와 독립적**: 위장 모드는 감시 모드(`is_monitoring`)와 별개로 작동합니다. 감시가 꺼져 있어도 위장 모드를 활성화할 수 있습니다.

2. **경보와 위장 모드**: 위장 모드 중 경보(`AlertOverlay`)가 발생하면, 위장 모드(z-index: 9999)가 경보 화면(z-index: 50)을 덮어 경보도 보이지 않습니다. 즉 침입자에게는 아무것도 보이지 않습니다.

3. **브라우저 제한**: ESC 키로 전체화면을 종료할 수 있지만, 검은 화면 오버레이는 여전히 유지됩니다. 브라우저 탭을 닫아야만 완전히 벗어날 수 있습니다.

4. **metadata 병합 필수**: `camouflage_mode`를 업데이트할 때 기존 metadata(`alarm_pin`, `sensorSettings` 등)를 유지하도록 반드시 스프레드(`...currentMetadata`)를 사용하세요.
