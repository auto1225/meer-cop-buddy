import { ArrowLeft, ChevronDown } from "lucide-react";
import meercopMascot from "@/assets/meercop-mascot.png";
import { useTranslation } from "@/lib/i18n";

interface HelpModalProps {
  isOpen: boolean;
  onClose: () => void;
}

function renderBold(text: string) {
  const parts = text.split(/(\*\*[^*]+\*\*)/g);
  return parts.map((part, i) => {
    if (part.startsWith("**") && part.endsWith("**")) {
      return <strong key={i} className="text-white font-extrabold">{part.slice(2, -2)}</strong>;
    }
    return part;
  });
}

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const { t } = useTranslation();

  if (!isOpen) return null;

  const sections = [
    { icon: "🛡️", titleKey: "help.appIntro", contentKey: "help.appIntroContent" },
    { icon: "📥", titleKey: "help.gettingStarted", contentKey: "help.gettingStarted" },
    { icon: "🖥️", titleKey: "help.mainScreen", contentKey: "help.mainScreen" },
    { icon: "👁️", titleKey: "help.monitoring", contentKey: "help.monitoring" },
    { icon: "📷", titleKey: "help.liveCamera", contentKey: "help.liveCamera" },
    { icon: "📍", titleKey: "help.location", contentKey: "help.location" },
    { icon: "📶", titleKey: "help.networkInfo", contentKey: "help.networkInfo" },
    { icon: "⚙️", titleKey: "help.settings", contentKey: "help.settings" },
    { icon: "👥", titleKey: "help.deviceManagement", contentKey: "help.deviceManagement" },
    { icon: "🚨", titleKey: "help.alertsNotifications", contentKey: "help.alertsNotifications" },
    { icon: "🔇", titleKey: "help.camouflageMode", contentKey: "help.camouflageMode" },
    { icon: "🔍", titleKey: "help.stealRecovery", contentKey: "help.stealRecovery" },
  ];

  // For the intro section, use the translated content; for others use the title as placeholder
  const getContent = (sec: typeof sections[0]) => {
    if (sec.contentKey === "help.appIntroContent") return t(sec.contentKey);
    // Other sections - use translated title as content header
    return t(sec.contentKey);
  };

  return (
    <>
      <div className="fixed inset-0 z-[60] bg-black/40" onClick={onClose} />

      <div className="fixed inset-0 z-[70] flex flex-col"
        style={{ background: "linear-gradient(180deg, hsla(199, 85%, 55%, 1) 0%, hsla(199, 80%, 48%, 1) 100%)" }}>
        
        {/* Header */}
        <div className="flex items-center gap-3 px-4 py-3.5 shrink-0">
          <button onClick={onClose} className="text-white/90 hover:text-white p-1">
            <ArrowLeft className="w-5 h-5" />
          </button>
          <h1 className="text-white font-extrabold text-lg drop-shadow">{t("help.title")}</h1>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-4 pb-8 help-scroll">
          
          {/* Hero */}
          <div className="flex flex-col items-center py-6">
            <img src={meercopMascot} alt="MeerCOP" className="w-20 h-20 object-contain drop-shadow-lg mb-3" />
            <h2 className="text-white font-extrabold text-xl drop-shadow">MeerCOP</h2>
            <p className="text-white/70 text-sm font-semibold mt-1">{t("help.subtitle")}</p>
            <p className="text-white/50 text-xs font-medium mt-0.5">ver 1.0.6</p>
          </div>

          {/* Sections */}
          {sections.map((sec, i) => (
            <div key={i} className="mb-5">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{sec.icon}</span>
                <h3 className="text-[#E8F84A] font-extrabold text-sm drop-shadow">{t(sec.titleKey)}</h3>
              </div>
              <div className="bg-white/12 backdrop-blur-md rounded-2xl border border-white/15 px-4 py-3.5">
                <p className="text-white/80 text-[13px] leading-relaxed whitespace-pre-line">
                  {renderBold(getContent(sec))}
                </p>
              </div>
            </div>
          ))}

          {/* FAQ Section */}
          <div className="mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">❓</span>
              <h3 className="text-[#E8F84A] font-extrabold text-sm drop-shadow">{t("help.faq")}</h3>
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-6 space-y-1">
            <p className="text-white/40 text-xs">© 2026 MeerCOP. All rights reserved.</p>
            <p className="text-white/30 text-[10px]">{t("help.contact")}: support@meercop.com</p>
          </div>
        </div>
      </div>

      <style>{`
        .help-scroll::-webkit-scrollbar {
          width: 3px;
        }
        .help-scroll::-webkit-scrollbar-track {
          background: transparent;
        }
        .help-scroll::-webkit-scrollbar-thumb {
          background: rgba(255,255,255,0.25);
          border-radius: 10px;
        }
      `}</style>
    </>
  );
}
