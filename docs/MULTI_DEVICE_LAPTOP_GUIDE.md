# 다중 기기 지원 - 노트북 앱 작업 가이드

## 1. 시리얼 넘버 매핑 정보

| 시리얼 넘버 | 기기 이름 | Device UUID | 상태 |
|---|---|---|---|
| `HKXQ-XG7W-54NY` | minho com | `3d9b2272-...` | 신규 추가 |
| `5G7Z-NH53-SPCN` | minho com2 | `843adc55-...` | 기존 |

### 인증 흐름
1. 노트북 앱 실행 → `SerialAuth` 화면에서 시리얼 넘버 + 기기 별칭 입력
2. `validate-serial` Edge Function 호출 → 시리얼에 매핑된 `device_id` 반환
3. `localStorage(meercop_serial_auth)`에 인증 정보 저장
4. `Index.tsx`에서 `savedAuth.device_id`로 자신의 기기 UUID 식별

> **중요:** 각 노트북 인스턴스는 하나의 시리얼에만 연결됩니다. 다른 PC에서 동일 시리얼을 사용하면 기존 연결이 해제됩니다.

## 2. 채널 구조 (기기별 독립)

각 기기는 고유한 UUID 기반 채널을 사용합니다:

```
device-presence-{deviceId}     → 온라인/오프라인 Presence 동기화
device-alerts-{deviceId}       → 경보 발생/해제 Presence + Broadcast
device-photos-{deviceId}       → 사진 전송 Broadcast 채널
device-commands-{deviceId}     → 위치/네트워크 명령 Broadcast 채널
```

### 스마트폰 측 변경사항
- 스마트폰은 이제 **모든 비-스마트폰 기기**의 경보 채널을 동시 구독
- 어떤 기기에서 경보가 발생하든 스마트폰에서 수신 가능
- 경보 이력에 기기 이름 배지가 표시됨

## 3. 노트북 앱에서 확인/수정할 사항

### 3.1 변경 불필요 (이미 호환)
- ✅ **시리얼 인증 (`serialAuth.ts`)**: `validate-serial` Edge Function이 시리얼-기기 매핑을 처리하므로 코드 변경 불필요
- ✅ **기기 식별 (`Index.tsx`)**: `savedAuth.device_id`로 자신의 UUID를 정확히 식별
- ✅ **채널 구독**: 모든 채널이 `currentDevice.id` 기반으로 동적 생성
- ✅ **Presence 동기화**: `useDeviceStatus`가 기기별 독립 채널 관리
- ✅ **경보 시스템**: `useAlerts`가 자신의 기기 ID로 경보 브로드캐스트
- ✅ **사진 전송**: `PhotoTransmitter`가 자신의 기기 ID로 전송
- ✅ **센서 설정 동기화**: `metadata.sensorSettings`를 실시간 구독

### 3.2 주의사항
- 각 노트북 인스턴스는 **별도의 브라우저/탭**에서 실행
- 시리얼 인증 정보는 `localStorage`에 저장되므로 **같은 브라우저에서 2개의 기기를 동시 운영 불가**
- 다중 기기 운영 시 **별도 브라우저 프로필** 또는 **시크릿 모드** 사용 권장

## 4. 경보 다중 수신 구조

```
[minho com] ──경보──→ device-alerts-3d9b2272 ──→ [스마트폰: 모든 채널 구독]
[minho com2] ──경보──→ device-alerts-843adc55 ──→ [스마트폰: 모든 채널 구독]
```

- 스마트폰은 기기 목록에서 `device_type !== 'smartphone'`인 모든 기기의 경보 채널을 구독
- 경보 해제 시에도 해당 기기의 채널로 `remote_alarm_off` 신호 전송
- 경보 이력의 각 항목에 기기 이름 배지 표시

## 5. 데이터베이스 스키마 (공유)

```sql
-- devices 테이블 주요 컬럼
id              UUID        -- 기기 고유 식별자
device_id       TEXT        -- 시리얼 인증 시 할당된 ID
device_name     TEXT        -- 사용자 지정 기기 이름
device_type     TEXT        -- 'laptop' | 'smartphone'
status          TEXT        -- 'online' | 'offline'
is_monitoring   BOOLEAN     -- 감시 활성화 여부
metadata        JSONB       -- 설정 동기화 (PIN, 센서, 민감도 등)
```

## 6. 테스트 체크리스트

- [ ] 새 시리얼(`HKXQ-XG7W-54NY`)로 다른 브라우저에서 인증 성공
- [ ] 두 기기가 각각 독립적으로 `device-presence` 채널에 online 표시
- [ ] 스마트폰에서 각 기기의 감시 모드를 독립적으로 ON/OFF
- [ ] 한 기기에서 경보 발생 시 스마트폰에 기기 이름과 함께 알림 표시
- [ ] 경보 해제가 정확한 기기에만 적용
- [ ] 각 기기의 센서 설정이 독립적으로 동기화
