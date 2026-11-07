import type { Condition, ConditionOrGroup, Item, Response } from "../core/types";
import { exactText } from "../core/localized";
import type { AdapterContext } from "./adapterBase";

/** Plain-language helpers for outputs that people read or paste (plans, tables). No markup is produced here. */

/** One line per answer option: catalog code and label in the export language. */
export function optionPairs(ctx: AdapterContext, item: Item): Array<{ code: string; label: string; missing: boolean }> {
  const os = ctx.optionSets.get(item.response.optionSetRef ?? "");
  return (os?.options ?? []).map((o) => ({ code: o.code, label: ctx.need(o.label, `Option "${o.code}" of "${item.id}"`, item.id), missing: o.role === "missing" }));
}

const OPERATOR_WORDS: Record<Condition["operator"], string> = {
  equals: "=",
  notEquals: "≠",
  contains: "enthält",
  notContains: "enthält nicht",
  greaterThan: ">",
  greaterThanOrEqual: "≥",
  lessThan: "<",
  lessThanOrEqual: "≤",
};

/** A condition as a readable sentence, with the option label next to the code. */
export function describeCondition(ctx: AdapterContext, vw: ConditionOrGroup): string {
  const one = (c: Condition): string => {
    const target = ctx.items.get(c.itemRef);
    const name = target?.variableName ?? c.itemRef;
    const opt = ctx.optionSets.get(target?.response.optionSetRef ?? "")?.options.find((o) => o.code === c.value);
    const label = opt ? exactText(opt.label, ctx.lang) : undefined;
    return `${name} ${OPERATOR_WORDS[c.operator]} ${c.value}${label ? ` (${label})` : ""}`;
  };
  if ("itemRef" in vw) return one(vw);
  if (vw.all) return vw.all.map(one).join(" UND ");
  return (vw.any ?? []).map(one).join(" ODER ");
}

/** Numeric and length limits of a response as short text, empty if none. */
export function limitsText(r: Response): string {
  const p: string[] = [];
  if (r.minimum !== undefined) p.push(`min ${String(r.minimum)}`);
  if (r.maximum !== undefined) p.push(`max ${String(r.maximum)}`);
  if (r.step !== undefined) p.push(`step ${r.step}`);
  if (r.maxDecimalPlaces !== undefined) p.push(`max ${r.maxDecimalPlaces} decimals`);
  if (r.minLength !== undefined) p.push(`min length ${r.minLength}`);
  if (r.maxLength !== undefined) p.push(`max length ${r.maxLength}`);
  if (r.minSelections !== undefined) p.push(`min selections ${r.minSelections}`);
  if (r.maxSelections !== undefined) p.push(`max selections ${r.maxSelections}`);
  if (r.maxRanks !== undefined) p.push(`max ranks ${r.maxRanks}`);
  if (r.exclusiveCodes?.length) p.push(`exclusive ${r.exclusiveCodes.join("/")}`);
  if (r.format) p.push(`format ${r.format}`);
  return p.join(", ");
}
