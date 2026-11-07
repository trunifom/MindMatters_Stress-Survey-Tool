import { resolveText } from "../core/localized";
import { APP_VERSION } from "../version";
import { banner } from "./components";
import { clear, h, readFileText } from "./dom";
import { setUiLang, t, UiLang } from "./i18n";
import {
  AppState,
  cancelMigration,
  confirmMigration,
  loadCatalogText,
  loadProjectText,
  setLanguage,
  setUiLanguage,
  setView,
  Store,
  dismissNotice,
} from "./state";
import { renderStart } from "./views/start";
import { VIEWS } from "./views/registry";

export interface AppEnv {
  /** Confirmation before unsaved changes are discarded (T42). */
  confirm(message: string): boolean;
  appVersion?: string;
}

/** Mount the application into `root`. Re-renders on every state change and keeps focus and caret. */
export function mountApp(root: HTMLElement, store: Store, env: AppEnv): () => void {
  const render = () => {
    const state = store.get();
    setUiLang(state.uiLang);
    document.documentElement.lang = state.uiLang;
    const focus = captureFocus();
    clear(root);
    root.appendChild(buildApp(state, store, env));
    restoreFocus(focus);
  };
  const unsubscribe = store.subscribe(render);
  render();
  return unsubscribe;
}

interface FocusInfo {
  id: string;
  start: number | null;
  end: number | null;
}

function captureFocus(): FocusInfo | undefined {
  const el = document.activeElement as HTMLElement | null;
  const id = el?.getAttribute?.("data-focus");
  if (!el || !id) return undefined;
  const input = el as HTMLInputElement;
  return { id, start: input.selectionStart ?? null, end: input.selectionEnd ?? null };
}

function restoreFocus(f: FocusInfo | undefined): void {
  if (!f) return;
  const el = Array.from(document.querySelectorAll<HTMLElement>("[data-focus]")).find((e) => e.getAttribute("data-focus") === f.id);
  if (!el) return;
  el.focus({ preventScroll: true });
  const input = el as HTMLInputElement;
  if (f.start !== null && typeof input.setSelectionRange === "function") {
    try {
      input.setSelectionRange(f.start, f.end ?? f.start);
    } catch {
      /* not every input type supports a selection */
    }
  }
}

function buildApp(s: AppState, store: Store, env: AppEnv): HTMLElement {
  const handlers = {
    onFile: (file: File) => void importCatalog(file, store, env),
    onConfirmMigration: () => confirmMigration(store),
    onCancelMigration: () => cancelMigration(store),
  };

  const header = h(
    "header",
    { class: "app-header" },
    h("h1", null, t("app.title")),
    uiLanguageSwitch(s, store),
  );

  const content = s.loaded ? loadedContent(s, store, env) : renderStart(s, handlers, env.appVersion ?? APP_VERSION);

  return h(
    "div",
    { class: "app" },
    h("a", { class: "skip-link", href: "#content" }, t("skip")),
    header,
    h("div", { id: "notices", role: "status", "aria-live": "polite", "aria-label": t("notice.label") }, noticeBanner(s, store)),
    h("main", { id: "content", tabindex: "-1" }, content),
    h("footer", { class: "app-footer muted" }, `MindMatters ${env.appVersion ?? APP_VERSION}`),
  );
}

function noticeBanner(s: AppState, store: Store): Node | null {
  if (!s.notice) return null;
  return h(
    "div",
    { class: `banner banner-${s.notice.kind}` },
    h("strong", null, s.notice.text),
    " ",
    h("button", { type: "button", class: "btn btn-small", on: { click: () => dismissNotice(store) } }, "×"),
  );
}

function uiLanguageSwitch(s: AppState, store: Store): HTMLElement {
  const btn = (l: UiLang, label: string) =>
    h("button", { type: "button", class: "btn btn-small", "aria-pressed": String(s.uiLang === l), lang: l, "data-focus": `ui-lang-${l}`, on: { click: () => setUiLanguage(store, l) } }, label);
  return h("div", { class: "ui-lang", role: "group", "aria-label": t("header.uiLanguage") }, btn("de", "Deutsch"), " ", btn("en", "English"));
}

function loadedContent(s: AppState, store: Store, env: AppEnv): HTMLElement {
  const loaded = s.loaded!;
  const cat = loaded.catalog;
  const dflt = cat.catalog.defaultLanguage;
  const title = resolveText(cat.catalog.title, s.language, dflt);
  const status = cat.catalog.status;

  const info = h(
    "section",
    { class: "card catalog-head", "aria-labelledby": "cat-h" },
    h("h2", { id: "cat-h" }, title?.text ?? cat.catalog.id),
    h(
      "dl",
      { class: "facts" },
      fact(t("header.id"), h("code", null, cat.catalog.id)),
      fact(t("header.version"), h("code", null, cat.catalog.version)),
      fact(t("header.status"), h("code", null, status)),
      cat.catalog.publisher ? fact(t("header.publisher"), cat.catalog.publisher) : null,
      cat.languages.length > 1 ? fact(t("header.language"), languageSelect(s, store)) : fact(t("header.language"), h("code", null, s.language)),
    ),
    h(
      "div",
      { class: "toolbar" },
      fileButton("catalog-file-2", t("header.newCatalog"), ".json,application/json", (f) => void importCatalog(f, store, env)),
      fileButton("project-file", t("header.loadProject"), ".json,application/json", (f) => void importProject(f, store, env)),
    ),
  );

  const banners: Array<HTMLElement | null> = [
    status === "draft" ? banner("warning", t("banner.draft")) : null,
    status === "withdrawn" ? banner("error", t("banner.withdrawn")) : null,
  ];

  const views = VIEWS;
  const active = views.find((v) => v.id === s.view) ?? (views[0] as (typeof views)[number]);
  const tabs = h(
    "nav",
    { class: "tabs", "aria-label": t("tabs.label") },
    ...views.map((v) =>
      h("button", { type: "button", class: "tab", "aria-current": v.id === active.id ? "page" : false, "data-focus": `tab-${v.id}`, on: { click: () => setView(store, v.id) } }, t(v.label)),
    ),
  );

  return h("div", { class: "loaded" }, ...banners, info, tabs, active.render({ state: s, store }));
}

function fact(label: string, value: Node | string): HTMLElement {
  return h("div", { class: "fact" }, h("dt", null, label), h("dd", null, value));
}

function languageSelect(s: AppState, store: Store): HTMLElement {
  const cat = s.loaded!.catalog;
  return h(
    "select",
    { "aria-label": t("header.language"), "data-focus": "language", on: { change: (ev) => setLanguage(store, (ev.target as HTMLSelectElement).value) } },
    ...cat.languages.map((l) => h("option", { value: l, selected: l === s.language }, l)),
  );
}

/** A file button: a visually hidden input plus a label that looks like a button and stays keyboard reachable. */
export function fileButton(id: string, label: string, accept: string, onFile: (f: File) => void): HTMLElement {
  return h(
    "span",
    { class: "file-btn" },
    h("input", {
      id,
      class: "visually-hidden",
      type: "file",
      accept,
      "data-focus": id,
      on: {
        change: (ev) => {
          const input = ev.target as HTMLInputElement;
          const f = input.files?.[0];
          if (f) onFile(f);
          input.value = "";
        },
      },
    }),
    h("label", { class: "btn", for: id }, label),
  );
}

async function importCatalog(file: File, store: Store, env: AppEnv): Promise<void> {
  const s = store.get();
  if (s.loaded && s.dirty && !env.confirm(t("confirm.replaceUnsaved"))) return;
  try {
    loadCatalogText(store, await readFileText(file), file.name);
  } catch {
    store.set({ notice: { kind: "error", text: t("import.readError") } });
  }
}

async function importProject(file: File, store: Store, env: AppEnv): Promise<void> {
  const s = store.get();
  if (s.dirty && !env.confirm(t("confirm.replaceUnsaved"))) return;
  try {
    loadProjectText(store, await readFileText(file), file.name);
  } catch {
    store.set({ notice: { kind: "error", text: t("import.readError") } });
  }
}
