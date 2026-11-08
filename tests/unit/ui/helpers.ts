import { mountApp } from "../../../src/ui/app";
import { createStore, initialState, Store } from "../../../src/ui/state";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

// jsdom replaces the global URL, so paths are built from the plain file URL string instead.
const here = dirname(fileURLToPath(import.meta.url));

export const fixtureText = (name: string): string => readFileSync(join(here, "..", "..", "fixtures", "v0.3.0", name), "utf-8");

export const exampleText = (): string => readFileSync(join(here, "..", "..", "..", "examples", "catalog_rich_0_4_0.json"), "utf-8");

export interface Harness {
  root: HTMLElement;
  store: Store;
  confirms: string[];
  /** Answer returned by the stubbed window.confirm. */
  setConfirm(answer: boolean): void;
  q<T extends Element = HTMLElement>(sel: string): T;
  qa<T extends Element = HTMLElement>(sel: string): T[];
  unmount(): void;
}

/** Mount the app into a fresh document body with a stubbed confirm. */
/**
 * The tool shows German texts whenever a catalog offers German. Most tests were written when a catalog
 * opened in its own default language, so by default a freshly loaded catalog still starts in that language
 * ("catalogDefault"). Pass "tool" to see what the tool really chooses.
 */
export function mount(uiLang: "de" | "en" = "en", startLanguage: "catalogDefault" | "tool" = "catalogDefault"): Harness {
  document.body.innerHTML = "";
  const root = document.createElement("div");
  root.id = "app";
  document.body.appendChild(root);
  const raw = createStore({ ...initialState(uiLang), uiLang });
  const store: Store = {
    ...raw,
    set(patch) {
      const fresh = patch.loaded && "targetPlatform" in patch && patch.language; // a catalog load, not a project load
      if (fresh && startLanguage === "catalogDefault") patch = { ...patch, language: patch.loaded!.catalog.catalog.defaultLanguage };
      raw.set(patch);
    },
  };
  let answer = true;
  const confirms: string[] = [];
  const unmount = mountApp(root, store, {
    confirm: (m) => {
      confirms.push(m);
      return answer;
    },
    appVersion: "test",
  });
  return {
    root,
    store,
    confirms,
    setConfirm: (a) => {
      answer = a;
    },
    q: (sel) => {
      const el = root.querySelector(sel);
      if (!el) throw new Error(`no element for ${sel}`);
      return el as never;
    },
    qa: (sel) => Array.from(root.querySelectorAll(sel)) as never,
    unmount,
  };
}

export function click(el: Element): void {
  (el as HTMLElement).click();
}

/** Simulate choosing a file in an <input type=file>. */
export function chooseFile(input: HTMLInputElement, name: string, text: string): Promise<void> {
  const file = new File([text], name, { type: "application/json" });
  Object.defineProperty(input, "files", { value: [file], configurable: true });
  input.dispatchEvent(new Event("change", { bubbles: true }));
  // FileReader is asynchronous
  return new Promise((r) => setTimeout(r, 30));
}
