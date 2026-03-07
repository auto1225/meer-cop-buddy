import { useState, useRef } from "react";
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

interface FaqItemProps {
  title: string;
  children: React.ReactNode;
}

function FaqItem({ title, children }: FaqItemProps) {
  const [open, setOpen] = useState(false);
  return (
    <div className="bg-white/8 backdrop-blur-md rounded-xl border border-white/10 overflow-hidden">
      <button
        onClick={() => setOpen(!open)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 text-left"
      >
        <span className="text-white/90 text-[12px] font-bold">{title}</span>
        <ChevronDown className={`w-3.5 h-3.5 text-white/50 shrink-0 transition-transform duration-200 ${open ? "rotate-180" : ""}`} />
      </button>
      {open && (
        <div className="px-3.5 pb-3 border-t border-white/8">
          <div className="pt-2 text-white/75 text-[12px] leading-relaxed whitespace-pre-line">
            {children}
          </div>
        </div>
      )}
    </div>
  );
}

const SECTION_ICONS = [
  "🛡️", "📥", "🖥️", "📷", "⚙️", "🔔", "🚨", "📍", "📶", "🔇", "🔍", "👥", "☰", "🔊", "🔬"
];

export function HelpModal({ isOpen, onClose }: HelpModalProps) {
  const { t } = useTranslation();
  const scrollRef = useRef<HTMLDivElement>(null);
  const sectionRefs = useRef<(HTMLDivElement | null)[]>([]);

  if (!isOpen) return null;

  const sections = [
    {
      titleKey: "help.s1.title",
      items: [
        { titleKey: "help.s1.what", contentKey: "help.s1.whatContent" },
        { titleKey: "help.s1.features", contentKey: "help.s1.featuresContent" },
        { titleKey: "help.s1.howItWorks", contentKey: "help.s1.howItWorksContent" },
      ],
    },
    {
      titleKey: "help.s2.title",
      items: [
        { titleKey: "help.s2.install", contentKey: "help.s2.installContent" },
        { titleKey: "help.s2.serial", contentKey: "help.s2.serialContent" },
        { titleKey: "help.s2.deviceName", contentKey: "help.s2.deviceNameContent" },
        { titleKey: "help.s2.remember", contentKey: "help.s2.rememberContent" },
        { titleKey: "help.s2.permissions", contentKey: "help.s2.permissionsContent" },
      ],
    },
    {
      titleKey: "help.s3.title",
      items: [
        { titleKey: "help.s3.layout", contentKey: "help.s3.layoutContent" },
        { titleKey: "help.s3.header", contentKey: "help.s3.headerContent" },
        { titleKey: "help.s3.mascot", contentKey: "help.s3.mascotContent" },
        { titleKey: "help.s3.statusIcons", contentKey: "help.s3.statusIconsContent" },
        { titleKey: "help.s3.monitoring", contentKey: "help.s3.monitoringContent" },
      ],
    },
    {
      titleKey: "help.s4.title",
      items: [
        { titleKey: "help.s4.liveView", contentKey: "help.s4.liveViewContent" },
        { titleKey: "help.s4.snapshot", contentKey: "help.s4.snapshotContent" },
        { titleKey: "help.s4.autoCapture", contentKey: "help.s4.autoCaptureContent" },
        { titleKey: "help.s4.streaming", contentKey: "help.s4.streamingContent" },
      ],
    },
    {
      titleKey: "help.s5.title",
      items: [
        { titleKey: "help.s5.deviceType", contentKey: "help.s5.deviceTypeContent" },
        { titleKey: "help.s5.alarmSound", contentKey: "help.s5.alarmSoundContent" },
        { titleKey: "help.s5.volume", contentKey: "help.s5.volumeContent" },
        { titleKey: "help.s5.customSound", contentKey: "help.s5.customSoundContent" },
        { titleKey: "help.s5.sensors", contentKey: "help.s5.sensorsContent" },
        { titleKey: "help.s5.sensitivity", contentKey: "help.s5.sensitivityContent" },
        { titleKey: "help.s5.pin", contentKey: "help.s5.pinContent" },
        { titleKey: "help.s5.mascotDisplay", contentKey: "help.s5.mascotDisplayContent" },
        { titleKey: "help.s5.language", contentKey: "help.s5.languageContent" },
      ],
    },
    {
      titleKey: "help.s6.title",
      items: [
        { titleKey: "help.s6.sensorTypes", contentKey: "help.s6.sensorTypesContent" },
        { titleKey: "help.s6.cameraMotion", contentKey: "help.s6.cameraMotionContent" },
        { titleKey: "help.s6.keyboard", contentKey: "help.s6.keyboardContent" },
        { titleKey: "help.s6.mouse", contentKey: "help.s6.mouseContent" },
        { titleKey: "help.s6.usb", contentKey: "help.s6.usbContent" },
        { titleKey: "help.s6.power", contentKey: "help.s6.powerContent" },
        { titleKey: "help.s6.lid", contentKey: "help.s6.lidContent" },
      ],
    },
    {
      titleKey: "help.s7.title",
      items: [
        { titleKey: "help.s7.alertFlow", contentKey: "help.s7.alertFlowContent" },
        { titleKey: "help.s7.dismissPC", contentKey: "help.s7.dismissPCContent" },
        { titleKey: "help.s7.dismissPhone", contentKey: "help.s7.dismissPhoneContent" },
        { titleKey: "help.s7.photos", contentKey: "help.s7.photosContent" },
      ],
    },
    {
      titleKey: "help.s8.title",
      items: [
        { titleKey: "help.s8.howToCheck", contentKey: "help.s8.howToCheckContent" },
        { titleKey: "help.s8.accuracy", contentKey: "help.s8.accuracyContent" },
      ],
    },
    {
      titleKey: "help.s9.title",
      items: [
        { titleKey: "help.s9.info", contentKey: "help.s9.infoContent" },
      ],
    },
    {
      titleKey: "help.s10.title",
      items: [
        { titleKey: "help.s10.what", contentKey: "help.s10.whatContent" },
        { titleKey: "help.s10.howToUse", contentKey: "help.s10.howToUseContent" },
      ],
    },
    {
      titleKey: "help.s11.title",
      items: [
        { titleKey: "help.s11.what", contentKey: "help.s11.whatContent" },
        { titleKey: "help.s11.howItWorks", contentKey: "help.s11.howItWorksContent" },
      ],
    },
    {
      titleKey: "help.s12.title",
      items: [
        { titleKey: "help.s12.addDevice", contentKey: "help.s12.addDeviceContent" },
        { titleKey: "help.s12.switchDevice", contentKey: "help.s12.switchDeviceContent" },
        { titleKey: "help.s12.changeName", contentKey: "help.s12.changeNameContent" },
      ],
    },
    {
      titleKey: "help.s13.title",
      items: [
        { titleKey: "help.s13.profile", contentKey: "help.s13.profileContent" },
        { titleKey: "help.s13.membership", contentKey: "help.s13.membershipContent" },
        { titleKey: "help.s13.helpMenu", contentKey: "help.s13.helpMenuContent" },
        { titleKey: "help.s13.logout", contentKey: "help.s13.logoutContent" },
      ],
    },
    {
      titleKey: "help.s14.title",
      items: [
        { titleKey: "help.s14.headerSound", contentKey: "help.s14.headerSoundContent" },
      ],
    },
    {
      titleKey: "help.s15.title",
      items: [
        { titleKey: "help.s15.what", contentKey: "help.s15.whatContent" },
        { titleKey: "help.s15.howToUse", contentKey: "help.s15.howToUseContent" },
      ],
    },
  ];

  const faqItems = [
    { titleKey: "help.faq.q1", contentKey: "help.faq.a1" },
    { titleKey: "help.faq.q2", contentKey: "help.faq.a2" },
    { titleKey: "help.faq.q3", contentKey: "help.faq.a3" },
    { titleKey: "help.faq.q4", contentKey: "help.faq.a4" },
    { titleKey: "help.faq.q5", contentKey: "help.faq.a5" },
    { titleKey: "help.faq.q6", contentKey: "help.faq.a6" },
    { titleKey: "help.faq.q7", contentKey: "help.faq.a7" },
    { titleKey: "help.faq.q8", contentKey: "help.faq.a8" },
    { titleKey: "help.faq.q9", contentKey: "help.faq.a9" },
    { titleKey: "help.faq.q10", contentKey: "help.faq.a10" },
    { titleKey: "help.faq.q11", contentKey: "help.faq.a11" },
    { titleKey: "help.faq.q12", contentKey: "help.faq.a12" },
    { titleKey: "help.faq.q13", contentKey: "help.faq.a13" },
  ];

  const scrollToSection = (index: number) => {
    const el = sectionRefs.current[index];
    if (el && scrollRef.current) {
      const container = scrollRef.current;
      const top = el.offsetTop - container.offsetTop - 12;
      container.scrollTo({ top, behavior: "smooth" });
    }
  };

  const scrollToFaq = () => {
    const el = sectionRefs.current[sections.length];
    if (el && scrollRef.current) {
      const container = scrollRef.current;
      const top = el.offsetTop - container.offsetTop - 12;
      container.scrollTo({ top, behavior: "smooth" });
    }
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
        <div ref={scrollRef} className="flex-1 overflow-y-auto px-4 pb-8 help-scroll">
          
          {/* Hero */}
          <div className="flex flex-col items-center py-5">
            <img src={meercopMascot} alt="MeerCOP" className="w-18 h-18 object-contain drop-shadow-lg mb-2" />
            <h2 className="text-white font-extrabold text-xl drop-shadow">MeerCOP</h2>
            <p className="text-white/70 text-sm font-semibold mt-1">{t("help.subtitle")}</p>
            <p className="text-white/50 text-xs font-medium mt-0.5">ver 1.0.6</p>
          </div>

          {/* Table of Contents */}
          <div className="bg-white/8 backdrop-blur-md rounded-xl border border-white/10 p-4 mb-5">
            <div className="flex items-center gap-2 mb-3">
              <span className="text-base">📑</span>
              <h3 className="text-[#E8F84A] font-extrabold text-[13px] drop-shadow">{t("help.toc")}</h3>
            </div>
            <div className="space-y-1.5">
              {sections.map((sec, i) => (
                <button
                  key={i}
                  onClick={() => scrollToSection(i)}
                  className="w-full flex items-center gap-2 text-left px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
                >
                  <span className="text-sm">{SECTION_ICONS[i]}</span>
                  <span className="text-white/80 text-[12px] font-semibold">{i + 1}. {t(sec.titleKey)}</span>
                </button>
              ))}
              <button
                onClick={scrollToFaq}
                className="w-full flex items-center gap-2 text-left px-2 py-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <span className="text-sm">❓</span>
                <span className="text-white/80 text-[12px] font-semibold">{t("help.faq")}</span>
              </button>
            </div>
          </div>

          {/* Sections — all open */}
          {sections.map((sec, i) => (
            <div
              key={i}
              ref={el => { sectionRefs.current[i] = el; }}
              className="mb-5"
            >
              <div className="flex items-center gap-2 mb-2">
                <span className="text-base">{SECTION_ICONS[i]}</span>
                <h3 className="text-[#E8F84A] font-extrabold text-[13px] drop-shadow">{i + 1}. {t(sec.titleKey)}</h3>
              </div>
              <div className="space-y-2">
                {sec.items.map((item, j) => (
                  <div key={j} className="bg-white/8 backdrop-blur-md rounded-xl border border-white/10 p-3.5">
                    <h4 className="text-white/90 text-[12px] font-bold mb-1.5">{t(item.titleKey)}</h4>
                    <div className="text-white/75 text-[12px] leading-relaxed whitespace-pre-line">
                      {renderBold(t(item.contentKey))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ))}

          {/* FAQ Section — accordion style */}
          <div
            ref={el => { sectionRefs.current[sections.length] = el; }}
            className="mb-4"
          >
            <div className="flex items-center gap-2 mb-2">
              <span className="text-base">❓</span>
              <h3 className="text-[#E8F84A] font-extrabold text-[13px] drop-shadow">{t("help.faq")}</h3>
            </div>
            <div className="space-y-1.5">
              {faqItems.map((faq, i) => (
                <FaqItem key={i} title={t(faq.titleKey)}>
                  {renderBold(t(faq.contentKey))}
                </FaqItem>
              ))}
            </div>
          </div>

          {/* Footer */}
          <div className="text-center py-6 space-y-1">
            <p className="text-white/40 text-xs">© 2026 MeerCOP. All rights reserved.</p>
            <p className="text-white/30 text-[10px]">{t("help.contact")}: meercop.official@gmail.com</p>
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
