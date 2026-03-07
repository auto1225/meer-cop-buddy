import { useRef, useState, useEffect } from "react";
import { Image, Upload, Trash2, Check } from "lucide-react";
import { useTranslation } from "@/lib/i18n";

export interface BackgroundOption {
  id: string;
  type: "default" | "gradient" | "solid" | "custom";
  label: string;
  value: string; // CSS value or data URL
  preview: string; // CSS for thumbnail preview
}

const STORAGE_KEY = "meercop-custom-bg";
const SELECTION_KEY = "meercop-bg-selection";

const PRESET_BACKGROUNDS: Omit<BackgroundOption, "label">[] = [
  {
    id: "default",
    type: "default",
    value: "__default__",
    preview: "linear-gradient(180deg, hsl(199 85% 60%) 0%, hsl(30 50% 50%) 100%)",
  },
  {
    id: "sunset",
    type: "gradient",
    value: "linear-gradient(180deg, #ff7e5f 0%, #feb47b 50%, #86677B 100%)",
    preview: "linear-gradient(180deg, #ff7e5f 0%, #feb47b 50%, #86677B 100%)",
  },
  {
    id: "night",
    type: "gradient",
    value: "linear-gradient(180deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
    preview: "linear-gradient(180deg, #0f0c29 0%, #302b63 50%, #24243e 100%)",
  },
  {
    id: "forest",
    type: "gradient",
    value: "linear-gradient(180deg, #134e5e 0%, #71b280 100%)",
    preview: "linear-gradient(180deg, #134e5e 0%, #71b280 100%)",
  },
  {
    id: "ocean",
    type: "gradient",
    value: "linear-gradient(180deg, #2193b0 0%, #6dd5ed 100%)",
    preview: "linear-gradient(180deg, #2193b0 0%, #6dd5ed 100%)",
  },
  {
    id: "aurora",
    type: "gradient",
    value: "linear-gradient(180deg, #0B486B 0%, #F56217 100%)",
    preview: "linear-gradient(180deg, #0B486B 0%, #F56217 100%)",
  },
];

export function getSelectedBackground(): { id: string; value: string } {
  const selection = localStorage.getItem(SELECTION_KEY) || "default";
  if (selection.startsWith("custom")) {
    const customBg = localStorage.getItem(STORAGE_KEY);
    if (customBg) return { id: selection, value: customBg };
    return { id: "default", value: "__default__" };
  }
  const preset = PRESET_BACKGROUNDS.find((p) => p.id === selection);
  return { id: selection, value: preset?.value || "__default__" };
}

export function BackgroundSettings({
  onBackgroundChange,
}: {
  onBackgroundChange: (bg: { id: string; value: string }) => void;
}) {
  const { t } = useTranslation();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [selectedId, setSelectedId] = useState(() => localStorage.getItem(SELECTION_KEY) || "default");
  const [customBgUrl, setCustomBgUrl] = useState<string | null>(() => localStorage.getItem(STORAGE_KEY));

  const LABEL_MAP: Record<string, string> = {
    default: t("bg.default"),
    sunset: t("bg.sunset"),
    night: t("bg.night"),
    forest: t("bg.forest"),
    ocean: t("bg.ocean"),
    aurora: t("bg.aurora"),
  };

  const selectPreset = (id: string) => {
    setSelectedId(id);
    localStorage.setItem(SELECTION_KEY, id);
    const preset = PRESET_BACKGROUNDS.find((p) => p.id === id);
    onBackgroundChange({ id, value: preset?.value || "__default__" });
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!file.type.startsWith("image/")) return;
    if (file.size > 5 * 1024 * 1024) {
      alert(t("settings.fileTooLarge"));
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = reader.result as string;
      localStorage.setItem(STORAGE_KEY, dataUrl);
      localStorage.setItem(SELECTION_KEY, "custom");
      setCustomBgUrl(dataUrl);
      setSelectedId("custom");
      onBackgroundChange({ id: "custom", value: dataUrl });
    };
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  const deleteCustom = () => {
    localStorage.removeItem(STORAGE_KEY);
    setCustomBgUrl(null);
    selectPreset("default");
  };

  return (
    <div>
      <div className="flex items-center gap-1.5 mb-2">
        <Image className="w-3 h-3 text-white/80" />
        <p className="text-[10px] font-extrabold text-white/80 drop-shadow-[0_1px_1px_rgba(0,0,0,0.2)]">
          {t("bg.title")}
        </p>
      </div>

      <div className="grid grid-cols-4 gap-1.5">
        {PRESET_BACKGROUNDS.map((bg) => (
          <button
            key={bg.id}
            onClick={() => selectPreset(bg.id)}
            className={`relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all ${
              selectedId === bg.id
                ? "border-secondary shadow-[0_0_8px_hsla(68,100%,64%,0.4)]"
                : "border-white/20 hover:border-white/40"
            }`}
            title={LABEL_MAP[bg.id] || bg.id}
          >
            <div className="absolute inset-0" style={{ background: bg.preview }} />
            {selectedId === bg.id && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Check className="w-3.5 h-3.5 text-secondary" />
              </div>
            )}
            <span className="absolute bottom-0 left-0 right-0 text-[7px] font-bold text-white text-center bg-black/30 py-0.5 truncate">
              {LABEL_MAP[bg.id] || bg.id}
            </span>
          </button>
        ))}

        {/* Custom uploaded */}
        {customBgUrl && (
          <div className="relative aspect-[3/4] rounded-lg overflow-hidden border-2 transition-all group"
            onClick={() => {
              setSelectedId("custom");
              localStorage.setItem(SELECTION_KEY, "custom");
              onBackgroundChange({ id: "custom", value: customBgUrl });
            }}
            style={{
              borderColor: selectedId === "custom" ? "hsl(68 100% 64%)" : "rgba(255,255,255,0.2)",
              boxShadow: selectedId === "custom" ? "0 0 8px hsla(68,100%,64%,0.4)" : "none",
              cursor: "pointer",
            }}
          >
            <img src={customBgUrl} className="absolute inset-0 w-full h-full object-cover" alt="custom" />
            {selectedId === "custom" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <Check className="w-3.5 h-3.5 text-secondary" />
              </div>
            )}
            <button
              onClick={(e) => { e.stopPropagation(); deleteCustom(); }}
              className="absolute top-0.5 right-0.5 w-4 h-4 flex items-center justify-center rounded-full bg-red-500/60 hover:bg-red-500/80 opacity-0 group-hover:opacity-100 transition-opacity"
            >
              <Trash2 className="w-2.5 h-2.5 text-white" />
            </button>
            <span className="absolute bottom-0 left-0 right-0 text-[7px] font-bold text-white text-center bg-black/30 py-0.5">
              {t("bg.custom")}
            </span>
          </div>
        )}

        {/* Upload button */}
        <button
          onClick={() => fileInputRef.current?.click()}
          className="aspect-[3/4] rounded-lg border-2 border-dashed border-white/20 hover:border-white/40 flex flex-col items-center justify-center gap-0.5 transition-all"
        >
          <Upload className="w-3 h-3 text-white/50" />
          <span className="text-[7px] font-bold text-white/50">{t("bg.upload")}</span>
        </button>
      </div>

      <input
        ref={fileInputRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleFileSelect}
      />
    </div>
  );
}
