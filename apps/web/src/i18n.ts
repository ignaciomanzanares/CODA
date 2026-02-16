import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import es from "./locales/es.json";
import en from "./locales/en.json";

export const defaultNS = "common";

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      es: { common: es as Record<string, unknown> },
      en: { common: en as Record<string, unknown> },
    },
    defaultNS: "common",
    fallbackLng: "es",
    lng: "es",
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
