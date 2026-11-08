/**
 * Display preferences: light/dark and two text sizes.
 *
 * They are deliberately NOT stored in the browser: the tool promises that nothing is stored, and a static
 * test (T41) forbids localStorage, sessionStorage and IndexedDB under src/ui. The initial theme follows the
 * system setting; the buttons change it for the current visit.
 */

/** Colour scheme of the page. */
export type Theme = "light" | "dark";
/** Text size of the page (two steps). */
export type TextSize = "normal" | "large";

/** Display preferences given to initialState; never read from or written to browser storage. */
export interface Prefs {
  theme?: Theme;
  textSize?: TextSize;
}

/** Light or dark as the system prefers it; light if unknown. */
export function systemTheme(): Theme {
  try {
    return window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light";
  } catch {
    return "light";
  }
}
