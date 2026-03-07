# 스마트폰 앱 — 마스코트(캐릭터) 보기/숨기기 기능 구현 가이드

## 📋 기능 개요
- 메인 화면의 MeerCOP 마스코트(캐릭터)와 말풍선을 숨기거나 다시 표시할 수 있음
- 상태는 `localStorage('meercop-mascot-visible')`에 저장되어 세션 간 유지
- 경보(alarm) 중에는 숨기기 버튼이 표시되지 않음
- 숨김 상태에서도 하단 상태바(MeerCOP ON/OFF)는 항상 표시됨
- 숨김 상태에서는 작은 👁 아이콘 버튼으로 복구 가능

---

## 🏗️ 컴포넌트 구조

### Props 인터페이스
```typescript
interface MascotSectionProps {
  isMonitoring: boolean;    // 현재 감시 중인지
  isAlarming?: boolean;     // 현재 경보 중인지
  mascotVisible: boolean;   // 마스코트 표시 여부 (부모에서 관리)
  onMascotToggle: (visible: boolean) => void;  // 토글 콜백
}
```

### 마스코트 이미지 선택 로직
```typescript
const getMascotConfig = (isAlarming: boolean, isMonitoring: boolean) => {
  if (isAlarming) {
    // 경보 상태: 큰 이미지 + bounce 애니메이션
    return { image: meercopAlert, sizeClass: "h-72", marginClass: "mb-[9%]" };
  }
  if (isMonitoring) {
    // 감시 중: 큰 이미지
    return { image: meercopMonitoring, sizeClass: "h-72", marginClass: "mb-[9%]" };
  }
  // 대기 상태: 작은 이미지
  return { image: meercopIdle, sizeClass: "h-40", marginClass: "mb-[32%]" };
};
```

---

## 🎨 전체 컴포넌트 참조 코드 (노트북 앱 기준)

```tsx
import { useState } from "react";
import { X, Eye } from "lucide-react";
// 이미지는 스마트폰 앱의 assets 경로에 맞게 변경
import meercopIdle from "@/assets/meercop-idle.png";
import meercopMonitoring from "@/assets/meercop-monitoring.png";
import meercopAlert from "@/assets/meercop-alert.png";
import shieldCheck from "@/assets/shield-check.png";

interface MascotSectionProps {
  isMonitoring: boolean;
  isAlarming?: boolean;
  mascotVisible: boolean;
  onMascotToggle: (visible: boolean) => void;
}

export function MascotSection({
  isMonitoring,
  isAlarming = false,
  mascotVisible,
  onMascotToggle,
}: MascotSectionProps) {

  const toggleMascot = () => {
    onMascotToggle(!mascotVisible);
  };

  const getMascotConfig = () => {
    if (isAlarming) {
      return { image: meercopAlert, sizeClass: "h-72", marginClass: "mb-[9%]" };
    }
    if (isMonitoring) {
      return { image: meercopMonitoring, sizeClass: "h-72", marginClass: "mb-[9%]" };
    }
    return { image: meercopIdle, sizeClass: "h-40", marginClass: "mb-[32%]" };
  };

  const { image, sizeClass, marginClass } = getMascotConfig();

  return (
    <div className="relative flex-1 flex flex-col items-center justify-end overflow-hidden">
      {mascotVisible ? (
        <>
          {/* 말풍선 */}
          {!isAlarming && (
            <div className={`relative z-20 ${isMonitoring ? '-mb-8' : 'mb-1'}`}>
              <div className="backdrop-blur-xl bg-white/15 border border-white/25 rounded-2xl px-5 py-2.5 shadow-lg relative">
                <p className="text-white font-extrabold text-[11px] text-center whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
                  {isMonitoring
                    ? "지금 지키고 있어요! 🛡️"
                    : <>감시를 시작하려면 <span className="text-secondary font-black">ON</span>을 눌러요</>
                  }
                </p>
                {/* 말풍선 꼬리 */}
                <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white/15" />
              </div>
            </div>
          )}

          {/* 마스코트 이미지 */}
          <div className={`relative z-10 ${marginClass}`}>
            <img
              src={image}
              alt="MeerCOP Mascot"
              className={`${sizeClass} object-contain drop-shadow-xl transition-all duration-500 ${
                isAlarming ? 'animate-bounce' : ''
              }`}
            />
            {/* 숨기기 버튼 (경보 중에는 숨김) */}
            {!isAlarming && (
              <button
                onClick={toggleMascot}
                className="absolute -top-1 -right-1 w-6 h-6 rounded-full bg-black/40 backdrop-blur-sm border border-white/20 flex items-center justify-center hover:bg-black/60 transition-colors z-30"
                title="캐릭터 숨기기"
              >
                <X className="w-3.5 h-3.5 text-white/80" />
              </button>
            )}
          </div>
        </>
      ) : (
        /* 숨김 상태: 복구용 눈 아이콘 */
        !isAlarming && (
          <div className="relative z-10 mb-[32%]">
            <button
              onClick={toggleMascot}
              className="w-7 h-7 rounded-full bg-white/15 backdrop-blur-sm border border-white/25 flex items-center justify-center hover:bg-white/25 transition-colors"
              title="캐릭터 보기"
            >
              <Eye className="w-3.5 h-3.5 text-white/70" />
            </button>
          </div>
        )
      )}

      {/* 하단 상태바 — 항상 표시 (경보 중 제외) */}
      {!isAlarming && (
        <div className="absolute bottom-0 left-0 right-0 z-30 px-4 pb-2">
          <div className={`rounded-2xl border backdrop-blur-xl py-2.5 px-4 flex items-center justify-center gap-2 transition-all duration-500 ${
            isMonitoring
              ? 'border-secondary/40 bg-secondary/20 shadow-[0_0_24px_hsla(68,100%,64%,0.25)]'
              : 'border-white/15 bg-white/10 shadow-[0_4px_16px_rgba(0,0,0,0.06)]'
          }`}>
            <div className={`w-6 h-6 rounded-full flex items-center justify-center transition-all duration-500 ${
              isMonitoring
                ? 'bg-secondary/30 shadow-[0_0_10px_hsla(68,100%,64%,0.4)]'
                : 'bg-white/15'
            }`}>
              <img
                src={shieldCheck}
                alt="Shield"
                className={`h-4 w-4 object-contain transition-all duration-500 ${isMonitoring ? '' : 'opacity-40 grayscale'}`}
              />
            </div>
            <span className={`font-extrabold text-sm drop-shadow-[0_1px_3px_rgba(0,0,0,0.25)] transition-all duration-500 ${
              isMonitoring ? 'text-secondary' : 'text-white/50'
            }`}>
              MeerCOP {isMonitoring ? 'ON' : 'OFF'}
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
```

---

## 📱 부모 컴포넌트에서의 사용법

```tsx
// 메인 페이지(Index.tsx 등)에서
const [mascotVisible, setMascotVisible] = useState(() => {
  const saved = localStorage.getItem('meercop-mascot-visible');
  return saved !== 'false'; // 기본값: true (보이기)
});

const handleMascotToggle = (visible: boolean) => {
  setMascotVisible(visible);
  localStorage.setItem('meercop-mascot-visible', String(visible));
};

// JSX에서 사용
<MascotSection
  isMonitoring={isMonitoring}
  isAlarming={isAlarming}
  mascotVisible={mascotVisible}
  onMascotToggle={handleMascotToggle}
/>
```

---

## 🖼️ 필요한 이미지 에셋
스마트폰 앱의 `src/assets/` 폴더에 동일한 이미지를 배치해야 합니다:
| 파일명 | 용도 |
|---|---|
| `meercop-idle.png` | 대기 상태 마스코트 (작은 크기) |
| `meercop-monitoring.png` | 감시 중 마스코트 (큰 크기) |
| `meercop-alert.png` | 경보 상태 마스코트 (bounce 애니메이션) |
| `shield-check.png` | 하단 상태바 방패 아이콘 |

---

## 🔑 핵심 동작 요약
1. **보이기 상태**: 말풍선 + 마스코트 이미지 + 우상단 X 버튼(숨기기)
2. **숨김 상태**: 👁 눈 아이콘 버튼만 표시 (클릭 시 복구)
3. **경보 중**: 숨기기/복구 버튼 모두 비활성화, 마스코트는 bounce 애니메이션
4. **상태 저장**: `localStorage('meercop-mascot-visible')` → `'true'` / `'false'`
5. **하단 상태바**: 마스코트 숨김과 무관하게 항상 표시 (경보 중 제외)
