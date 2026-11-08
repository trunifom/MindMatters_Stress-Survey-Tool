import { deepClone } from "../core/clone";
import { Diagnostic, diag } from "../core/diagnostics";
import { checkConditions } from "../core/structure";
import { CUSTOMIZABLE_TEXTS, Catalog, CustomBlock, CustomizableText, Customization, Item, LocalizedText, RightsProfile, Section } from "../core/types";

/**
 * School customization: adapted texts and added text blocks (titles, subtitles, text, notices).
 *
 * The catalog on disk is never changed. `applyCustomization` builds a derived catalog in memory, and
 * everything else (list, preview, check, every export) works on that derived catalog, so the adapted
 * wording can never differ between preview and export.
 *
 * Rules:
 *  - texts the catalog lists in `questionnaire.lockedTexts` are standardized wording: an override is
 *    ignored and reported, never applied;
 *  - a block is a note item of origin "own" with its own rights profile (the school wrote it);
 *  - a block with an unknown section is skipped and reported, never attached somewhere else.
 */

export const CUSTOM_RIGHTS_ID = "rights_custom_text";
export const CUSTOM_ID_PREFIX = "custom_";

export const isCustomId = (id: string): boolean => id.startsWith(CUSTOM_ID_PREFIX);

export interface Customized {
  catalog: Catalog;
  /** Ids of the blocks that were applied, in the order of the customization. */
  blockIds: string[];
  diagnostics: Diagnostic[];
}

export function isEmptyCustomization(c: Customization | undefined): boolean {
  return normalizeCustomization(c) === undefined;
}

/** Drops languages with blank content. */
export function cleanText(t: LocalizedText | undefined): LocalizedText | undefined {
  if (!t) return undefined;
  const out: LocalizedText = {};
  for (const [l, v] of Object.entries(t)) if (v.trim() !== "") out[l] = v;
  return Object.keys(out).length > 0 ? out : undefined;
}

function cleanOverrides(o: Customization["textOverrides"]): NonNullable<Customization["textOverrides"]> {
  const out: NonNullable<Customization["textOverrides"]> = {};
  if (!o) return out;
  for (const k of CUSTOMIZABLE_TEXTS) {
    const v = cleanText(o[k]);
    if (v) out[k] = v;
  }
  return out;
}

/** The catalog's own text for a customizable field (before any override). */
export function baseText(c: Catalog, key: CustomizableText): LocalizedText | undefined {
  const q = c.questionnaire;
  switch (key) {
    case "title":
      return q.title;
    case "introduction":
      return q.introduction;
    case "closingText":
      return q.closingText;
    case "privacyNotice":
      return q.privacyNotice;
    case "helpResources":
      return q.helpResources;
    case "consentTitle":
      return q.consent?.title;
    case "consentText":
      return q.consent?.text;
    case "parentalConsentText":
      return q.consent?.parentalConsentText;
  }
}

export function isLocked(c: Catalog, key: CustomizableText): boolean {
  return (c.questionnaire.lockedTexts ?? []).includes(key);
}

export const isSectionMovable = (s: Section): boolean => s.reorder?.movable === true;
export const areItemsReorderable = (s: Section): boolean => s.reorder?.itemsReorderable === true;

/** Applies the school's order. Moves that would put a condition's trigger behind the dependent item are refused. */
function applyOrder(c: Catalog, norm: Customization, diagnostics: Diagnostic[]): void {
  const triggerErrors = (cat: Catalog) => checkConditions(cat).filter((d) => d.code === "CONDITION_TRIGGER_NOT_BEFORE");
  const allowed = (what: string): boolean => {
    const bad = triggerErrors(c);
    if (bad.length === 0) return true;
    diagnostics.push(diag("selection", "warning", "CUSTOM_ORDER_CONDITION", `The new order of ${what} was ignored: ${bad[0]!.message}`, { context: "project" }));
    return false;
  };
  const secs = c.questionnaire.sections;

  if (norm.sectionOrder) {
    const movable = new Set(secs.filter(isSectionMovable).map((s) => s.id));
    const wanted: string[] = [];
    for (const id of norm.sectionOrder) {
      if (!secs.some((s) => s.id === id)) diagnostics.push(diag("selection", "warning", "CUSTOM_ORDER_UNKNOWN", `The section "${id}" does not exist. It was ignored in the order.`, { context: "project" }));
      else if (!movable.has(id)) diagnostics.push(diag("selection", "warning", "CUSTOM_ORDER_LOCKED", `The section "${id}" is not movable in this catalog. Its place was kept.`, { context: "project" }));
      else if (!wanted.includes(id)) wanted.push(id);
    }
    for (const s of secs) if (movable.has(s.id) && !wanted.includes(s.id)) wanted.push(s.id);
    const byId = new Map(secs.map((s) => [s.id, s]));
    let k = 0;
    const next = secs.map((s) => (movable.has(s.id) ? byId.get(wanted[k++]!)! : s));
    c.questionnaire.sections = next;
    if (!allowed("the sections")) c.questionnaire.sections = secs;
  }

  for (const [sid, ids] of Object.entries(norm.itemOrder ?? {})) {
    const sec = c.questionnaire.sections.find((s) => s.id === sid);
    if (!sec) {
      diagnostics.push(diag("selection", "warning", "CUSTOM_ORDER_UNKNOWN", `The section "${sid}" does not exist. Its item order was ignored.`, { context: "project" }));
      continue;
    }
    if (!areItemsReorderable(sec)) {
      diagnostics.push(diag("selection", "warning", "CUSTOM_ORDER_LOCKED", `The items of section "${sid}" cannot be reordered in this catalog. The published order was kept.`, { context: "project" }));
      continue;
    }
    const original = sec.itemRefs;
    const wanted = ids.filter((id, i) => original.includes(id) && ids.indexOf(id) === i);
    sec.itemRefs = [...wanted, ...original.filter((id) => !wanted.includes(id))];
    if (!allowed(`section "${sid}"`)) sec.itemRefs = original;
  }
}

/** The text blocks (notes) of the catalog itself, in questionnaire order, without the school's own blocks. */
export function catalogNotes(c: Catalog): Item[] {
  const order: string[] = [];
  for (const s of c.questionnaire.sections) for (const id of s.itemRefs) if (!order.includes(id)) order.push(id);
  const byId = new Map(c.items.map((i) => [i.id, i]));
  return order.map((id) => byId.get(id)).filter((i): i is Item => !!i && i.response.kind === "note" && !isCustomId(i.id));
}

export function isNoteLocked(c: Catalog, id: string): boolean {
  return (c.questionnaire.lockedNotes ?? []).includes(id);
}

/** Normalized form that is written to the project file (stable, without empty parts). Undefined if nothing is left. */
export function normalizeCustomization(c: Customization | undefined): Customization | undefined {
  if (!c) return undefined;
  const overrides = cleanOverrides(c.textOverrides);
  const blocks: CustomBlock[] = [];
  for (const b of c.customBlocks ?? []) {
    const text = cleanText(b.text);
    if (!text) continue;
    blocks.push({ id: b.id, style: b.style, text, sectionRef: b.sectionRef, ...(b.afterItemRef ? { afterItemRef: b.afterItemRef } : {}) });
  }
  const notes: Record<string, LocalizedText> = {};
  for (const [id, t] of Object.entries(c.noteOverrides ?? {})) {
    const v = cleanText(t);
    if (v) notes[id] = v;
  }
  const itemOrder: Record<string, string[]> = {};
  for (const [sid, ids] of Object.entries(c.itemOrder ?? {})) if (ids.length > 0) itemOrder[sid] = [...ids];
  const out: Customization = {
    ...((c.sectionOrder ?? []).length > 0 ? { sectionOrder: [...c.sectionOrder!] } : {}),
    ...(Object.keys(itemOrder).length > 0 ? { itemOrder } : {}),
    ...(Object.keys(overrides).length > 0 ? { textOverrides: overrides } : {}),
    ...(Object.keys(notes).length > 0 ? { noteOverrides: notes } : {}),
    ...(blocks.length > 0 ? { customBlocks: blocks } : {}),
  };
  return Object.keys(out).length > 0 ? out : undefined;
}

function setOverride(c: Catalog, key: CustomizableText, text: LocalizedText): void {
  const q = c.questionnaire;
  switch (key) {
    case "title":
      q.title = text;
      break;
    case "introduction":
      q.introduction = text;
      break;
    case "closingText":
      q.closingText = text;
      break;
    case "privacyNotice":
      q.privacyNotice = text;
      break;
    case "helpResources":
      q.helpResources = text;
      break;
    case "consentTitle":
      if (q.consent) q.consent.title = text;
      break;
    case "consentText":
      q.consent = { ...(q.consent ?? {}), text };
      break;
    case "parentalConsentText":
      if (q.consent) q.consent.parentalConsentText = text;
      break;
  }
}

export function applyCustomization(base: Catalog, custom: Customization | undefined): Customized {
  const diagnostics: Diagnostic[] = [];
  const norm = normalizeCustomization(custom);
  if (!norm) return { catalog: base, blockIds: [], diagnostics };
  const c = deepClone(base);

  for (const key of CUSTOMIZABLE_TEXTS) {
    const text = norm.textOverrides?.[key];
    if (!text) continue;
    if (isLocked(base, key)) {
      diagnostics.push(diag("selection", "warning", "CUSTOM_TEXT_LOCKED", `The text "${key}" is standardized wording of the catalog and cannot be changed. The adaptation was ignored.`, { context: "project" }));
      continue;
    }
    if ((key === "consentTitle" || key === "parentalConsentText") && !base.questionnaire.consent) {
      diagnostics.push(diag("selection", "warning", "CUSTOM_TEXT_NO_TARGET", `The catalog has no consent section, so the adaptation of "${key}" has nothing to attach to and was ignored.`, { context: "project" }));
      continue;
    }
    setOverride(c, key, text);
  }

  for (const [id, text] of Object.entries(norm.noteOverrides ?? {})) {
    const item = c.items.find((i) => i.id === id);
    if (!item || item.response.kind !== "note") {
      diagnostics.push(diag("selection", "warning", "CUSTOM_NOTE_NO_TARGET", `"${id}" is not a text block of this catalog, so the adaptation was ignored.`, { context: "project", itemRef: id }));
      continue;
    }
    if (isNoteLocked(base, id)) {
      diagnostics.push(diag("selection", "warning", "CUSTOM_NOTE_LOCKED", `The text block "${id}" is standardized wording of the catalog and cannot be changed. The adaptation was ignored.`, { context: "project", itemRef: id }));
      continue;
    }
    item.text = text;
  }

  if (norm.sectionOrder || norm.itemOrder) applyOrder(c, norm, diagnostics);

  const blockIds: string[] = [];
  const known = new Set(c.items.map((i) => i.id));
  for (const b of norm.customBlocks ?? []) {
    const section = c.questionnaire.sections.find((s) => s.id === b.sectionRef);
    if (!section) {
      diagnostics.push(diag("selection", "error", "CUSTOM_BLOCK_SECTION_UNKNOWN", `The text block "${b.id}" belongs to section "${b.sectionRef}", which does not exist in this catalog. The block was skipped.`, { context: "project", itemRef: b.id }));
      continue;
    }
    if (known.has(b.id)) {
      diagnostics.push(diag("selection", "error", "CUSTOM_BLOCK_ID_TAKEN", `The id "${b.id}" is already used. The block was skipped.`, { context: "project", itemRef: b.id }));
      continue;
    }
    let at = 0;
    if (b.afterItemRef) {
      const idx = section.itemRefs.indexOf(b.afterItemRef);
      if (idx < 0) {
        diagnostics.push(diag("selection", "warning", "CUSTOM_BLOCK_ANCHOR_UNKNOWN", `The text block "${b.id}" should follow "${b.afterItemRef}", which is not in section "${b.sectionRef}". It was placed at the start of the section.`, { context: "project", itemRef: b.id }));
      } else at = idx + 1;
    }
    const item: Item = {
      id: b.id,
      version: "1.0.0",
      text: b.text,
      response: { kind: "note", style: b.style },
      inclusionRequired: false,
      answerRequired: false,
      defaultSelected: true,
      variableName: b.id,
      constructRefs: [],
      origin: "own",
      rightsRef: CUSTOM_RIGHTS_ID,
    };
    c.items.push(item);
    known.add(b.id);
    section.itemRefs.splice(at, 0, b.id);
    blockIds.push(b.id);
  }

  if (blockIds.length > 0 && !c.rights.some((r) => r.id === CUSTOM_RIGHTS_ID)) {
    const german = c.languages.find((l) => l.toLowerCase().startsWith("de"));
    const rights: RightsProfile = {
      id: CUSTOM_RIGHTS_ID,
      reviewStatus: "reviewed",
      permissions: { redistribution: "permitted", electronicDisplay: "permitted", electronicAdministration: "permitted", modification: "permitted", export: "permitted" },
      // the note must use a declared language of the catalog
      notes: german ? { [german]: "Von der Schule selbst verfasste Textbausteine." } : { [c.catalog.defaultLanguage]: "Text blocks written by the school itself." },
    };
    c.rights.push(rights);
  }
  return { catalog: c, blockIds, diagnostics };
}

/** Next free block id (custom_1, custom_2, ...). */
export function nextBlockId(base: Catalog, custom: Customization | undefined): string {
  const used = new Set([...base.items.map((i) => i.id), ...(custom?.customBlocks ?? []).map((b) => b.id)]);
  for (let n = 1; ; n++) if (!used.has(`${CUSTOM_ID_PREFIX}${n}`)) return `${CUSTOM_ID_PREFIX}${n}`;
}
