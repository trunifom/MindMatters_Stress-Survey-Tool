/**
 * Resolution of LocalizedText (spec B01).
 *
 * Nothing is translated automatically. Participant-facing text that is missing in the requested language is NOT
 * silently replaced: callers get `fallback: true` and decide (a preview marks it, an export in that language is
 * blocked). Administrative text may fall back visibly to the default language. Pure functions, no state.
 */

import type { LocalizedText } from "./types";

/** A resolved text with the language it is really in; `fallback` is true if that is not the requested language. */
export interface ResolvedText {
  text: string;
  /** The language the text is actually in. */
  language: string;
  /** True if `language` differs from the requested one. */
  fallback: boolean;
}

/**
 * Text in the requested language, else the default language, else the first available one; `fallback` tells which happened.
 * Use only where a visible fallback is acceptable (previews, administrative text). Returns undefined if there is no text at all.
 */
export function resolveText(
  value: LocalizedText | undefined,
  language: string,
  defaultLanguage: string,
): ResolvedText | undefined {
  if (!value) return undefined;
  const direct = value[language];
  if (direct !== undefined) return { text: direct, language, fallback: false };
  const dflt = value[defaultLanguage];
  if (dflt !== undefined) return { text: dflt, language: defaultLanguage, fallback: true };
  const first = Object.keys(value)[0];
  return first === undefined ? undefined : { text: value[first] as string, language: first, fallback: true };
}

/** Exact lookup without any fallback (participant-facing output). */
export function exactText(value: LocalizedText | undefined, language: string): string | undefined {
  return value?.[language];
}
