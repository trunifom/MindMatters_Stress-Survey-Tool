/**
 * Error handling of the page.
 *
 * Three layers, so that something going wrong is never silent and never takes the page down:
 *  1. `guarded` wraps a user action (save, export, import). A failure becomes a visible error notice that says
 *     which action failed and why. The state (selection, texts, order) is left exactly as it was.
 *  2. `installGlobalHandlers` catches what nobody expected (a script error or a rejected promise) and shows it
 *     in the same notice area, with a reminder to save the project.
 *  3. `renderCrashPanel` (used by app.ts) replaces a view that threw while rendering, with the cause and a way out.
 *
 * Errors are also written to the browser console with their stack, which is where a developer looks. The crash
 * panel uses plain DOM only, because it must work when everything else is broken. docs/FEHLERBEHANDLUNG.md
 * describes the user-facing behaviour.
 */

import { t } from "./i18n";
import type { TextKey } from "./i18n";
import type { Store } from "./state";

/** A readable one-line description of anything that was thrown. */
export function describeError(e: unknown): string {
  if (e instanceof Error) return e.message ? `${e.name}: ${e.message}` : e.name;
  if (typeof e === "string") return e;
  try {
    return JSON.stringify(e) ?? String(e);
  } catch {
    return "unknown error";
  }
}

/** Why a file could not be taken over, with the facts the person needs to fix it. */
export class FileProblem extends Error {
  constructor(
    readonly kind: "empty" | "tooLarge" | "notText" | "encoding" | "unreadable",
    readonly fileName: string,
    readonly detail: string = "",
  ) {
    super(`${kind}: ${fileName}${detail ? ` (${detail})` : ""}`);
    this.name = "FileProblem";
  }
}

const KEYS: Record<FileProblem["kind"], TextKey> = {
  empty: "err.file.empty",
  tooLarge: "err.file.tooLarge",
  notText: "err.file.notText",
  encoding: "err.file.encoding",
  unreadable: "err.file.unreadable",
};

/** The message shown for a problem while reading a file. Unknown errors keep their technical cause. */
export function fileProblemText(e: unknown, fileName: string): string {
  if (e instanceof FileProblem) return t(KEYS[e.kind], { file: e.fileName, detail: e.detail });
  return t("err.file.unreadable", { file: fileName, detail: describeError(e) });
}

/** Run a user action. A failure is reported, never thrown, and leaves the state as it was. */
export function guarded<T>(store: Store, what: TextKey, run: () => T): T | undefined {
  try {
    return run();
  } catch (e) {
    console.error(`[MindMatters] ${what} failed`, e);
    store.set({ notice: { kind: "error", text: t("err.action", { what: t(what), detail: describeError(e) }) } });
    return undefined;
  }
}

/** Errors nobody expected: shown in the notice area instead of failing silently. */
export function installGlobalHandlers(store: Store, win: Pick<Window, "addEventListener">): void {
  const report = (detail: string) => {
    store.set({ notice: { kind: "error", text: t("err.unexpected", { detail }) } });
  };
  win.addEventListener("error", (ev) => {
    const e = ev as ErrorEvent;
    // resource loading errors have no message; they are not script errors
    if (!e.message && !e.error) return;
    console.error("[MindMatters] unexpected error", e.error ?? e.message);
    report(e.error ? describeError(e.error) : e.message);
  });
  win.addEventListener("unhandledrejection", (ev) => {
    const e = ev as PromiseRejectionEvent;
    console.error("[MindMatters] unhandled rejection", e.reason);
    report(describeError(e.reason));
  });
}

/** What the page shows when a view could not be drawn. Plain DOM, depends on nothing that could be broken. */
export function renderCrashPanel(error: unknown, onReload: () => void): HTMLElement {
  const box = document.createElement("div");
  box.className = "card crash-panel";
  box.setAttribute("role", "alert");
  const h = document.createElement("h2");
  h.textContent = t("err.crash.title");
  const p = document.createElement("p");
  p.textContent = t("err.crash.text");
  const pre = document.createElement("pre");
  pre.className = "crash-detail";
  pre.textContent = describeError(error);
  const b = document.createElement("button");
  b.type = "button";
  b.className = "btn btn-primary";
  b.textContent = t("err.crash.retry");
  b.addEventListener("click", onReload);
  box.append(h, p, pre, b);
  return box;
}
