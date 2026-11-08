/**
 * Option set and response checks (stage "content"), spec B10, B12, B13.
 *
 * The key idea of B12: a catalog must never contain a required answer that no respondent can give (e.g. exclusive
 * code with minSelections >= 2, maxLength 0 for a required text). Such combinations are catalog errors, not hidden
 * special cases of the form. Read-only; called from semantic.ts.
 */

import { Diagnostic, diag, pointer } from "./diagnostics";
import type { Catalog, Item, OptionSet } from "./types";

/** Ordinal option sets need unique, ascending ordinalPosition on all substantive options (ORDINAL_POSITIONS_INVALID). */
export function checkOptionSets(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  c.optionSets.forEach((os, i) => {
    if (os.measurementLevel !== "ordinal") return;
    const base = pointer("optionSets", i, "options");
    let last = 0;
    const seen = new Set<number>();
    os.options.forEach((o, j) => {
      if (o.role !== "substantive") return;
      const pos = o.ordinalPosition;
      if (pos === undefined) {
        out.push(diag("content", "error", "ORDINAL_POSITIONS_INVALID", `Option "${o.code}" of ordinal option set "${os.id}" has no ordinalPosition.`, { jsonPath: base + pointer(j) }));
        return;
      }
      if (seen.has(pos)) {
        out.push(diag("content", "error", "ORDINAL_POSITIONS_INVALID", `ordinalPosition ${pos} occurs more than once in option set "${os.id}".`, { jsonPath: base + pointer(j, "ordinalPosition") }));
      } else if (pos < last) {
        out.push(diag("content", "error", "ORDINAL_POSITIONS_INVALID", `Options of ordinal option set "${os.id}" must be listed in ascending ordinalPosition (found ${pos} after ${last}).`, { jsonPath: base + pointer(j, "ordinalPosition") }));
      }
      seen.add(pos);
      last = Math.max(last, pos);
    });
  });
  return out;
}

/** widget -> response kinds it can represent (spec B13). */
const WIDGET_KINDS: Record<string, readonly string[]> = {
  radio: ["singleChoice"],
  dropdown: ["singleChoice"],
  checkbox: ["multipleChoice"],
  number: ["integer", "decimal"],
  text: ["shortText"],
  textarea: ["longText"],
  date: ["date"],
  slider: ["slider"],
};

/**
 * Per item: ranges and lengths are consistent (RANGE_INVALID, SLIDER_RANGE_INVALID, RANKING_MAX_EXCEEDS_OPTIONS), a required answer is
 * actually answerable (ANSWER_UNSATISFIABLE) and the widget can present the response kind (PRESENTATION_INCOMPATIBLE). Spec B12, B13.
 */
export function checkResponses(c: Catalog): Diagnostic[] {
  const out: Diagnostic[] = [];
  const optionSets = new Map<string, OptionSet>(c.optionSets.map((o) => [o.id, o]));

  c.items.forEach((it, i) => {
    const at = (...p: Array<string | number>) => pointer("items", i, "response", ...p);
    const add = (severity: "error" | "warning", code: string, message: string, path: string) =>
      out.push(diag("content", severity, code, message, { jsonPath: path, itemRef: it.id }));
    const r = it.response;

    switch (r.kind) {
      case "integer":
      case "decimal": {
        if (typeof r.minimum === "number" && typeof r.maximum === "number" && r.minimum > r.maximum) {
          add("error", "RANGE_INVALID", `minimum (${r.minimum}) is greater than maximum (${r.maximum}).`, at());
        }
        break;
      }
      case "shortText":
      case "longText": {
        if (r.minLength !== undefined && r.maxLength !== undefined && r.minLength > r.maxLength) {
          add("error", "RANGE_INVALID", `minLength (${r.minLength}) is greater than maxLength (${r.maxLength}).`, at());
        }
        if (it.answerRequired && r.maxLength === 0) {
          add("error", "ANSWER_UNSATISFIABLE", "A required text answer cannot be given: maxLength is 0.", at("maxLength"));
        }
        break;
      }
      case "date": {
        if (typeof r.minimum === "string" && typeof r.maximum === "string" && r.minimum > r.maximum) {
          add("error", "RANGE_INVALID", `minimum (${r.minimum}) is later than maximum (${r.maximum}).`, at());
        }
        break;
      }
      case "multipleChoice":
        checkMultiple(it, optionSets, at, add);
        break;
      case "slider": {
        const min = r.minimum as number;
        const max = r.maximum as number;
        if (min >= max) {
          add("error", "SLIDER_RANGE_INVALID", `minimum (${min}) must be smaller than maximum (${max}).`, at());
        } else if (r.step !== undefined && r.step > max - min) {
          add("error", "SLIDER_RANGE_INVALID", `step (${r.step}) is larger than the range (${max - min}).`, at("step"));
        }
        break;
      }
      case "ranking": {
        const os = r.optionSetRef ? optionSets.get(r.optionSetRef) : undefined;
        if (os && r.maxRanks !== undefined) {
          const n = os.options.filter((o) => o.role === "substantive").length;
          if (r.maxRanks > n) {
            add("error", "RANKING_MAX_EXCEEDS_OPTIONS", `maxRanks (${r.maxRanks}) exceeds the ${n} substantive options.`, at("maxRanks"));
          }
        }
        break;
      }
      default:
        break;
    }

    // Presentation wish must fit the response kind (B13).
    const widget = it.presentation?.widget;
    if (widget) {
      const allowed = WIDGET_KINDS[widget] ?? [];
      if (!allowed.includes(r.kind)) {
        add("error", "PRESENTATION_INCOMPATIBLE", `Widget "${widget}" cannot present a "${r.kind}" response.`, pointer("items", i, "presentation", "widget"));
      }
    }
  });
  return out;
}

function checkMultiple(
  it: Item,
  optionSets: Map<string, OptionSet>,
  at: (...p: Array<string | number>) => string,
  add: (severity: "error" | "warning", code: string, message: string, path: string) => void,
): void {
  const r = it.response;
  const os = r.optionSetRef ? optionSets.get(r.optionSetRef) : undefined;
  if (!os) return; // reported as MISSING_OPTION_SET

  const n = os.options.length;
  const codes = new Set(os.options.map((o) => o.code));
  const exclusive = r.exclusiveCodes ?? [];
  const min = r.minSelections ?? 0;
  const max = r.maxSelections ?? n; // missing maximum = number of all options (B12)

  if (r.minSelections !== undefined && r.maxSelections !== undefined && r.minSelections > r.maxSelections) {
    add("error", "RANGE_INVALID", `minSelections (${r.minSelections}) is greater than maxSelections (${r.maxSelections}).`, at());
    return;
  }
  if (r.maxSelections !== undefined && r.maxSelections > n) {
    add("warning", "SELECTION_LIMIT_EXCEEDS_OPTIONS", `maxSelections (${r.maxSelections}) exceeds the ${n} available options.`, at("maxSelections"));
  }
  exclusive.forEach((code, j) => {
    if (!codes.has(code)) {
      add("error", "EXCLUSIVE_CODE_UNKNOWN", `exclusiveCodes entry "${code}" is not a code of option set "${os.id}".`, at("exclusiveCodes", j));
    }
  });
  if (exclusive.length > 0 && min >= 2) {
    add("error", "EXCLUSIVE_CODE_UNSELECTABLE", `Exclusive codes can only be chosen alone, but minSelections is ${min}. The exclusive options could never be selected.`, at("exclusiveCodes"));
  }

  // Is any non-empty answer possible at all? (B12: "irgendeine zulaessige Antwort existiert")
  const lo = Math.max(1, min);
  const nonExclusive = os.options.filter((o) => !exclusive.includes(o.code)).length;
  const aloneOk = exclusive.some((c) => codes.has(c)) && lo <= 1 && max >= 1;
  const comboOk = nonExclusive >= lo && lo <= Math.min(max, nonExclusive);
  if (!aloneOk && !comboOk) {
    if (it.answerRequired) {
      add("error", "ANSWER_UNSATISFIABLE", `No valid non-empty answer exists (min ${min}, max ${max}, ${n} options, ${exclusive.length} exclusive) but an answer is required.`, at());
    } else {
      add("warning", "ANSWER_UNSATISFIABLE", `No valid non-empty answer exists (min ${min}, max ${max}, ${n} options, ${exclusive.length} exclusive). Only skipping the question is possible.`, at());
    }
  }
}
