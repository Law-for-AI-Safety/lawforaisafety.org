import type { LocaleCode } from "../locales";
import type { PolicyContent } from "../types";
import en from "./en";
import nl from "./nl";

/**
 * Locale code -> policy text. Typed as a full `Record<LocaleCode, …>`, so
 * adding a language to `LOCALES` without adding its content file here is a
 * compile error rather than a runtime 404.
 */
export const POLICY_CONTENT: Record<LocaleCode, PolicyContent> = {
  en,
  nl,
};
