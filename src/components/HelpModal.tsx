import { X } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

const helpContent = [
  {
    title: "1. MeerCOP이란?",
    content: `MeerCOP은 노트북/컴퓨터의 도난을 방지하고, 도난 시 기기를 추적·복구할 수 있도록 돕는 보안 감시 앱입니다.

주요 기능:
• 🎥 카메라 모션 감지 — 움직임이 감지되면 자동 촬영 및 경보
• ⌨️ 키보드/마우스 입력 감지 — 무단 사용 시 즉시 알림
• 🔌 전원/USB 변화 감지 — 전원 케이블이나 USB 기기 변경 시 경보
• 📍 실시간 위치 추적 — GPS를 통한 기기 위치 확인
• 📷 원격 카메라 스트리밍 — 스마트폰에서 실시간 카메라 영상 확인
• 🔇 위장 모드 — 화면을 검게 하여 감시 중임을 숨김
• 📱 스마트폰 연동 — 어디서든 기기 상태 확인 및 원격 제어`,
  },
  {
    title: "2. 시작하기",
    content: `시리얼 넘버 등록
• 앱 실행 시 시리얼 넘버 입력 화면이 나타납니다.
• 제공받은 12자리 시리얼 넘버를 4자리씩 입력합니다.
  예: HKXQ - XG7W - 54NY
• 대소문자를 구분하지 않습니다.

기기 이름 설정
• 시리얼 넘버 아래 기기 별칭 입력란에 원하는 이름을 입력합니다.
  예: "내 노트북", "사무실 PC"

기억하기 기능
• "기억하기" 체크박스 선택 시 다음 실행 때 자동 입력됩니다.
• 공용 컴퓨터에서는 해제를 권장합니다.

⚠️ 로그아웃 시 저장된 인증 정보가 완전히 삭제됩니다.`,
  },
  {
    title: "3. 감시 시작/중지",
    content: `감시 시작
• 메인 화면 하단의 감시 토글 버튼을 클릭합니다.
• 마스코트가 감시 중 상태로 변경됩니다.
• 활성화된 센서들이 동작을 시작합니다.

감시 중지
• PIN 입력이 필요할 수 있습니다(설정에 따라 다름).
• 모든 센서 감시가 중지됩니다.`,
  },
  {
    title: "4. 센서 설정",
    content: `메뉴(☰) 또는 설정(⚙️)에서 센서를 개별 ON/OFF할 수 있습니다.

• 카메라 — 카메라 모션 감지 (기본: ON)
• 키보드 — 키 입력 감지 (기본: ON)
• 마우스 — 마우스 움직임 감지 (기본: ON)
• USB — USB 기기 연결/해제 감지 (기본: ON)
• 전원 — 충전 케이블 연결/해제 감지 (기본: ON)
• 덮개(리드) — 노트북 덮개 열림/닫힘 감지 (기본: OFF)
• 마이크 — 소리 감지 (기본: OFF)`,
  },
  {
    title: "5. 경보 설정",
    content: `PIN 설정
• 기본 PIN: 1234
• 경보 해제 시 입력하는 4자리 숫자
• 설정에서 변경 가능

경보음 선택
🚨 경찰 사이렌 / 🔔 보안 경보 / ⚠️ 공습 사이렌
🚷 침입자 경보 / 🆘 비상 경보 / 🚗 차량 경보
📢 긴급 경적 / 🛡️ 도난 방지음 / 📣 대형 클랙슨 / ⚡ 트리플 경보

카메라 민감도
• 민감 — 작은 움직임도 감지 (~3%)
• 보통(기본) — 일반적인 움직임 (~15%)
• 둔감 — 큰 움직임만 감지 (~80%)

마우스 민감도
• 민감 — 5px 이상 / 보통 — 30px 이상 / 둔감 — 100px 이상`,
  },
  {
    title: "6. 위장 모드",
    content: `위장 모드를 활성화하면 화면이 완전히 검게 변합니다.

• 목적: 감시 중임을 제3자에게 숨기기
• 활성화: 설정에서 "위장 모드" 토글 ON
• 해제: PIN 입력 또는 스마트폰에서 원격 해제
• 위장 모드에서도 모든 센서는 정상 동작합니다.`,
  },
  {
    title: "7. 스마트폰 연동",
    content: `실시간 카메라 보기
• 메인 화면에서 카메라 아이콘을 탭합니다.
• WebRTC를 통해 P2P로 영상이 전송됩니다.

원격 경보 해제
• 경보 알림에서 "경보 해제" 버튼 탭
• PIN 없이 즉시 해제됩니다.

원격 설정 변경
• PIN 변경, 경보음 변경, 센서 ON/OFF
• 카메라/마우스 민감도 조절
• 위장 모드 활성화/해제

위치 확인
• 위치 확인 버튼을 탭하면 지도에 위치가 표시됩니다.
⚠️ 컴퓨터가 온라인이고 위치 서비스가 활성화되어야 합니다.`,
  },
  {
    title: "8. 경보 및 알림",
    content: `경보 종류
• 📷 카메라 모션 — 카메라 앞 움직임 감지
• ⌨️ 키보드 — 키 입력 감지
• 🖱️ 마우스 — 마우스 이동 감지
• 💻 덮개 — 노트북 덮개 열림/닫힘
• 🔌 전원 — 전원 케이블 연결/해제
• 💥 충격 — 물리적 충격 감지
• 📍 이동 — 기기 위치 변경

경보 해제 방법
• 컴퓨터: PIN 입력 (설정에 따라)
• 스마트폰: "경보 해제" 버튼 (PIN 불필요)
• 자동: 설정된 시간 경과 시`,
  },
  {
    title: "9. 도난 복구 모드",
    content: `기기 도난 판단 시 자동 동작:
• 📍 GPS를 통한 위치 주기적 업데이트
• 📷 주기적 사진 촬영 및 스마트폰 전송
• 🔊 경보음 계속 재생

스마트폰에서:
• 실시간 기기 위치를 지도에서 확인
• 촬영된 사진으로 도난범 식별 가능`,
  },
  {
    title: "10. 문제 해결 (FAQ)",
    content: `Q: 시리얼 넘버를 잊어버렸어요.
→ 관리자에게 문의하여 재발급받으세요.

Q: 카메라가 감지되지 않아요.
→ 웹캠 연결, 다른 앱 카메라 사용 여부, 브라우저 권한, 드라이버 확인

Q: 경보음이 들리지 않아요.
→ 컴퓨터 볼륨, 브라우저 소리 재생 차단 여부, 경보음 설정 확인

Q: 스마트폰에서 카메라 영상이 안 보여요.
→ 카메라 상태 아이콘, 온라인 상태, 인터넷 연결 확인 후 카메라 보기 재시도

Q: 위치가 정확하지 않아요.
→ 실내 정확도 저하 가능, WiFi 위치 추정 사용, "정확한 위치" 권한 확인

Q: 감시 중 컴퓨터가 느려져요.
→ 카메라 민감도를 "둔감"으로, 불필요한 센서 비활성화, 다른 프로그램 종료

Q: "기기 오프라인"으로 표시돼요.
→ MeerCOP 앱 실행 및 인터넷 연결 확인, 잠시 후 자동 온라인 전환`,
  },
];

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="fixed inset-2 z-[70] flex flex-col bg-[#0a1628]/95 backdrop-blur-xl border border-white/15 rounded-2xl overflow-hidden shadow-2xl">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-white/15 shrink-0">
          <h2 className="text-white font-extrabold text-base">📖 사용설명서</h2>
          <Button
            variant="ghost"
            size="icon"
            onClick={onClose}
            className="text-white/80 hover:bg-white/15 h-8 w-8 rounded-xl"
          >
            <X className="w-4 h-4" />
          </Button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto px-4 py-3 space-y-4">
          {helpContent.map((section, i) => (
            <details key={i} className="group">
              <summary className="flex items-center gap-2 cursor-pointer select-none bg-white/8 hover:bg-white/12 rounded-xl px-3 py-2.5 border border-white/10 transition-colors">
                <span className="text-white/40 text-xs group-open:rotate-90 transition-transform">▶</span>
                <span className="text-white font-bold text-sm">{section.title}</span>
              </summary>
              <div className="mt-1.5 ml-1 pl-3 border-l-2 border-white/10">
                <pre className="text-white/75 text-xs leading-relaxed whitespace-pre-wrap font-sans">
                  {section.content}
                </pre>
              </div>
            </details>
          ))}

          {/* Footer */}
          <div className="text-center py-4 border-t border-white/10">
            <p className="text-white/40 text-[10px]">MeerCOP ver 1.0.6 · © 2026 MeerCOP</p>
          </div>
        </div>
      </div>
    </>
  );
}
