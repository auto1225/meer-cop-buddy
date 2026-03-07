import { usePwaInstall } from "@/hooks/usePwaInstall";
import { useTranslation } from "@/lib/i18n";
import { Download, X } from "lucide-react";
import { useState, useEffect } from "react";
import meercopMascot from "@/assets/meercop-mascot.png";

const DISMISS_KEY = "meercop-pwa-install-dismissed";

export function PwaInstallPopup() {
  const { canInstall, isInstalled, install } = usePwaInstall();
  const { t } = useTranslation();
  const [dismissed, setDismissed] = useState(() => {
    const val = localStorage.getItem(DISMISS_KEY);
    if (!val) return false;
    // Re-show after 24 hours
    const ts = parseInt(val, 10);
    return Date.now() - ts < 24 * 60 * 60 * 1000;
  });

  const [visible, setVisible] = useState(false);

  useEffect(() => {
    if (canInstall && !isInstalled && !dismissed) {
      // Delay popup slightly so it doesn't flash immediately
      const timer = setTimeout(() => setVisible(true), 2000);
      return () => clearTimeout(timer);
    }
    setVisible(false);
  }, [canInstall, isInstalled, dismissed]);

  if (!visible) return null;

  const handleInstall = async () => {
    await install();
    setVisible(false);
  };

  const handleDismiss = () => {
    localStorage.setItem(DISMISS_KEY, String(Date.now()));
    setDismissed(true);
    setVisible(false);
  };

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center" style={{ backdropFilter: "blur(8px)", WebkitBackdropFilter: "blur(8px)" }}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" onClick={handleDismiss} />

      {/* Popup Card */}
      <div className="relative z-10 mx-6 w-full max-w-[320px] bg-white/10 backdrop-blur-2xl border border-white/20 rounded-3xl p-6 shadow-2xl animate-in fade-in zoom-in-95 duration-300">
        {/* Close */}
        <button
          onClick={handleDismiss}
          className="absolute top-3 right-3 w-8 h-8 rounded-full bg-white/10 border border-white/15 flex items-center justify-center text-white/60 hover:bg-white/20 transition-colors"
        >
          <X className="w-4 h-4" />
        </button>

        {/* Mascot */}
        <div className="flex justify-center mb-4">
          <img src={meercopMascot} alt="MeerCOP" className="w-20 h-20 object-contain drop-shadow-lg" />
        </div>

        {/* Text */}
        <div className="text-center mb-5">
          <h3 className="text-white font-extrabold text-lg mb-1.5 drop-shadow">
            {t("pwa.installTitle")}
          </h3>
          <p className="text-white/70 text-sm leading-relaxed">
            {t("pwa.installDesc")}
          </p>
        </div>

        {/* Buttons */}
        <div className="space-y-2.5">
          <button
            onClick={handleInstall}
            className="w-full flex items-center justify-center gap-2 py-3 bg-accent/90 hover:bg-accent text-white font-bold text-sm rounded-2xl transition-all hover:scale-[1.02] shadow-lg"
          >
            <Download className="w-5 h-5" />
            {t("pwa.installButton")}
          </button>
          <button
            onClick={handleDismiss}
            className="w-full py-2.5 text-white/50 hover:text-white/70 text-xs font-semibold transition-colors"
          >
            {t("pwa.later")}
          </button>
        </div>
      </div>
    </div>
  );
}
