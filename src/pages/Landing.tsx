import { useState } from "react";
import { Shield, Monitor, Smartphone, Camera, Bell, MapPin, Download, ChevronDown, Zap, Lock, Wifi } from "lucide-react";
import { Button } from "@/components/ui/button";
import meercopLogo from "@/assets/meercop-logo.png";
import meercopMascot from "@/assets/meercop-mascot.png";
import meercopMonitoring from "@/assets/meercop-monitoring.png";
import meercopAlert from "@/assets/meercop-alert.png";
import { usePwaInstall } from "@/hooks/usePwaInstall";

const FEATURES = [
  {
    icon: Monitor,
    title: "실시간 모니터링",
    desc: "노트북의 키보드, 마우스, USB 등 다양한 센서를 감지하여 무단 사용을 즉시 탐지합니다.",
  },
  {
    icon: Bell,
    title: "강력한 경보 시스템",
    desc: "10가지 이상의 경보 사운드와 PIN 잠금으로 도난 시도를 효과적으로 억제합니다.",
  },
  {
    icon: Camera,
    title: "카메라 자동 촬영",
    desc: "침입 감지 시 자동으로 카메라가 작동하여 침입자의 사진을 촬영합니다.",
  },
  {
    icon: Smartphone,
    title: "스마트폰 원격 제어",
    desc: "스마트폰에서 실시간으로 노트북 상태를 확인하고 경보를 제어할 수 있습니다.",
  },
  {
    icon: MapPin,
    title: "위치 추적",
    desc: "도난 시 노트북의 실시간 위치를 지도에서 확인하여 빠르게 회수할 수 있습니다.",
  },
  {
    icon: Lock,
    title: "위장 모드",
    desc: "화면을 일반적인 데스크탑처럼 보이게 하여 보안 앱의 존재를 숨길 수 있습니다.",
  },
];

const INSTALL_STEPS = [
  {
    step: 1,
    title: "브라우저에서 접속",
    desc: "Chrome 또는 Edge 브라우저에서 MeerCOP 웹사이트에 접속합니다.",
  },
  {
    step: 2,
    title: "앱 설치 클릭",
    desc: "아래의 '앱 설치' 버튼을 클릭하거나 브라우저 주소창의 설치 아이콘을 눌러주세요.",
  },
  {
    step: 3,
    title: "시리얼 키 입력",
    desc: "발급받은 시리얼 키를 입력하면 바로 보안 모니터링을 시작할 수 있습니다.",
  },
];

export default function Landing() {
  const { canInstall, isInstalled, install } = usePwaInstall();
  const [expandedFaq, setExpandedFaq] = useState<number | null>(null);

  const handleInstall = async () => {
    if (canInstall) {
      await install();
    } else {
      // Redirect to main app
      window.location.href = "/";
    }
  };

  const scrollToSection = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth" });
  };

  return (
    <div className="min-h-screen bg-gradient-to-b from-[hsl(199,92%,56%)] via-[hsl(199,85%,50%)] to-[hsl(222,47%,25%)] text-white font-sans overflow-x-hidden">
      
      {/* Navigation */}
      <nav className="sticky top-0 z-50 bg-white/10 backdrop-blur-xl border-b border-white/15">
        <div className="max-w-6xl mx-auto px-4 h-14 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <img src={meercopLogo} alt="MeerCOP" className="w-8 h-8 object-contain" />
            <span className="font-extrabold text-lg tracking-tight">MeerCOP</span>
          </div>
          <div className="hidden sm:flex items-center gap-6 text-sm font-bold text-white/80">
            <button onClick={() => scrollToSection("features")} className="hover:text-white transition-colors">기능</button>
            <button onClick={() => scrollToSection("install")} className="hover:text-white transition-colors">설치</button>
            <button onClick={() => scrollToSection("screenshots")} className="hover:text-white transition-colors">스크린샷</button>
          </div>
          <Button
            onClick={handleInstall}
            size="sm"
            className="bg-accent text-accent-foreground font-extrabold rounded-full px-5 hover:brightness-110 shadow-lg"
          >
            {isInstalled ? "앱 열기" : "설치하기"}
          </Button>
        </div>
      </nav>

      {/* Hero Section */}
      <section className="relative py-16 sm:py-24 px-4">
        {/* Floating clouds decoration */}
        <div className="absolute top-10 left-[10%] w-32 h-10 bg-white/20 rounded-full blur-xl" />
        <div className="absolute top-20 right-[15%] w-40 h-12 bg-white/15 rounded-full blur-xl" />
        <div className="absolute bottom-10 left-[5%] w-24 h-8 bg-white/10 rounded-full blur-lg" />

        <div className="max-w-4xl mx-auto text-center relative z-10">
          <div className="float-animation mb-6">
            <img src={meercopMascot} alt="MeerCOP Mascot" className="w-32 h-32 sm:w-40 sm:h-40 mx-auto drop-shadow-2xl" />
          </div>
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-black leading-tight mb-4 drop-shadow-lg">
            당신의 노트북을<br />
            <span className="text-accent">미어캅</span>이 지킵니다
          </h1>
          <p className="text-lg sm:text-xl text-white/80 max-w-2xl mx-auto mb-8 font-semibold leading-relaxed">
            카페, 도서관, 사무실 — 잠깐 자리를 비울 때<br />
            MeerCOP이 노트북을 24시간 감시합니다
          </p>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3">
            <Button
              onClick={handleInstall}
              size="lg"
              className="bg-accent text-accent-foreground font-black text-lg rounded-full px-8 py-6 hover:brightness-110 shadow-xl shadow-accent/30 gap-2"
            >
              <Download className="w-5 h-5" />
              {isInstalled ? "앱 열기" : canInstall ? "지금 설치하기" : "시작하기"}
            </Button>
            <Button
              onClick={() => scrollToSection("features")}
              variant="outline"
              size="lg"
              className="border-white/30 text-white bg-white/10 hover:bg-white/20 font-bold rounded-full px-8 py-6 gap-2"
            >
              자세히 알아보기
              <ChevronDown className="w-4 h-4" />
            </Button>
          </div>

          {/* Trust badges */}
          <div className="mt-10 flex items-center justify-center gap-6 text-white/50 text-xs font-bold">
            <div className="flex items-center gap-1.5">
              <Shield className="w-4 h-4" />
              <span>100% 무료</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Zap className="w-4 h-4" />
              <span>설치 10초</span>
            </div>
            <div className="flex items-center gap-1.5">
              <Wifi className="w-4 h-4" />
              <span>오프라인 지원</span>
            </div>
          </div>
        </div>
      </section>

      {/* Features Section */}
      <section id="features" className="py-16 sm:py-20 px-4">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-center mb-3 drop-shadow">주요 기능</h2>
          <p className="text-center text-white/60 font-semibold mb-12">강력한 보안 기능으로 노트북을 완벽하게 보호합니다</p>
          
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-5">
            {FEATURES.map((f, i) => (
              <div
                key={i}
                className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 p-6 hover:bg-white/15 transition-all duration-300 hover:-translate-y-1 group"
              >
                <div className="w-12 h-12 bg-accent/20 rounded-xl flex items-center justify-center mb-4 group-hover:bg-accent/30 transition-colors">
                  <f.icon className="w-6 h-6 text-accent" />
                </div>
                <h3 className="font-extrabold text-lg mb-2">{f.title}</h3>
                <p className="text-sm text-white/65 leading-relaxed font-medium">{f.desc}</p>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Screenshots Section */}
      <section id="screenshots" className="py-16 sm:py-20 px-4 bg-black/10">
        <div className="max-w-5xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-center mb-3 drop-shadow">앱 스크린샷</h2>
          <p className="text-center text-white/60 font-semibold mb-12">직관적이고 깔끔한 UI로 쉽게 사용할 수 있습니다</p>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6 max-w-3xl mx-auto">
            <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 p-4 hover:bg-white/15 transition-all">
              <img src={meercopMonitoring} alt="Monitoring Mode" className="w-full rounded-xl shadow-lg" />
              <p className="text-center text-sm font-bold mt-3 text-white/80">모니터링 모드</p>
            </div>
            <div className="bg-white/10 backdrop-blur-md rounded-2xl border border-white/15 p-4 hover:bg-white/15 transition-all">
              <img src={meercopAlert} alt="Alert Mode" className="w-full rounded-xl shadow-lg" />
              <p className="text-center text-sm font-bold mt-3 text-white/80">경보 발생 시</p>
            </div>
          </div>
        </div>
      </section>

      {/* Install Guide Section */}
      <section id="install" className="py-16 sm:py-20 px-4">
        <div className="max-w-4xl mx-auto">
          <h2 className="text-3xl sm:text-4xl font-black text-center mb-3 drop-shadow">설치 가이드</h2>
          <p className="text-center text-white/60 font-semibold mb-12">3단계로 간단하게 시작하세요</p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6">
            {INSTALL_STEPS.map((s) => (
              <div key={s.step} className="text-center">
                <div className="w-14 h-14 bg-accent text-accent-foreground rounded-full flex items-center justify-center text-2xl font-black mx-auto mb-4 shadow-lg shadow-accent/30">
                  {s.step}
                </div>
                <h3 className="font-extrabold text-lg mb-2">{s.title}</h3>
                <p className="text-sm text-white/65 leading-relaxed font-medium">{s.desc}</p>
              </div>
            ))}
          </div>

          {/* CTA */}
          <div className="mt-12 text-center">
            <Button
              onClick={handleInstall}
              size="lg"
              className="bg-accent text-accent-foreground font-black text-lg rounded-full px-10 py-6 hover:brightness-110 shadow-xl shadow-accent/30 gap-2"
            >
              <Download className="w-5 h-5" />
              {isInstalled ? "앱 열기" : canInstall ? "지금 설치하기" : "시작하기"}
            </Button>
            {isInstalled && (
              <p className="mt-3 text-accent font-bold text-sm">✓ 이미 설치되었습니다</p>
            )}
            {!canInstall && !isInstalled && (
              <p className="mt-3 text-white/50 text-xs font-medium">
                * Chrome 또는 Edge 브라우저에서 접속하면 바로 설치할 수 있습니다
              </p>
            )}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t border-white/10 bg-black/20">
        <div className="max-w-4xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <img src={meercopLogo} alt="MeerCOP" className="w-6 h-6 object-contain opacity-60" />
            <span className="text-sm font-bold text-white/40">MeerCOP — Laptop Security Guard</span>
          </div>
          <p className="text-xs text-white/30 font-medium">© 2025 MeerCOP. All rights reserved.</p>
        </div>
      </footer>
    </div>
  );
}
