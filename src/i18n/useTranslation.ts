import { useMemo } from "react";
import { useAppStore } from "../store";
import { t as translate } from "./translations";

export function useTranslation() {
  const language = useAppStore((s) => s.language);

  return useMemo(() => {
    return {
      t: (key: string, params?: Record<string, string | number>) =>
        translate(language, key, params),
      language,
      isGerman: language === "de",
      isEnglish: language === "en",
    };
  }, [language]);
}
