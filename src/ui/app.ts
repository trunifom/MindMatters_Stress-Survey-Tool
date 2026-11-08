/**
 * Application shell: mounts the page, re-renders on every state change and keeps focus, caret and dialog focus.
 *
 * Draws the header, the status chips, notices and the active view (from views/registry) from the AppState, and
 * turns file selections into store actions. It never holds state of its own besides the previous info target, and
 * never changes the catalog. A view that throws is replaced by the crash panel (errors.ts) so the page is never
 * blank. Everything user visible reads from the store; actions live in state.ts, texts in i18n.ts.
 */

import { resolveText } from "../core/localized";
import { APP_VERSION } from "../version";
import { banner, statusChips } from "./components";
import { clear, h, readFileText } from "./dom";
import { describeError, fileProblemText, renderCrashPanel } from "./errors";
import { setUiLang, t, UiLang } from "./i18n";
import { renderInfoDialog } from "./views/info";
import {
  AppState,
  cancelMigration,
  confirmMigration,
  loadCatalogText,
  loadProjectText,
  setLanguage,
  setTextSize,
  setTheme,
  setUiLanguage,
  setView,
  Store,
  counts,
  currentStatus,
  dismissNotice,
  closeInfo,
  InfoTarget,
} from "./state";
import { renderStart } from "./views/start";
import demoCatalog from "../../examples/catalog_rich_0_4_0.json";
import { VIEWS } from "./views/registry";

/** Things the shell needs from the outside, so tests can replace them. */
export interface AppEnv {
  /** Confirmation before unsaved changes are discarded (T42). */
  confirm(message: string): boolean;
  appVersion?: string;
}

/** Mount the application into `root`. Re-renders on every state change and keeps focus and caret. */
export function mountApp(root: HTMLElement, store: Store, env: AppEnv): () => void {
  let prevInfo: InfoTarget | undefined;

  const render = () => {
    const state = store.get();
    setUiLang(state.uiLang);
    document.documentElement.lang = state.uiLang;
    document.documentElement.setAttribute("data-theme", state.theme);
    document.documentElement.setAttribute("data-size", state.textSize);
    const focus = captureFocus();
    clear(root);
    try {
      root.appendChild(buildApp(state, store, env));
    } catch (e) {
      // a view that cannot be drawn must not leave a blank page: show the cause and a way back
      console.error("[MindMatters] rendering failed", e);
      root.appendChild(renderCrashPanel(e, () => (store.get().view === "items" ? render() : setView(store, "items"))));
    }
    restoreFocus(focus);

    // Dialog focus: move into the dialog when it opens, back to its trigger when it closes.
    if (state.info && !prevInfo) {
      root.querySelector<HTMLElement>("#info-close")?.focus();
    } else if (!state.info && prevInfo) {
      const trigger = Array.from(root.querySelectorAll<HTMLElement>("[data-focus]")).find(
        (e) => e.getAttribute("data-focus") === `info-${prevInfo!.kind}-${prevInfo!.id}`,
      );
      (trigger ?? root.querySelector<HTMLElement>("#content"))?.focus();
    }
    prevInfo = state.info;
  };

  const onKey = (ev: KeyboardEvent) => {
    if (!store.get().info) return;
    if (ev.key === "Escape") {
      ev.preventDefault();
      closeInfo(store);
    } else if (ev.key === "Tab") {
      trapTab(root, ev);
    }
  };
  document.addEventListener("keydown", onKey);

  const unsubscribe = store.subscribe(render);
  render();
  return () => {
    unsubscribe();
    document.removeEventListener("keydown", onKey);
  };
}

/** Keep Tab inside the open dialog. */
function trapTab(root: HTMLElement, ev: KeyboardEvent): void {
  const dialog = root.querySelector<HTMLElement>(".modal");
  if (!dialog) return;
  const focusable = Array.from(
    dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])'),
  );
  if (focusable.length === 0) return;
  const first = focusable[0] as HTMLElement;
  const last = focusable[focusable.length - 1] as HTMLElement;
  const active = document.activeElement as HTMLElement | null;
  if (!active || !dialog.contains(active)) {
    ev.preventDefault();
    first.focus();
  } else if (ev.shiftKey && active === first) {
    ev.preventDefault();
    last.focus();
  } else if (!ev.shiftKey && active === last) {
    ev.preventDefault();
    first.focus();
  }
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
    onDemo: () => loadCatalogText(store, JSON.stringify(demoCatalog), "beispielkatalog.json"),
    onConfirmMigration: () => confirmMigration(store),
    onCancelMigration: () => cancelMigration(store),
  };

  const header = h(
    "header",
    { class: "app-header" },
    h(
      "div",
      { class: "brand" },
      h("span", { class: "brand-mark", "aria-hidden": "true" }, "MM"),
      h("div", null, h("h1", null, t("app.title")), h("p", { class: "tagline muted" }, t("app.tagline"))),
    ),
    h("div", { class: "header-controls" }, uiLanguageSwitch(s, store), displayControls(s, store)),
  );

  const content = s.loaded ? loadedContent(s, store, env) : renderStart(s, handlers, env.appVersion ?? APP_VERSION);

  const modal = renderInfoDialog(s, store);
  const bg = modal ? { "aria-hidden": "true", inert: true } : {};
  return h(
    "div",
    { class: "app" },
    h("a", { class: "skip-link", href: "#content" }, t("skip")),
    h("div", { class: "app-bg", ...bg }, header, h("div", { id: "notices", role: "status", "aria-live": "polite", "aria-label": t("notice.label") }, noticeBanner(s, store)), h("main", { id: "content", tabindex: "-1" }, content), h("footer", { class: "app-footer muted" }, `MindMatters ${env.appVersion ?? APP_VERSION}`)),
    modal,
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

/** Light/dark and two text sizes, available on every screen. */
function displayControls(s: AppState, store: Store): HTMLElement {
  const dark = s.theme === "dark";
  const large = s.textSize === "large";
  return h(
    "div",
    { class: "display-controls", role: "group", "aria-label": t("pref.group") },
    h(
      "button",
      {
        type: "button",
        class: "btn btn-small",
        id: "theme-toggle",
        "data-focus": "theme-toggle",
        "aria-label": t(dark ? "pref.toLightLabel" : "pref.toDarkLabel"),
        on: { click: () => setTheme(store, dark ? "light" : "dark") },
      },
      h("span", { "aria-hidden": "true" }, dark ? "☀ " : "☾ "),
      t(dark ? "pref.toLight" : "pref.toDark"),
    ),
    h(
      "button",
      {
        type: "button",
        class: "btn btn-small",
        id: "size-toggle",
        "data-focus": "size-toggle",
        "aria-label": t(large ? "pref.smallerLabel" : "pref.largerLabel"),
        on: { click: () => setTextSize(store, large ? "normal" : "large") },
      },
      h("span", { "aria-hidden": "true" }, large ? "A− " : "A+ "),
      t(large ? "pref.smaller" : "pref.larger"),
    ),
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
    statusChips(currentStatus(s)),
    s.dirty ? h("p", { class: "badge sev-warning", id: "dirty-badge", role: "status" }, "! " + t("out.unsaved")) : null,
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
  const idx = views.indexOf(active);
  const tabs = h(
    "nav",
    { class: "tabs", "aria-label": t("tabs.label") },
    ...views.map((v, i) =>
      h(
        "button",
        { type: "button", class: "tab", "aria-current": v.id === active.id ? "page" : false, "data-focus": `tab-${v.id}`, on: { click: () => setView(store, v.id) } },
        h("span", { class: "tab-no", "aria-hidden": "true" }, String(i + 1)),
        " ",
        t(v.label),
      ),
    ),
  );
  const cnt = counts(s);
  const bar = h(
    "div",
    { class: "stepbar" },
    tabs,
    h(
      "p",
      { class: "summary-bar", role: "status", "aria-label": t("bar.label") },
      h("strong", null, t("bar.label") + ": "),
      t("summary.items", { n: cnt.items }),
      " · ",
      t("summary.modules", { n: cnt.modules }),
      " · ",
      t("summary.mandatory", { n: cnt.mandatory }),
      s.dirty ? h("span", { class: "badge sev-warning", id: "dirty-badge-bar" }, "! " + t("out.unsaved")) : null,
    ),
  );
  const prev = views[idx - 1];
  const next = views[idx + 1];
  const nav = h(
    "div",
    { class: "view-nav" },
    prev ? h("button", { type: "button", class: "btn", "data-focus": "nav-back", on: { click: () => goTo(store, prev.id) } }, "← " + t("nav.back", { to: t(prev.label) })) : h("span"),
    h("span", { class: "muted" }, t("nav.step", { n: idx + 1, m: views.length })),
    next ? h("button", { type: "button", class: "btn btn-primary", "data-focus": "nav-next", on: { click: () => goTo(store, next.id) } }, t("nav.next", { to: t(next.label) }) + " →") : h("span"),
  );

  return h("div", { class: "loaded" }, ...banners, info, bar, h("p", { class: "view-intro" }, t(active.intro)), active.render({ state: s, store }), nav);
}

/** Switch the step and bring its top into view, so a long list does not leave the reader at the bottom. */
function goTo(store: Store, view: Parameters<typeof setView>[1]): void {
  setView(store, view);
  window.scrollTo({ top: 0 });
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
  } catch (e) {
    console.error("[MindMatters] catalog import failed", e);
    store.set({ notice: { kind: "error", text: fileProblemText(e, file.name) } });
  }
}

async function importProject(file: File, store: Store, env: AppEnv): Promise<void> {
  const s = store.get();
  if (s.dirty && !env.confirm(t("confirm.replaceUnsaved"))) return;
  try {
    loadProjectText(store, await readFileText(file), file.name);
  } catch (e) {
    console.error("[MindMatters] project import failed", e);
    store.set({ notice: { kind: "error", text: fileProblemText(e, file.name) } });
  }
}
