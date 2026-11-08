/**
 * Load pipeline (spec C01):
 *   text -> syntax/duplicates/limits -> [explicit migration] -> structure (schema)
 *        -> references and semantics -> initial selection -> usable catalog.
 *
 * The result is all-or-nothing: a catalog is only returned if no stage reported an error ("failed import is
 * discarded transactionally"). Diagnostics of every stage that ran are always returned, so a broken file can
 * still be analysed. loadProject additionally applies the school's customization (model/customize) before the
 * saved selection is judged. This is the only place where core meets model; it never touches the DOM and never
 * mutates a previously loaded catalog (see replaceCatalog).
 */

import { CheckStatus, Diagnostic, diag, hasErrors, statusOf } from "./diagnostics";
import { DEFAULT_LIMITS, Limits } from "./limits";
import { migrateToCurrent } from "./migrate";
import { validateStructure } from "./schemaCheck";
import { validateCatalogSemantics } from "./semantic";
import { parseStrictJson } from "./strictJson";
import type { Catalog, Project } from "./types";
import { evaluateAction } from "../model/rights";
import { applyCustomization } from "../model/customize";
import { applyProject, checkInitialSelection, initialSelection, ProjectResult } from "../model/selection";

/** Options for loadCatalog and loadProject. */
export interface LoadOptions {
  limits?: Limits;
  /**
   * Allow the explicit, additive migration of a 0.3.0 document. Off by default:
   * without it a 0.3.0 file is rejected with SCHEMA_VERSION_MIGRATION_REQUIRED.
   */
  migrate?: boolean;
}

/** Separate check areas (spec C02). Export is evaluated per adapter later. */
export interface CheckStatuses {
  technical: CheckStatus;
  selection: CheckStatus;
  rights: CheckStatus;
  export: CheckStatus;
}

/** Result of loadCatalog. `catalog` and `initialSelection` exist only if `ok`; `diagnostics` are always present. */
export interface CatalogLoad {
  /** True if the catalog can be used (no errors in any stage). */
  ok: boolean;
  catalog?: Catalog;
  /** Initial selection of a usable catalog, in no particular order. */
  initialSelection?: Set<string>;
  diagnostics: Diagnostic[];
  status: CheckStatuses;
}

function statuses(ds: Diagnostic[], ran: { selection: boolean; rights?: boolean }): CheckStatuses {
  return {
    technical: statusOf(ds, ["file", "structure", "reference", "content"]),
    selection: ran.selection ? statusOf(ds, ["selection"]) : "notRun",
    rights: ran.rights ? statusOf(ds, ["rights"]) : "notRun",
    export: "notRun",
  };
}

/**
 * Read a catalog from text. Never throws: every problem becomes a diagnostic. A 0.3.0 file is only migrated with `options.migrate`;
 * rights limitations (unreviewed items) are reported as diagnostics but never make the catalog unusable.
 */
export function loadCatalog(text: string, options: LoadOptions = {}): CatalogLoad {
  const parsed = parseStrictJson(text, options.limits ?? DEFAULT_LIMITS);
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics, status: statuses(parsed.diagnostics, { selection: false }) };

  let doc: unknown = parsed.value;
  const diagnostics: Diagnostic[] = [];
  if (options.migrate && typeof doc === "object" && doc !== null && (doc as { schemaVersion?: unknown }).schemaVersion === "0.3.0") {
    const m = migrateToCurrent(doc);
    if (m.ok) {
      doc = m.doc;
      diagnostics.push(...m.diagnostics);
    }
  }

  const structure = validateStructure(doc, "catalog");
  diagnostics.push(...structure);
  if (hasErrors(structure)) return { ok: false, diagnostics, status: statuses(diagnostics, { selection: false }) };

  const catalog = doc as Catalog;
  diagnostics.push(...validateCatalogSemantics(catalog));
  // The initial selection can only be judged on a catalog whose references resolve.
  const sound = !hasErrors(diagnostics);
  if (sound) diagnostics.push(...checkInitialSelection(catalog));

  // Rights limitations never make a catalog unusable: texts of items without a
  // confirmed display permission are locked, but the catalog stays loadable (C03).
  const ok = !hasErrors(diagnostics);
  if (ok) {
    diagnostics.push(...evaluateAction(catalog, "displayItems", { selection: initialSelection(catalog) }).diagnostics);
  }
  return {
    ok,
    ...(ok ? { catalog, initialSelection: initialSelection(catalog) } : {}),
    diagnostics,
    status: statuses(diagnostics, { selection: sound, rights: ok }),
  };
}

/** Result of loadProject. */
export interface ProjectLoad {
  /** True if the project loaded without errors. */
  ok: boolean;
  /** Present whenever the project belongs to the catalog, even with errors, so the user can edit the intermediate state. */
  result?: ProjectResult;
  /** The project document as read (after an explicit migration), for its language and local labels. */
  project?: Project;
  /** The catalog with the project's adapted texts and text blocks applied (the loaded catalog itself if there are none). */
  catalog?: Catalog;
  diagnostics: Diagnostic[];
}

/**
 * Read a project file for an already loaded catalog. Customization is applied first, then the selection is judged against the derived
 * catalog. Missing mandatory items are added and reported, other conflicts stay as an editable intermediate state
 * (`result` is still returned). A project of another catalog id/version yields PROJECT_CATALOG_MISMATCH and no result.
 */
export function loadProject(text: string, catalog: Catalog, options: LoadOptions = {}): ProjectLoad {
  const parsed = parseStrictJson(text, options.limits ?? DEFAULT_LIMITS);
  if (!parsed.ok) return { ok: false, diagnostics: parsed.diagnostics };

  let doc: unknown = parsed.value;
  const diagnostics: Diagnostic[] = [];
  if (options.migrate && typeof doc === "object" && doc !== null && (doc as { schemaVersion?: unknown }).schemaVersion === "0.3.0") {
    const m = migrateToCurrent(doc);
    if (m.ok) {
      doc = m.doc;
      diagnostics.push(...m.diagnostics);
    }
  }

  const structure = validateStructure(doc, "project");
  diagnostics.push(...structure);
  if (hasErrors(structure)) return { ok: false, diagnostics };

  // Adapted texts and own text blocks come first: the selection may name blocks that only exist after applying them.
  const customized = applyCustomization(catalog, (doc as Project).customization);
  diagnostics.push(...customized.diagnostics);
  const result = applyProject(customized.catalog, doc as Project);
  diagnostics.push(...result.diagnostics);
  const mismatch = result.diagnostics.some((d) => d.code === "PROJECT_CATALOG_MISMATCH");
  return { ok: !hasErrors(diagnostics), ...(mismatch ? {} : { result, project: doc as Project, catalog: customized.catalog }), diagnostics };
}

// ---------------------------------------------------------------------------
// Transactional replacement (T04, T42)
// ---------------------------------------------------------------------------

/** Minimal state held by the application: the usable catalog and its initial selection. */
export interface LoadedCatalog {
  catalog: Catalog;
  initialSelection: Set<string>;
}

/**
 * Replace the current catalog only if the new load succeeded. On failure the
 * previous valid state stays untouched and an info diagnostic says so.
 */
export function replaceCatalog(
  previous: LoadedCatalog | undefined,
  next: CatalogLoad,
): { state: LoadedCatalog | undefined; diagnostics: Diagnostic[] } {
  if (next.ok && next.catalog && next.initialSelection) {
    return { state: { catalog: next.catalog, initialSelection: next.initialSelection }, diagnostics: next.diagnostics };
  }
  const note = previous
    ? [diag("file", "info", "PREVIOUS_STATE_KEPT", `The file was rejected. The previously loaded catalog "${previous.catalog.catalog.id}" is unchanged.`)]
    : [];
  return { state: previous, diagnostics: [...next.diagnostics, ...note] };
}
