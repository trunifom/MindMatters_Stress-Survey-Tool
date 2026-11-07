import { hasErrors } from "../core/diagnostics";
import type { Item } from "../core/types";
import { AdapterOptions, openAdapter } from "./adapterBase";
import type { AdapterResult } from "./mapping";
import { describeCondition, limitsText, optionPairs } from "./plain";

/**
 * Platform-neutral questionnaire table (CSV): one row per selected item with variable, type, wording, answers,
 * limits, required flag and condition. For people who build the questionnaire by hand, who paste into a
 * survey tool, or who want to review the selection in a spreadsheet. It is not an import file for any system.
 *
 * Format: RFC 4180 style (comma, every cell quoted, quotes doubled), UTF-8 with byte order mark so that
 * spreadsheet programs read umlauts correctly. Cells that start with = + - @ or a tab get a leading apostrophe:
 * the standard guard against spreadsheet formula injection.
 */

const ASSUMPTIONS = [
  "This is a table for people, not an import file for a target system.",
  "The leading apostrophe on cells starting with = + - @ is the usual guard against formula injection; it changes the cell text by one character.",
];

const HEADER = ["order", "section", "id", "variable", "type", "text", "instruction", "required", "condition", "options (code = label)", "limits", "mandatory_in_catalog", "source_refs"];

export function guardCell(s: string): string {
  return /^[=+\-@\t\r]/.test(s) ? "'" + s : s;
}
const cell = (s: string): string => '"' + guardCell(s).replace(/"/g, '""') + '"';

export function buildNeutralCsv(c: Parameters<typeof openAdapter>[0], selection: Parameters<typeof openAdapter>[1], options: AdapterOptions): AdapterResult {
  const ctx = openAdapter(c, selection, options, { platform: "csv", ext: "csv", mime: "text/csv;charset=utf-8", assumptions: ASSUMPTIONS, suffix: "_table" });
  if (ctx.early) return ctx.early;
  const rows: string[][] = [];
  let n = 0;
  for (const section of c.questionnaire.sections) {
    const ids = section.itemRefs.filter((x) => ctx.selected.has(x));
    if (ids.length === 0) continue;
    const sTitle = ctx.need(section.title, `The title of section "${section.id}"`);
    for (const id of ids) {
      const item = ctx.items.get(id) as Item;
      const r = item.response;
      n++;
      rows.push([
        String(n),
        sTitle,
        item.id,
        item.variableName,
        r.kind + (r.style ? `:${r.style}` : ""),
        ctx.need(item.text, `Item "${id}"`, id),
        item.instruction ? ctx.need(item.instruction, `The instruction of "${id}"`, id) : "",
        r.kind === "note" ? "" : item.answerRequired ? "yes" : "no",
        item.visibleWhen ? describeCondition(ctx, item.visibleWhen) : "",
        optionPairs(ctx, item).map((p) => `${p.code} = ${p.label}${p.missing ? " (missing)" : ""}`).join(" | "),
        limitsText(r),
        item.inclusionRequired ? "yes" : "no",
        (item.sourceLinks ?? []).map((s) => s.sourceRef).join(" | "),
      ]);
    }
  }
  ctx.mapping.add("table", "exact", "One row per selected item with all documented fields; not an import file.");
  ctx.mapping.add("languages", "unsupported", "One language per table.");
  if (hasErrors(ctx.diagnostics)) return ctx.result(false);
  const lines = [HEADER.map(cell).join(","), ...rows.map((r) => r.map(cell).join(","))];
  return ctx.result(true, "﻿" + lines.join("\n") + "\n");
}
