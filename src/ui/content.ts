import { exactText, resolveText } from "../core/localized";
import type { Catalog, Condition, ConditionOrGroup, Item } from "../core/types";
import { ActionDecision, evaluateAction } from "../model/rights";
import { mandatoryReasons, MandatoryReason } from "../model/selection";
import { t } from "./i18n";
import type { AppState } from "./state";

/**
 * Presentation logic shared by the views: what text may be shown for an item,
 * how a condition reads, which items match the filters. No DOM here.
 */

// --- rights: computed once per catalog object (the catalog never changes while loaded) -----------

const displayCache = new WeakMap<Catalog, ActionDecision>();

/** Display decision for every item of the catalog (browsing needs the display right for all items). */
export function displayDecision(c: Catalog): ActionDecision {
  let d = displayCache.get(c);
  if (!d) {
    d = evaluateAction(c, "displayItems");
    displayCache.set(c, d);
  }
  return d;
}

const mandatoryCache = new WeakMap<Catalog, Map<string, MandatoryReason>>();
export function mandatoryOf(c: Catalog): Map<string, MandatoryReason> {
  let m = mandatoryCache.get(c);
  if (!m) {
    m = mandatoryReasons(c);
    mandatoryCache.set(c, m);
  }
  return m;
}

export type ShownText =
  | { kind: "locked" }
  | { kind: "text"; text: string; language: string; fallback: boolean }
  | { kind: "missing" };

/** The wording of an item in the chosen language, or a lock. Never leaks locked text. */
export function itemText(s: AppState, item: Item): ShownText {
  const c = s.loaded!.catalog;
  if (!displayDecision(c).allowedItemIds.includes(item.id)) return { kind: "locked" };
  const r = resolveText(item.text, s.language, c.catalog.defaultLanguage);
  return r ? { kind: "text", text: r.text, language: r.language, fallback: r.fallback } : { kind: "missing" };
}

/** Participant-facing text in the chosen language, falling back visibly. */
export function shownText(s: AppState, lt: Record<string, string> | undefined): { text: string; fallback: boolean; language: string } | undefined {
  if (!lt) return undefined;
  const c = s.loaded!.catalog;
  const r = resolveText(lt, s.language, c.catalog.defaultLanguage);
  return r ? { text: r.text, fallback: r.fallback, language: r.language } : undefined;
}

/** Administrative text: may fall back to the default language. */
export function adminText(s: AppState, lt: Record<string, string> | undefined): string | undefined {
  return shownText(s, lt)?.text;
}

// --- conditions ----------------------------------------------------------------------------------

const OP: Record<Condition["operator"], string> = {
  equals: "=",
  notEquals: "≠",
  contains: "∋",
  notContains: "∌",
  greaterThan: ">",
  greaterThanOrEqual: "≥",
  lessThan: "<",
  lessThanOrEqual: "≤",
};

export function conditionText(vw: ConditionOrGroup): string {
  const one = (c: Condition) => `${c.itemRef} ${OP[c.operator]} ${c.value}`;
  if ("itemRef" in vw) return one(vw);
  if (vw.all) return vw.all.map(one).join(" & ");
  return (vw.any ?? []).map(one).join(" | ");
}

// --- constructs ----------------------------------------------------------------------------------

/** Chain "Parent › Child" for a construct (cycle-safe). */
export function constructPath(s: AppState, id: string): string {
  const c = s.loaded!.catalog;
  const parts: string[] = [];
  const seen = new Set<string>();
  let cur = c.constructs.find((x) => x.id === id);
  while (cur && !seen.has(cur.id)) {
    seen.add(cur.id);
    parts.unshift(adminText(s, cur.label) ?? cur.id);
    cur = cur.parentRef ? c.constructs.find((x) => x.id === cur!.parentRef) : undefined;
  }
  return parts.join(" › ");
}

/** A construct and all its descendants. */
export function constructWithDescendants(c: Catalog, id: string): Set<string> {
  const out = new Set<string>([id]);
  let grew = true;
  while (grew) {
    grew = false;
    for (const k of c.constructs) {
      if (k.parentRef && out.has(k.parentRef) && !out.has(k.id)) {
        out.add(k.id);
        grew = true;
      }
    }
  }
  return out;
}

// --- filters -------------------------------------------------------------------------------------

/**
 * Does the item match the active filters? Filters only decide what is SHOWN; they never
 * touch the selection or the output order (T20). Locked texts are not searchable: a
 * search must not reveal what the display lock hides.
 */
export function itemMatches(s: AppState, item: Item): boolean {
  const c = s.loaded!.catalog;
  const f = s.filter;
  const mandatory = mandatoryOf(c).has(item.id);

  if (f.scope === "selected" && !s.selection.has(item.id)) return false;
  if (f.scope === "mandatory" && !mandatory) return false;
  if (f.scope === "optional" && mandatory) return false;

  if (f.moduleId) {
    const m = c.modules.find((x) => x.id === f.moduleId);
    if (!m || !m.itemRefs.includes(item.id)) return false;
  }
  if (f.constructId) {
    const ids = constructWithDescendants(c, f.constructId);
    if (!item.constructRefs.some((r) => ids.has(r))) return false;
  }

  const q = f.query.trim().toLowerCase();
  if (!q) return true;

  const hay: string[] = [item.id, item.variableName, ...(item.tags ?? [])];
  if (displayDecision(c).allowedItemIds.includes(item.id)) {
    hay.push(...Object.values(item.text));
  }
  for (const r of item.constructRefs) {
    const k = c.constructs.find((x) => x.id === r);
    if (k) hay.push(k.id, ...Object.values(k.label), ...(k.tags ?? []));
  }
  for (const sc of c.scales.filter((x) => x.itemRefs.includes(item.id))) {
    hay.push(sc.id, ...Object.values(sc.title ?? {}));
  }
  const inst = item.instrumentRef ? c.instruments.find((x) => x.id === item.instrumentRef) : undefined;
  if (inst) hay.push(inst.id, ...Object.values(inst.title), inst.formName ?? "");
  const mod = c.modules.find((x) => x.itemRefs.includes(item.id));
  if (mod) hay.push(mod.id, ...Object.values(mod.title ?? {}));
  return hay.some((x) => x.toLowerCase().includes(q));
}

export { exactText };

/** The label for a response style (note items). */
export function styleLabel(style: string | undefined): string {
  return t(`items.style.${style ?? "text"}` as Parameters<typeof t>[0]);
}
