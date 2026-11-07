import { CheckStatus, Diagnostic, diag, hasErrors, statusOf } from "./diagnostics";
import { DEFAULT_LIMITS, Limits } from "./limits";
import { migrateToCurrent } from "./migrate";
import { validateStructure } from "./schemaCheck";
import { validateCatalogSemantics } from "./semantic";
import { parseStrictJson } from "./strictJson";
import type { Catalog, Project } from "./types";
import { evaluateAction } from "../model/rights";
import { applyProject, checkInitialSelection, initialSelection, ProjectResult } from "../model/selection";

/**
 * Load pipeline (spec C01):
 *   text -> syntax/duplicates/limits -> [explicit migration] -> structure (schema)
 *        -> references and semantics -> initial selection -> usable catalog.
 *
 * The result is all-or-nothing: a catalog is only returned if no stage reported
 * an error ("failed import is discarded transactionally"). Diagnostics of every
 * stage that ran are always returned, so a broken file can still be analysed.
 */

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

export interface ProjectLoad {
  /** True if the project loaded without errors. */
  ok: boolean;
  /** Present whenever the project belongs to the catalog, even with errors, so the user can edit the intermediate state. */
  result?: ProjectResult;
  /** The project document as read (after an explicit migration), for its language and local labels. */
  project?: Project;
  diagnostics: Diagnostic[];
}

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

  const result = applyProject(catalog, doc as Project);
  diagnostics.push(...result.diagnostics);
  const mismatch = result.diagnostics.some((d) => d.code === "PROJECT_CATALOG_MISMATCH");
  return { ok: !hasErrors(diagnostics), ...(mismatch ? {} : { result, project: doc as Project }), diagnostics };
}

// ---------------------------------------------------------------------------
// Transactional replacement (T04, T42)
// ---------------------------------------------------------------------------

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
