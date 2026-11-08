import { CheckStatus, Diagnostic, statusOf } from "../core/diagnostics";
import { CatalogLoad, CheckStatuses, loadCatalog, loadProject, replaceCatalog } from "../core/loader";
import type { Catalog, CustomBlock, CustomizableText, Customization, LocalizedText } from "../core/types";
import { applyCustomization, cleanText, nextBlockId, normalizeCustomization } from "../model/customize";
import { evaluateAction } from "../model/rights";
import { checkSelection, clearOptional, initialSelection, mandatorySet, setItem, setModule } from "../model/selection";
import { t, UiLang } from "./i18n";
import type { Prefs, TextSize, Theme } from "./prefs";

/**
 * Application state and actions. No DOM here: everything is testable in Node.
 *
 * The selection lives in this state, never in the DOM checkboxes (spec C01).
 * A failed import never touches the previous valid state (T04, T42).
 */

/** German whenever the catalog offers it (de, then de-CH and other de-*), else the catalog's default. */
export function preferredLanguage(c: Catalog): string {
  return c.languages.find((l) => l === "de") ?? c.languages.find((l) => l.toLowerCase().startsWith("de")) ?? c.catalog.defaultLanguage;
}

export type View = "items" | "structure" | "texts" | "preview" | "check";

export interface Notice {
  kind: "info" | "warning" | "error";
  text: string;
}

export interface Loaded {
  /** The catalog with the school's adapted texts and text blocks applied. Everything works on this one. */
  catalog: Catalog;
  /** The catalog exactly as loaded from the file. */
  base: Catalog;
  initial: Set<string>;
  loadDiagnostics: Diagnostic[];
  status: CheckStatuses;
  fileName: string;
}

export interface PendingMigration {
  kind: "catalog" | "project";
  text: string;
  fileName: string;
  from: string;
}

export interface Filter {
  query: string;
  scope: "all" | "selected" | "mandatory" | "optional";
  moduleId: string;
  constructId: string;
}

export interface InfoTarget {
  kind: "item" | "module" | "scale" | "construct";
  id: string;
}

export interface AppState {
  uiLang: UiLang;
  theme: Theme;
  textSize: TextSize;
  view: View;
  loaded?: Loaded;
  selection: Set<string>;
  /** Language of the catalog texts shown and written. */
  language: string;
  targetPlatform: string;
  schoolLabel: string;
  internalNotes: string;
  /** Selection or project metadata changed since the last load or save. */
  dirty: boolean;
  /** Findings of the most recent import attempt, successful or not. */
  importDiagnostics: Diagnostic[];
  pendingMigration?: PendingMigration;
  notice?: Notice;
  filter: Filter;
  info?: InfoTarget;
  /** The check report saved last, to recognise it as outdated after changes. */
  lastReport?: { fingerprint: string; at: string };
  /** Explicit choice: put school label and notes into the codebook (default: no). */
  codebookNotes: boolean;
  /** Adapted texts and own text blocks of the school (saved in the project file). */
  customization: Customization;
  /** Show the answer options under each question in the list. */
  showAnswers: boolean;
  /** Modules whose "how it looks in the survey" section is open. */
  openPreviews: string[];
  /** Why the last attempt to move something was refused (null = nothing to say). */
  orderNotice: string | null;
}

export const EMPTY_FILTER: Filter = { query: "", scope: "all", moduleId: "", constructId: "" };

/** German is the default interface language, always. Theme and text size are not stored anywhere. */
export function initialState(_hint?: string, prefs: Prefs = {}): AppState {
  return {
    uiLang: "de",
    theme: prefs.theme ?? "light",
    textSize: prefs.textSize ?? "normal",
    customization: {},
    showAnswers: true,
    openPreviews: [],
    orderNotice: null,
    view: "items",
    selection: new Set(),
    language: "",
    targetPlatform: "",
    schoolLabel: "",
    internalNotes: "",
    dirty: false,
    importDiagnostics: [],
    filter: { ...EMPTY_FILTER },
    codebookNotes: false,
  };
}

export interface Store {
  get(): AppState;
  set(patch: Partial<AppState>): void;
  subscribe(fn: (s: AppState) => void): () => void;
}

export function createStore(initial: AppState): Store {
  let state = initial;
  const listeners = new Set<(s: AppState) => void>();
  return {
    get: () => state,
    set(patch) {
      state = { ...state, ...patch };
      for (const l of [...listeners]) l(state);
    },
    subscribe(fn) {
      listeners.add(fn);
      return () => listeners.delete(fn);
    },
  };
}

// ---------------------------------------------------------------------------
// Loading
// ---------------------------------------------------------------------------

const hasCode = (ds: Diagnostic[], code: string) => ds.some((d) => d.code === code);

function migrationOffer(text: string, fileName: string, kind: "catalog" | "project", ds: Diagnostic[]): PendingMigration | undefined {
  if (!hasCode(ds, "SCHEMA_VERSION_MIGRATION_REQUIRED")) return undefined;
  const m = /"schemaVersion"\s*:\s*"([^"]+)"/.exec(text);
  return { kind, text, fileName, from: m?.[1] ?? "0.3.0" };
}

/**
 * Load a catalog from text. On failure the previous state stays untouched, the
 * findings are shown and a migration is only offered, never applied silently.
 */
export function loadCatalogText(store: Store, text: string, fileName: string, migrate = false): CatalogLoad {
  const s = store.get();
  const result = loadCatalog(text, { migrate });
  const previous = s.loaded ? { catalog: s.loaded.catalog, initialSelection: s.loaded.initial } : undefined;
  const { state, diagnostics } = replaceCatalog(previous, result);

  if (result.ok && result.catalog && result.initialSelection && state) {
    store.set({
      loaded: { catalog: result.catalog, base: result.catalog, initial: result.initialSelection, loadDiagnostics: result.diagnostics, status: result.status, fileName },
      selection: new Set(result.initialSelection),
      language: preferredLanguage(result.catalog),
      customization: {},
      orderNotice: null,
      openPreviews: [],
      targetPlatform: "",
      schoolLabel: "",
      internalNotes: "",
      dirty: false,
      importDiagnostics: diagnostics,
      pendingMigration: undefined,
      notice: undefined,
      filter: { ...EMPTY_FILTER },
      info: undefined,
      lastReport: undefined,
      codebookNotes: false,
    });
    return result;
  }

  const offer = migrationOffer(text, fileName, "catalog", result.diagnostics);
  store.set({
    importDiagnostics: diagnostics,
    pendingMigration: offer,
    notice: { kind: "error", text: t("import.rejected") + (s.loaded ? " " + t("import.kept") : "") },
  });
  return result;
}

/** Load a project into the loaded catalog. Mandatory items are completed and reported, nothing else is repaired. */
export function loadProjectText(store: Store, text: string, fileName: string, migrate = false): void {
  const s = store.get();
  if (!s.loaded) return;
  const r = loadProject(text, s.loaded.base, { migrate });

  if (!r.result || !r.project) {
    const offer = migrationOffer(text, fileName, "project", r.diagnostics);
    const mismatch = hasCode(r.diagnostics, "PROJECT_CATALOG_MISMATCH");
    store.set({
      importDiagnostics: r.diagnostics,
      pendingMigration: offer,
      notice: { kind: "error", text: mismatch ? t("project.mismatch") : t("import.rejected") + " " + t("import.kept") },
    });
    return;
  }

  const added = r.result.addedMandatory;
  const conflicts = r.diagnostics.some((d) => d.severity === "error");
  const lang = s.loaded.base.languages.includes(r.project.language) ? r.project.language : s.language;
  const parts: string[] = [t("project.loaded")];
  if (added.length) parts.push(t("project.added", { n: added.length, ids: added.join(", ") }));
  if (conflicts) parts.push(t("project.conflicts"));
  store.set({
    loaded: { ...s.loaded, catalog: r.catalog ?? s.loaded.base },
    customization: r.project.customization ?? {},
    orderNotice: null,
    selection: new Set(r.result.selection),
    language: lang,
    targetPlatform: r.project.targetPlatform ?? "",
    schoolLabel: r.project.schoolLabel ?? "",
    internalNotes: r.project.internalNotes ?? "",
    dirty: added.length > 0,
    importDiagnostics: r.diagnostics,
    pendingMigration: undefined,
    notice: { kind: conflicts || added.length ? "warning" : "info", text: parts.join(" ") },
  });
}

/** Apply a pending migration the user explicitly confirmed. */
export function confirmMigration(store: Store): void {
  const p = store.get().pendingMigration;
  if (!p) return;
  if (p.kind === "catalog") loadCatalogText(store, p.text, p.fileName, true);
  else loadProjectText(store, p.text, p.fileName, true);
}

export function cancelMigration(store: Store): void {
  store.set({ pendingMigration: undefined });
}

// ---------------------------------------------------------------------------
// Selection and view actions
// ---------------------------------------------------------------------------

function changeSelection(store: Store, next: Set<string>): void {
  store.set({ selection: next, dirty: true });
}

export function toggleItem(store: Store, itemId: string, on: boolean): void {
  const s = store.get();
  if (s.loaded) changeSelection(store, setItem(s.loaded.catalog, s.selection, itemId, on));
}

export function switchModule(store: Store, moduleId: string, on: boolean): void {
  const s = store.get();
  if (s.loaded) changeSelection(store, setModule(s.loaded.catalog, s.selection, moduleId, on));
}

/** "Deselect all" keeps the whole mandatory set (T10), also while a filter is active. */
export function deselectAllOptional(store: Store): void {
  const s = store.get();
  if (s.loaded) changeSelection(store, clearOptional(s.loaded.catalog));
}

export function restoreInitialSelection(store: Store): void {
  const s = store.get();
  if (s.loaded) changeSelection(store, new Set(initialSelection(s.loaded.catalog)));
}

export const setTheme = (store: Store, theme: Theme): void => store.set({ theme });
export const setTextSize = (store: Store, textSize: TextSize): void => store.set({ textSize });
export const setShowAnswers = (store: Store, on: boolean): void => store.set({ showAnswers: on });
export function setPreviewOpen(store: Store, id: string, open: boolean): void {
  const cur = store.get().openPreviews;
  if (cur.includes(id) === open) return;
  store.set({ openPreviews: open ? [...cur, id] : cur.filter((x) => x !== id) });
}
export const setView = (store: Store, view: View): void => store.set({ view });
export const setUiLanguage = (store: Store, uiLang: UiLang): void => store.set({ uiLang });
export const setLanguage = (store: Store, language: string): void => store.set({ language });
export const setFilter = (store: Store, patch: Partial<Filter>): void => store.set({ filter: { ...store.get().filter, ...patch } });
export const openInfo = (store: Store, info: InfoTarget): void => store.set({ info });
export const closeInfo = (store: Store): void => store.set({ info: undefined });
export const dismissNotice = (store: Store): void => store.set({ notice: undefined });
export const markSaved = (store: Store): void => store.set({ dirty: false });
export const setCodebookNotes = (store: Store, on: boolean): void => store.set({ codebookNotes: on });
export const rememberReport = (store: Store, fingerprint: string, at: string): void => store.set({ lastReport: { fingerprint, at } });

export function setMeta(store: Store, patch: Partial<Pick<AppState, "schoolLabel" | "internalNotes" | "targetPlatform">>): void {
  store.set({ ...patch, dirty: true });
}

// ---------------------------------------------------------------------------
// Derived values
// ---------------------------------------------------------------------------

export function selectionDiagnostics(s: AppState): Diagnostic[] {
  return s.loaded ? checkSelection(s.loaded.catalog, s.selection, "project") : [];
}

/** Current check areas for the present selection (never stale: derived on demand). */
export function currentStatus(s: AppState): Record<"technical" | "selection" | "rights" | "export", CheckStatus> {
  if (!s.loaded) return { technical: "notRun", selection: "notRun", rights: "notRun", export: "notRun" };
  const rights = evaluateAction(s.loaded.catalog, "displayItems", { selection: s.selection }).diagnostics;
  return {
    technical: s.loaded.status.technical,
    selection: statusOf(selectionDiagnostics(s), ["selection"]),
    rights: statusOf(rights, ["rights"]),
    export: "notRun",
  };
}

export interface Counts {
  items: number;
  modules: number;
  mandatory: number;
}

export function counts(s: AppState): Counts {
  if (!s.loaded) return { items: 0, modules: 0, mandatory: 0 };
  const c = s.loaded.catalog;
  const mandatory = mandatorySet(c);
  const modules = c.modules.filter((m) => m.itemRefs.some((id) => s.selection.has(id))).length;
  return { items: s.selection.size, modules, mandatory: [...mandatory].filter((id) => s.selection.has(id)).length };
}

export { initialSelection };


// ---------------------------------------------------------------------------
// School customization: adapted texts and own text blocks
// ---------------------------------------------------------------------------

/**
 * Apply a new customization: rebuild the derived catalog, keep the selection of everything that still
 * exists, select new blocks and drop removed ones. The original catalog is never touched.
 */
function applyCustom(store: Store, custom: Customization): void {
  const s = store.get();
  if (!s.loaded) return;
  const old = new Set(s.loaded.catalog.items.map((i) => i.id));
  const next = applyCustomization(s.loaded.base, custom);
  const exists = new Set(next.catalog.items.map((i) => i.id));
  const selection = new Set([...s.selection].filter((id) => exists.has(id)));
  for (const id of next.blockIds) if (!old.has(id)) selection.add(id);
  store.set({ loaded: { ...s.loaded, catalog: next.catalog }, customization: custom, selection, orderNotice: null, dirty: true });
}

/** Set (or, with empty text, remove) the text of one language of an adaptable questionnaire text. */
export function setCustomText(store: Store, key: CustomizableText, language: string, text: string): void {
  const s = store.get();
  const current: LocalizedText = { ...(s.customization.textOverrides?.[key] ?? {}) };
  if (text.trim() === "") delete current[language];
  else current[language] = text;
  const overrides = { ...(s.customization.textOverrides ?? {}) };
  if (Object.keys(current).length > 0) overrides[key] = current;
  else delete overrides[key];
  applyCustom(store, { ...s.customization, textOverrides: overrides });
}

export function resetCustomText(store: Store, key: CustomizableText): void {
  const s = store.get();
  const overrides = { ...(s.customization.textOverrides ?? {}) };
  delete overrides[key];
  applyCustom(store, { ...s.customization, textOverrides: overrides });
}

/** Set (or, with empty text, remove) the text of one language of a text block of the catalog. */
export function setNoteText(store: Store, id: string, language: string, text: string): void {
  const s = store.get();
  const current: LocalizedText = { ...(s.customization.noteOverrides?.[id] ?? {}) };
  if (text.trim() === "") delete current[language];
  else current[language] = text;
  const notes = { ...(s.customization.noteOverrides ?? {}) };
  if (Object.keys(current).length > 0) notes[id] = current;
  else delete notes[id];
  applyCustom(store, { ...s.customization, noteOverrides: notes });
}

export function resetNoteText(store: Store, id: string): void {
  const s = store.get();
  const notes = { ...(s.customization.noteOverrides ?? {}) };
  delete notes[id];
  applyCustom(store, { ...s.customization, noteOverrides: notes });
}

// --- order -------------------------------------------------------------------

const swapped = (list: string[], id: string, delta: -1 | 1): string[] | undefined => {
  const i = list.indexOf(id);
  const j = i + delta;
  if (i < 0 || j < 0 || j >= list.length) return undefined;
  const out = [...list];
  [out[i], out[j]] = [out[j]!, out[i]!];
  return out;
};

const sameList = (a: string[], b: string[]) => a.length === b.length && a.every((x, i) => x === b[i]);

/** Apply a new order if it is allowed; otherwise keep everything and say why. */
function tryOrder(store: Store, custom: Customization): void {
  const s = store.get();
  if (!s.loaded) return;
  const trial = applyCustomization(s.loaded.base, custom);
  const refused = trial.diagnostics.find((d) => d.code === "CUSTOM_ORDER_CONDITION");
  if (refused) {
    store.set({ orderNotice: refused.message });
    return;
  }
  applyCustom(store, custom);
}

/** The ids of the movable sections in their current order. */
export const movableSectionIds = (c: Catalog): string[] => c.questionnaire.sections.filter((x) => x.reorder?.movable === true).map((x) => x.id);

/** Move a movable section one place up or down among the movable sections. */
export function moveSection(store: Store, sectionId: string, delta: -1 | 1): void {
  const s = store.get();
  if (!s.loaded) return;
  const next = swapped(movableSectionIds(s.loaded.catalog), sectionId, delta);
  if (!next) return;
  const isDefault = sameList(next, movableSectionIds(s.loaded.base));
  const custom = { ...s.customization };
  if (isDefault) delete custom.sectionOrder;
  else custom.sectionOrder = next;
  tryOrder(store, custom);
}

/** Move one item inside a section whose items may be reordered. Own text blocks keep their anchor and are not moved here. */
export function moveItem(store: Store, sectionId: string, itemId: string, delta: -1 | 1): void {
  const s = store.get();
  if (!s.loaded) return;
  const sec = s.loaded.catalog.questionnaire.sections.find((x) => x.id === sectionId);
  const baseSec = s.loaded.base.questionnaire.sections.find((x) => x.id === sectionId);
  if (!sec || !baseSec || sec.reorder?.itemsReorderable !== true) return;
  const own = new Set(baseSec.itemRefs);
  const next = swapped(sec.itemRefs.filter((id) => own.has(id)), itemId, delta);
  if (!next) return;
  const itemOrder = { ...(s.customization.itemOrder ?? {}) };
  if (sameList(next, baseSec.itemRefs)) delete itemOrder[sectionId];
  else itemOrder[sectionId] = next;
  tryOrder(store, { ...s.customization, itemOrder });
}

export function resetOrder(store: Store): void {
  const s = store.get();
  const custom = { ...s.customization };
  delete custom.sectionOrder;
  delete custom.itemOrder;
  applyCustom(store, custom);
}

/** Add a block at the start of a section or after an item. Returns its id. */
export function addCustomBlock(store: Store, sectionRef: string, afterItemRef: string | null, style: CustomBlock["style"], language: string, text: string): string | undefined {
  const s = store.get();
  if (!s.loaded) return undefined;
  const id = nextBlockId(s.loaded.base, s.customization);
  const clean = cleanText({ [language]: text }) ?? { [language]: "…" };
  const block: CustomBlock = { id, style, text: clean, sectionRef, ...(afterItemRef ? { afterItemRef } : {}) };
  applyCustom(store, { ...s.customization, customBlocks: [...(s.customization.customBlocks ?? []), block] });
  return id;
}

export function updateCustomBlock(store: Store, id: string, patch: Partial<Pick<CustomBlock, "style" | "sectionRef" | "afterItemRef">>): void {
  const s = store.get();
  const blocks = (s.customization.customBlocks ?? []).map((b) => (b.id === id ? { ...b, ...patch } : b));
  applyCustom(store, { ...s.customization, customBlocks: blocks });
}

/** Set or clear the text of one language. A block that loses its last language is removed. */
export function setCustomBlockText(store: Store, id: string, language: string, text: string): void {
  const s = store.get();
  const blocks: CustomBlock[] = [];
  for (const b of s.customization.customBlocks ?? []) {
    if (b.id !== id) {
      blocks.push(b);
      continue;
    }
    const lt: LocalizedText = { ...b.text, [language]: text };
    if (text.trim() === "") delete lt[language];
    if (Object.keys(lt).length > 0) blocks.push({ ...b, text: lt });
  }
  applyCustom(store, { ...s.customization, customBlocks: blocks });
}

export function removeCustomBlock(store: Store, id: string): void {
  const s = store.get();
  applyCustom(store, { ...s.customization, customBlocks: (s.customization.customBlocks ?? []).filter((b) => b.id !== id) });
}

/** The customization as it will be written to the project file. */
export const savedCustomization = (s: AppState): Customization | undefined => normalizeCustomization(s.customization);
