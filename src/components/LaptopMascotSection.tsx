import meercopIdle from "@/assets/meercop-idle.png";
import meercopMonitoring from "@/assets/meercop-monitoring.png";
import meercopAlert from "@/assets/meercop-alert.png";
import shieldCheck from "@/assets/shield-check.png";
import { useTranslation } from "@/lib/i18n";

interface LaptopMascotSectionProps {
  isMonitoring: boolean;
  isAlarming?: boolean;
}

export function LaptopMascotSection({ isMonitoring, isAlarming = false }: LaptopMascotSectionProps) {
  const { t } = useTranslation();

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
      {!isAlarming && (
        <div className={`relative z-20 ${isMonitoring ? '-mb-8' : 'mb-1'}`}>
        <div className="backdrop-blur-xl bg-white/15 border border-white/25 rounded-2xl px-5 py-2.5 shadow-lg relative">
            <p className="text-white font-extrabold text-[11px] text-center whitespace-nowrap drop-shadow-[0_1px_2px_rgba(0,0,0,0.3)]">
              {isMonitoring ? (
                <>{t("mascot.monitoring")}</>
              ) : (
                <>{t("mascot.idle")}<span className="text-secondary font-black">{t("mascot.idle.on")}</span>{t("mascot.idle.suffix")}</>
              )}
            </p>
            <div className="absolute -bottom-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-[8px] border-r-[8px] border-t-[8px] border-l-transparent border-r-transparent border-t-white/15" />
          </div>
        </div>
      )}
      
      <div className={`relative z-10 ${marginClass}`}>
        <img 
          src={image}
          alt="MeerCOP Mascot"
          className={`${sizeClass} object-contain drop-shadow-xl transition-all duration-500 ${
            isAlarming ? 'animate-bounce' : ''
          }`}
        />
      </div>

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
