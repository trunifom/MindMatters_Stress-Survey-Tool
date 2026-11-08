/**
 * Score definition checks (stage "content"), spec B17.
 *
 * Scoring is documentation only: nothing is computed anywhere in the application. The checks make sure the
 * documented mapping is complete and consistent (exactly one mapping per item, every option code scored or
 * declared missing, roles matching) so that nobody relies on a half-defined score. Read-only; called from semantic.ts.
 */

import { Diagnostic, diag, pointer } from "./diagnostics";
import type { Catalog, Item, OptionSet } from "./types";

/**
 * Check every scoring definition; all findings are errors with a SCORE_* code. Items that do not resolve are skipped here because
 * registers.ts reports them (MISSING_ITEM, MISSING_OPTION_SET).
 */
export function checkScoring(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const items = new Map<string, Item>(c.items.map((i) => [i.id, i]));
  const optionSets = new Map<string, OptionSet>(c.optionSets.map((o) => [o.id, o]));

  (c.scoringDefinitions ?? []).forEach((def, di) => {
    const base = (...p: Array<string | number>) => pointer("scoringDefinitions", di, ...p);
    const add = (code: string, message: string, path: string, itemRef?: string) =>
      out.push(diag("content", "error", code, message, { jsonPath: path, ...(itemRef ? { itemRef } : {}) }));

    if (def.minimumAnswered > def.itemRefs.length) {
      add("SCORE_MINIMUM_EXCEEDS_ITEMS", `minimumAnswered (${def.minimumAnswered}) exceeds the ${def.itemRefs.length} items of "${def.id}".`, base("minimumAnswered"));
    }

    // exactly one mapping per item of the definition
    const mapped = new Map<string, number>();
    def.itemMappings.forEach((m, mi) => {
      mapped.set(m.itemRef, (mapped.get(m.itemRef) ?? 0) + 1);
      if (!def.itemRefs.includes(m.itemRef)) {
        add("SCORE_MAPPING_EXTRA", `Mapping for "${m.itemRef}" which is not an item of "${def.id}".`, base("itemMappings", mi, "itemRef"), m.itemRef);
      }
    });
    for (const id of def.itemRefs) {
      const n = mapped.get(id) ?? 0;
      if (n === 0) add("SCORE_MAPPING_MISSING", `Item "${id}" of "${def.id}" has no mapping.`, base("itemMappings"), id);
      if (n > 1) add("SCORE_MAPPING_DUPLICATE", `Item "${id}" of "${def.id}" has ${n} mappings; exactly one is required.`, base("itemMappings"), id);
    }

    def.itemMappings.forEach((m, mi) => {
      const item = items.get(m.itemRef);
      if (!item) return; // MISSING_ITEM
      const mp = (...p: Array<string | number>) => base("itemMappings", mi, ...p);
      if (item.response.kind !== "singleChoice") {
        add("SCORE_ITEM_NOT_SINGLE_CHOICE", `Item "${item.id}" is "${item.response.kind}"; only singleChoice can be scored in this profile.`, mp("itemRef"), item.id);
        return;
      }
      const os = item.response.optionSetRef ? optionSets.get(item.response.optionSetRef) : undefined;
      if (!os) return; // MISSING_OPTION_SET

      const roleByCode = new Map(os.options.map((o) => [o.code, o.role]));
      const listed = new Map<string, number>();
      const note = (code: string, where: "rawToScore" | "missingCodes", idx: number) => {
        listed.set(code, (listed.get(code) ?? 0) + 1);
        const role = roleByCode.get(code);
        if (role === undefined) {
          add("SCORE_CODE_UNKNOWN", `Code "${code}" is not an option of "${os.id}".`, mp(where, idx), item.id);
        } else if (where === "rawToScore" && role === "missing") {
          add("SCORE_ROLE_MISMATCH", `Code "${code}" has role "missing" but is scored in rawToScore.`, mp(where, idx), item.id);
        } else if (where === "missingCodes" && role === "substantive") {
          add("SCORE_ROLE_MISMATCH", `Code "${code}" has role "substantive" but is listed in missingCodes.`, mp(where, idx), item.id);
        }
      };
      m.rawToScore.forEach((r, ri) => note(r.code, "rawToScore", ri));
      m.missingCodes.forEach((code, ci) => note(code, "missingCodes", ci));

      for (const [code, n] of listed) {
        if (n > 1) add("SCORE_CODE_DUPLICATE", `Code "${code}" is listed ${n} times for "${item.id}"; it must appear exactly once.`, mp("rawToScore"), item.id);
      }
      for (const o of os.options) {
        if (!listed.has(o.code)) {
          add("SCORE_CODE_UNCOVERED", `Option code "${o.code}" of "${os.id}" is neither in rawToScore nor in missingCodes for "${item.id}".`, mp("rawToScore"), item.id);
        }
      }
    });
  });
  return out;
}
