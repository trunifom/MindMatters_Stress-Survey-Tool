import { Diagnostic, diag, pointer } from "../core/diagnostics";
import { leafConditions } from "../core/features";
import { templateOrder } from "../core/structure";
import type { Catalog, Item, Module, Project } from "../core/types";

/**
 * Selection model (spec A06, A07, A08, A11, B14, B18).
 *
 * Pure functions on immutable data: the DOM checkbox is never the source of truth.
 * The same `mandatorySet` is used at start, for bulk actions, when loading a
 * project and before export, so the results can never drift apart.
 */

export type Selection = ReadonlySet<string>;

/** Why an item is mandatory: its own flag, or a mandatory allOrNothing module. */
export interface MandatoryReason {
  item: boolean;
  moduleId?: string;
}

export function mandatoryReasons(c: Catalog): Map<string, MandatoryReason> {
  const out = new Map<string, MandatoryReason>();
  for (const it of c.items) if (it.inclusionRequired) out.set(it.id, { item: true });
  for (const m of c.modules) {
    if (m.selectionMode === "allOrNothing" && m.inclusionRequired) {
      for (const id of m.itemRefs) {
        const prev = out.get(id);
        out.set(id, { item: prev?.item ?? false, moduleId: m.id });
      }
    }
  }
  return out;
}

/** Effective mandatory set = inclusionRequired items + all items of mandatory allOrNothing modules. */
export function mandatorySet(c: Catalog): Set<string> {
  return new Set(mandatoryReasons(c).keys());
}

/** Initial selection: item defaults, then complete default modules, then the mandatory set (B14). */
export function initialSelection(c: Catalog): Set<string> {
  const sel = new Set<string>();
  for (const it of c.items) if (it.defaultSelected) sel.add(it.id);
  for (const m of c.modules) {
    if (m.selectionMode === "allOrNothing" && m.defaultSelected) m.itemRefs.forEach((id) => sel.add(id));
  }
  for (const id of mandatorySet(c)) sel.add(id);
  return sel;
}

/** Selected item ids in questionnaire order (never in click order). */
export function orderedSelection(c: Catalog, selected: Selection): string[] {
  const order = templateOrder(c);
  return [...selected].filter((id) => order.has(id)).sort((a, b) => (order.get(a) as number) - (order.get(b) as number));
}

// ---------------------------------------------------------------------------
// Actions (pure: return a new selection, the mandatory set always stays)
// ---------------------------------------------------------------------------

function moduleOf(c: Catalog, itemId: string): Module | undefined {
  return c.modules.find((m) => m.itemRefs.includes(itemId));
}

/** Select or deselect one item. Members of an optional allOrNothing module switch together. */
export function setItem(c: Catalog, selected: Selection, itemId: string, on: boolean): Set<string> {
  const next = new Set(selected);
  const mandatory = mandatorySet(c);
  const m = moduleOf(c, itemId);
  const ids = m && m.selectionMode === "allOrNothing" ? m.itemRefs : [itemId];
  for (const id of ids) {
    if (on) next.add(id);
    else if (!mandatory.has(id)) next.delete(id);
  }
  return next;
}

/** Module action: add or remove all members (mandatory members stay). */
export function setModule(c: Catalog, selected: Selection, moduleId: string, on: boolean): Set<string> {
  const m = c.modules.find((x) => x.id === moduleId);
  if (!m) return new Set(selected);
  const next = new Set(selected);
  const mandatory = mandatorySet(c);
  for (const id of m.itemRefs) {
    if (on) next.add(id);
    else if (!mandatory.has(id)) next.delete(id);
  }
  return next;
}

/** "Deselect all" keeps the mandatory set (T10). */
export function clearOptional(c: Catalog): Set<string> {
  return mandatorySet(c);
}

// ---------------------------------------------------------------------------
// Checks
// ---------------------------------------------------------------------------

export function checkSelection(c: Catalog, selected: Selection, context: "initial" | "project"): Diagnostic[] {
  const out: Diagnostic[] = [];
  const mark = (d: Diagnostic): Diagnostic => ({ ...d, context });

  const mandatory = mandatoryReasons(c);
  for (const [id, reason] of mandatory) {
    if (!selected.has(id)) {
      out.push(mark(diag("selection", "error", "MANDATORY_ITEM_MISSING", `Mandatory item "${id}" is not selected${reason.moduleId ? ` (mandatory via module "${reason.moduleId}")` : ""}.`, { itemRef: id })));
    }
  }

  c.scales.forEach((s, si) => {
    const n = s.itemRefs.filter((id) => selected.has(id)).length;
    if (n === 0 || n === s.itemRefs.length) return;
    if (s.selectionPolicy === "wholeScale") {
      out.push(mark(diag("selection", "error", "SCALE_PARTIAL_NOT_ALLOWED", `Scale "${s.id}" must be selected completely or not at all (${n} of ${s.itemRefs.length} selected).`, { scaleRef: s.id, jsonPath: pointer("scales", si) })));
    } else {
      out.push(mark(diag("selection", "warning", "PARTIAL_SCALE", `Scale "${s.id}" is only partly selected (${n} of ${s.itemRefs.length}). The result is not an original scale and gives no entitlement to original scoring.`, { scaleRef: s.id, jsonPath: pointer("scales", si) })));
    }
  });

  c.modules.forEach((m, mi) => {
    if (m.selectionMode !== "allOrNothing") return;
    const n = m.itemRefs.filter((id) => selected.has(id)).length;
    if (n !== 0 && n !== m.itemRefs.length) {
      out.push(mark(diag("selection", "error", "MODULE_PARTIAL", `Module "${m.id}" must be selected completely or not at all (${n} of ${m.itemRefs.length} selected).`, { moduleRef: m.id, jsonPath: pointer("modules", mi) })));
    }
  });

  const items = new Map<string, Item>(c.items.map((i) => [i.id, i]));
  c.items.forEach((it, i) => {
    if (!selected.has(it.id)) return;
    for (const leaf of leafConditions(it.visibleWhen)) {
      if (items.has(leaf.itemRef) && !selected.has(leaf.itemRef)) {
        out.push(mark(diag("selection", "error", "DEPENDENCY_NOT_SELECTED", `Item "${it.id}" depends on "${leaf.itemRef}" which is not selected. Select "${leaf.itemRef}" or remove "${it.id}".`, { itemRef: it.id, jsonPath: pointer("items", i, "visibleWhen") })));
      }
    }
  });
  return out;
}

/** The catalog's own initial selection must be consistent (A08): a configuration error otherwise. */
export function checkInitialSelection(c: Catalog): Diagnostic[] {
  return checkSelection(c, initialSelection(c), "initial");
}

// ---------------------------------------------------------------------------
// Scores (T44)
// ---------------------------------------------------------------------------

export interface ScoreAvailability {
  id: string;
  available: boolean;
  missingItems: string[];
}

/** A documented score counts as available only if all of its items are in the selection. */
export function scoreAvailability(c: Catalog, selected: Selection): ScoreAvailability[] {
  return (c.scoringDefinitions ?? []).map((d) => {
    const missingItems = d.itemRefs.filter((id) => !selected.has(id));
    return { id: d.id, available: missingItems.length === 0, missingItems };
  });
}

// ---------------------------------------------------------------------------
// Projects
// ---------------------------------------------------------------------------

export interface ProjectResult {
  /** Effective selection after adding mandatory items, in questionnaire order. */
  selection: string[];
  /** Mandatory items that were missing and have been added (reported, never silent). */
  addedMandatory: string[];
  diagnostics: Diagnostic[];
}

/**
 * Apply a project to its catalog. Only missing mandatory items are completed
 * (and reported). Every other conflict, unknown id or version mismatch is left
 * for the user to decide (A11, B18, T12, T27, T28).
 */
export function applyProject(c: Catalog, p: Project): ProjectResult {
  const out: Diagnostic[] = [];
  const mark = (d: Diagnostic): Diagnostic => ({ ...d, context: "project" });

  if (p.catalogRef.id !== c.catalog.id || p.catalogRef.version !== c.catalog.version) {
    out.push(mark(diag("selection", "error", "PROJECT_CATALOG_MISMATCH", `The project belongs to catalog ${p.catalogRef.id} ${p.catalogRef.version} but ${c.catalog.id} ${c.catalog.version} is loaded. Exact id and version are required; nothing is guessed.`, { jsonPath: "/catalogRef" })));
    return { selection: [], addedMandatory: [], diagnostics: out };
  }
  if (p.questionnaireRef !== c.questionnaire.id) {
    out.push(mark(diag("selection", "error", "PROJECT_QUESTIONNAIRE_MISMATCH", `The project refers to questionnaire "${p.questionnaireRef}" but the catalog has "${c.questionnaire.id}".`, { jsonPath: "/questionnaireRef" })));
  }
  if (!c.languages.includes(p.language)) {
    out.push(mark(diag("selection", "error", "PROJECT_LANGUAGE_UNKNOWN", `Project language "${p.language}" is not a language of the catalog (${c.languages.join(", ")}).`, { jsonPath: "/language" })));
  }

  const known = new Set(c.items.map((i) => i.id));
  const selected = new Set<string>();
  p.selectedItemIds.forEach((id, i) => {
    if (known.has(id)) selected.add(id);
    else out.push(mark(diag("selection", "error", "UNKNOWN_ITEM_ID", `The project selects item "${id}" which does not exist in the catalog. It is ignored, not repaired.`, { jsonPath: pointer("selectedItemIds", i) })));
  });

  const added: string[] = [];
  for (const [id, reason] of mandatoryReasons(c)) {
    if (!selected.has(id)) {
      selected.add(id);
      added.push(id);
      out.push(mark(diag("selection", "info", "MANDATORY_ITEM_ADDED", `Mandatory item "${id}" was missing in the project and has been added${reason.moduleId ? ` (mandatory module "${reason.moduleId}")` : ""}.`, { itemRef: id })));
    }
  }

  out.push(...checkSelection(c, selected, "project"));
  return { selection: orderedSelection(c, selected), addedMandatory: orderedSelection(c, new Set(added)), diagnostics: out };
}
