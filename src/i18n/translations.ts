import en from "./en";
import de from "./de";

export type { Language } from "./types";

const translations: Record<string, typeof en> = { en, de };

export function getTranslation(lang: string): typeof en {
  return translations[lang] || en;
}

export function t(lang: string, key: string, params?: Record<string, string | number>): string {
  const dict = getTranslation(lang);
  const value = resolveKey(dict, key);
  if (value === undefined || value === null) {
    return key;
  }
  let result = String(value);
  if (params) {
    for (const [k, v] of Object.entries(params)) {
      result = result.replace(new RegExp(`\\{\\{${k}\\}\\}`, "g"), String(v));
    }
  }
  return result;
}

function resolveKey(obj: Record<string, any>, key: string): unknown {
  const parts = key.split(".");
  let current: any = obj;
  for (const part of parts) {
    if (current === undefined || current === null || typeof current !== "object") {
      return undefined;
    }
    current = current[part];
  }
  return current;
}

export { en, de };
