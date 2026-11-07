import { CheckStatus, Diagnostic, statusOf } from "../core/diagnostics";
import { CatalogLoad, CheckStatuses, loadCatalog, loadProject, replaceCatalog } from "../core/loader";
import type { Catalog } from "../core/types";
import { evaluateAction } from "../model/rights";
import { checkSelection, clearOptional, initialSelection, mandatorySet, setItem, setModule } from "../model/selection";
import { detectUiLang, t, UiLang } from "./i18n";

/**
 * Application state and actions. No DOM here: everything is testable in Node.
 *
 * The selection lives in this state, never in the DOM checkboxes (spec C01).
 * A failed import never touches the previous valid state (T04, T42).
 */

export type View = "items" | "preview" | "check";

export interface Notice {
  kind: "info" | "warning" | "error";
  text: string;
}

export interface Loaded {
  catalog: Catalog;
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
}

export const EMPTY_FILTER: Filter = { query: "", scope: "all", moduleId: "", constructId: "" };

export function initialState(navigatorLanguage?: string): AppState {
  return {
    uiLang: detectUiLang(navigatorLanguage),
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
      loaded: { catalog: result.catalog, initial: result.initialSelection, loadDiagnostics: result.diagnostics, status: result.status, fileName },
      selection: new Set(result.initialSelection),
      language: result.catalog.catalog.defaultLanguage,
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
  const r = loadProject(text, s.loaded.catalog, { migrate });

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
  const lang = s.loaded.catalog.languages.includes(r.project.language) ? r.project.language : s.language;
  const parts: string[] = [t("project.loaded")];
  if (added.length) parts.push(t("project.added", { n: added.length, ids: added.join(", ") }));
  if (conflicts) parts.push(t("project.conflicts"));
  store.set({
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
  if (s.loaded) changeSelection(store, new Set(s.loaded.initial));
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
