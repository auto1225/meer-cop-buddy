/**
 * MeerCOP 다국어 번역 시스템
 * - 17개 언어 정적 JSON 번들
 * - React Context 기반 전역 언어 관리
 */

import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from "react";

// 17개 지원 언어
export type Lang = "ko" | "en" | "ja" | "zh" | "es" | "fr" | "de" | "pt" | "ru" | "vi" | "th" | "id" | "ms" | "hi" | "tr" | "ar" | "it";

export const SUPPORTED_LANGUAGES: { code: Lang; label: string; nativeLabel: string; rtl?: boolean }[] = [
  { code: "ko", label: "Korean", nativeLabel: "한국어" },
  { code: "en", label: "English", nativeLabel: "English" },
  { code: "ja", label: "Japanese", nativeLabel: "日本語" },
  { code: "zh", label: "Chinese", nativeLabel: "中文" },
  { code: "es", label: "Spanish", nativeLabel: "Español" },
  { code: "fr", label: "French", nativeLabel: "Français" },
  { code: "de", label: "German", nativeLabel: "Deutsch" },
  { code: "pt", label: "Portuguese", nativeLabel: "Português" },
  { code: "ru", label: "Russian", nativeLabel: "Русский" },
  { code: "vi", label: "Vietnamese", nativeLabel: "Tiếng Việt" },
  { code: "th", label: "Thai", nativeLabel: "ไทย" },
  { code: "id", label: "Indonesian", nativeLabel: "Bahasa Indonesia" },
  { code: "ms", label: "Malay", nativeLabel: "Bahasa Melayu" },
  { code: "hi", label: "Hindi", nativeLabel: "हिन्दी" },
  { code: "tr", label: "Turkish", nativeLabel: "Türkçe" },
  { code: "ar", label: "Arabic", nativeLabel: "العربية", rtl: true },
  { code: "it", label: "Italian", nativeLabel: "Italiano" },
];

export function getLanguageNativeLabel(code: string): string {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.nativeLabel || code;
}

export function isRtlLanguage(code: string): boolean {
  return SUPPORTED_LANGUAGES.find(l => l.code === code)?.rtl === true;
}

// Static locale loaders (Vite dynamic import)
const localeLoaders: Record<Lang, () => Promise<{ default: Record<string, string> }>> = {
  ko: () => import("@/locales/ko.json"),
  en: () => import("@/locales/en.json"),
  ja: () => import("@/locales/ja.json"),
  zh: () => import("@/locales/zh.json"),
  es: () => import("@/locales/es.json"),
  fr: () => import("@/locales/fr.json"),
  de: () => import("@/locales/de.json"),
  pt: () => import("@/locales/pt.json"),
  ru: () => import("@/locales/ru.json"),
  vi: () => import("@/locales/vi.json"),
  th: () => import("@/locales/th.json"),
  id: () => import("@/locales/id.json"),
  ms: () => import("@/locales/ms.json"),
  hi: () => import("@/locales/hi.json"),
  tr: () => import("@/locales/tr.json"),
  ar: () => import("@/locales/ar.json"),
  it: () => import("@/locales/it.json"),
};

// Preloaded cache to avoid repeated imports
const loadedLocales: Partial<Record<Lang, Record<string, string>>> = {};

// Normalize locale codes like "zh-CN" → "zh", "pt-BR" → "pt"
export function normalizeLang(code: string): Lang {
  if (!code) return "ko";
  const lower = code.toLowerCase().trim();
  // Check exact match first
  if (localeLoaders[lower as Lang]) return lower as Lang;
  // Try base language (before hyphen)
  const base = lower.split("-")[0].split("_")[0];
  if (localeLoaders[base as Lang]) return base as Lang;
  return "en"; // fallback
}

async function loadLocale(lang: Lang): Promise<Record<string, string>> {
  const normalized = normalizeLang(lang);
  if (loadedLocales[normalized]) return loadedLocales[normalized]!;
  try {
    const module = await localeLoaders[normalized]();
    loadedLocales[normalized] = module.default;
    return module.default;
  } catch (e) {
    console.error("[i18n] Failed to load locale:", normalized, e);
    if (normalized !== "en") return loadLocale("en" as Lang);
    return {};
  }
}

interface I18nContextValue {
  lang: Lang;
  setLang: (lang: Lang) => void;
  t: (key: string, fallback?: string) => string;
  isTranslating: boolean;
}

const I18nContext = createContext<I18nContextValue>({
  lang: "ko",
  setLang: () => {},
  t: (key) => key,
  isTranslating: false,
});

export function I18nProvider({ children, initialLang }: { children: React.ReactNode; initialLang?: Lang }) {
  const [lang, setLang] = useState<Lang>(initialLang || (localStorage.getItem("meercop-language") as Lang) || "ko");
  const [translations, setTranslations] = useState<Record<string, string>>({});
  const [isTranslating, setIsTranslating] = useState(true);
  const loadingLangRef = useRef<string | null>(null);

  // Update lang when initialLang changes (from smartphone sync)
  useEffect(() => {
    if (initialLang) {
      const normalized = normalizeLang(initialLang);
      setLang(prev => {
        if (normalized !== prev) {
          console.log("[i18n] Language changed from external:", initialLang, "→", normalized);
          return normalized;
        }
        return prev;
      });
    }
  }, [initialLang]);

  // Load translations when language changes
  useEffect(() => {
    if (loadingLangRef.current === lang && translations && Object.keys(translations).length > 0) return;
    loadingLangRef.current = lang;
    setIsTranslating(true);

    loadLocale(lang).then(result => {
      setTranslations(result);
      console.log("[i18n] Locale loaded:", lang);
    }).finally(() => {
      setIsTranslating(false);
      loadingLangRef.current = null;
    });
  }, [lang]);

  // RTL support
  useEffect(() => {
    document.documentElement.dir = isRtlLanguage(lang) ? "rtl" : "ltr";
  }, [lang]);

  const t = useCallback((key: string, fallback?: string): string => {
    return translations[key] ?? fallback ?? key;
  }, [translations]);

  return (
    <I18nContext.Provider value={{ lang, setLang, t, isTranslating }}>
      {children}
    </I18nContext.Provider>
  );
}

export function useTranslation() {
  return useContext(I18nContext);
}
