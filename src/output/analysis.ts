import { hasErrors } from "../core/diagnostics";
import type { Catalog } from "../core/types";
import { AdapterContext, AdapterOptions, openAdapter } from "./adapterBase";
import { buildDocModel, cleanControl, DocItem, DocModel } from "./document";
import type { AdapterResult } from "./mapping";

/**
 * Analysis scripts: variable and value labels as SPSS syntax and as an R script, so that the data of the
 * finished survey can be labelled in one step instead of by hand.
 *
 * What these files assume, and say so inside the file: the data columns carry the catalog's variable names
 * (`variableName`). A survey tool may rename variables or split a multiple-choice question into one column per
 * option when it exports data. The R script only labels variables that exist in the data and warns about the
 * ones it cannot find, so a mismatch is visible and not silent. Questions without a fixed answer list (free
 * text) get no value labels, notes get no variable at all.
 */

const SPSS_NAME = /^[A-Za-z][A-Za-z0-9_.@#$]{0,63}$/;
const SPSS_RESERVED = new Set(["ALL", "AND", "BY", "EQ", "GE", "GT", "LE", "LT", "NE", "NOT", "OR", "TO", "WITH"]);
const isNumeric = (c: string): boolean => /^-?\d+(\.\d+)?$/.test(c);

/** Items that become a variable: everything but notes. */
const variables = (m: DocModel): DocItem[] => m.sections.flatMap((s) => s.items).filter((i) => i.kind !== "note");

const oneLine = (s: string): string => cleanControl(s).replace(/\s*\n\s*/g, " ").trim();

// --- SPSS ------------------------------------------------------------------

/** An SPSS string literal: single quotes, doubled inside; cut to `max` characters if given. */
const spssString = (s: string, max?: number): string => {
  const t = max && s.length > max ? s.slice(0, max - 1) + "…" : s;
  return `'${oneLine(t).replace(/'/g, "''")}'`;
};

const spssComment = (s: string): string => oneLine(s).replace(/\*\//g, "* /");

function spssLines(m: DocModel, ctx: AdapterContext): string[] {
  const out: string[] = [];
  out.push("* MindMatters: Variablen- und Wertelabels (SPSS-Syntax).");
  out.push(`* Fragebogen ${spssComment(m.title)} | Katalog ${ctx.c.catalog.id} ${ctx.c.catalog.version} | Sprache ${ctx.lang}.`);
  out.push("* Annahme: Die Spalten Ihrer Datendatei heissen wie die Variablen unten. Prüfen Sie das vor dem Ausführen.");
  out.push("* Fragen mit mehreren Antworten haben je nach Umfragetool eine Spalte pro Antwort. Sie erhalten hier nur das Label der Frage.");
  if (m.statusLabel) out.push(`* ${spssComment(m.statusLabel)}`);
  out.push("");
  const vars = variables(m);
  if (vars.length > 0) {
    out.push("VARIABLE LABELS");
    vars.forEach((v, i) => out.push(`  ${v.variable} ${spssString(`${v.number}. ${v.text}`, 256)}${i === vars.length - 1 ? "." : ""}`));
  }
  for (const v of vars) {
    if ((v.kind !== "singleChoice" && v.kind !== "ranking") || v.options.length === 0) continue;
    const numeric = v.options.every((o) => isNumeric(o.code));
    out.push("");
    out.push(`VALUE LABELS ${v.variable}`);
    v.options.forEach((o, i) => out.push(`  ${numeric ? o.code : spssString(o.code)} ${spssString(o.label, 120)}${i === v.options.length - 1 ? "." : ""}`));
    const miss = v.options.filter((o) => o.missing);
    if (miss.length > 0 && numeric && miss.length <= 3) out.push(`MISSING VALUES ${v.variable} (${miss.map((o) => o.code).join(", ")}).`);
  }
  out.push("");
  out.push("EXECUTE.");
  return out;
}

export function buildSpss(c: Catalog, selection: Parameters<typeof openAdapter>[1], options: AdapterOptions): AdapterResult {
  const ctx = openAdapter(c, selection, options, {
    platform: "spss",
    ext: "sps",
    mime: "text/plain;charset=utf-8",
    suffix: "_labels",
    assumptions: ["The data columns carry the catalog's variable names. A survey tool may rename them or split multiple-choice questions into one column per option.", "Not run in SPSS."],
  });
  if (ctx.early) return ctx.early;
  const m = buildDocModel(ctx);
  for (const v of variables(m)) {
    if (!SPSS_NAME.test(v.variable) || SPSS_RESERVED.has(v.variable.toUpperCase())) {
      ctx.err("EXPORT_VARIABLE_NAME_INVALID", `The variable name "${v.variable}" is not a valid SPSS variable name (letter first, then letters, digits, . _ @ # $, at most 64 characters, not a reserved word).`, { itemRef: v.id });
    }
  }
  ctx.mapping.add("labels", "exact", "Variable labels for every question and value labels for single-choice and ranking questions.");
  ctx.mapping.add("response.multipleChoice", "manual", "Multiple-choice questions get a variable label only; the columns depend on the survey tool.");
  ctx.mapping.add("languages", "unsupported", "One language per file.");
  if (hasErrors(ctx.diagnostics)) return ctx.result(false);
  return ctx.result(true, "﻿" + spssLines(m, ctx).join("\r\n") + "\r\n");
}

// --- R ---------------------------------------------------------------------

/** An R string literal: double quotes, backslash and quote escaped, line breaks as \n. UTF-8 stays as it is. */
const rString = (s: string): string => `"${cleanControl(s).replace(/\\/g, "\\\\").replace(/"/g, '\\"').replace(/\n/g, "\\n")}"`;

const R_FUNCTION = [
  "# Hängt die Labels an die Spalten (Attribut \"label\"), macht Einzelantworten zu Faktoren und setzt Codes für «keine Angabe» auf NA.",
  "apply_labels <- function(data, make_factors = TRUE) {",
  "  absent <- setdiff(names(variable_labels), names(data))",
  "  if (length(absent) > 0) warning(\"Spalten nicht gefunden: \", paste(absent, collapse = \", \"))",
  "  for (v in intersect(names(variable_labels), names(data))) {",
  "    attr(data[[v]], \"label\") <- variable_labels[[v]]",
  "    if (v %in% names(missing_codes)) data[[v]][as.character(data[[v]]) %in% missing_codes[[v]]] <- NA",
  "    if (make_factors && v %in% names(value_labels)) {",
  "      lv <- value_labels[[v]]",
  "      data[[v]] <- factor(as.character(data[[v]]), levels = unname(lv), labels = names(lv))",
  "    }",
  "  }",
  "  data",
  "}",
];

function rLines(m: DocModel, ctx: AdapterContext): string[] {
  const vars = variables(m);
  const out: string[] = [];
  out.push("# MindMatters: Variablen- und Wertelabels (R, nur Basis-R).");
  out.push(`# Fragebogen: ${oneLine(m.title)} | Katalog ${ctx.c.catalog.id} ${ctx.c.catalog.version} | Sprache ${ctx.lang}`);
  out.push("# Annahme: Die Spalten Ihrer Daten heissen wie die Variablen unten. Fehlende Spalten werden gemeldet, nicht übergangen.");
  out.push('# Datei in UTF-8 lesen: source("<datei>", encoding = "UTF-8")');
  if (m.statusLabel) out.push(`# ${oneLine(m.statusLabel)}`);
  out.push("");
  out.push("variable_labels <- c(");
  vars.forEach((v, i) => out.push(`  ${rString(v.variable)} = ${rString(`${v.number}. ${v.text}`)}${i === vars.length - 1 ? "" : ","}`));
  out.push(")");
  out.push("");
  out.push("value_labels <- list(");
  const choice = vars.filter((v) => (v.kind === "singleChoice" || v.kind === "ranking") && v.options.length > 0);
  choice.forEach((v, i) => {
    out.push(`  ${rString(v.variable)} = c(`);
    v.options.forEach((o, j) => out.push(`    ${rString(o.label)} = ${rString(o.code)}${j === v.options.length - 1 ? "" : ","}`));
    out.push(`  )${i === choice.length - 1 ? "" : ","}`);
  });
  out.push(")");
  const missing = vars.filter((v) => v.options.some((o) => o.missing));
  out.push("");
  out.push("missing_codes <- list(");
  missing.forEach((v, i) => out.push(`  ${rString(v.variable)} = c(${v.options.filter((o) => o.missing).map((o) => rString(o.code)).join(", ")})${i === missing.length - 1 ? "" : ","}`));
  out.push(")");
  out.push("");
  out.push(...R_FUNCTION);
  return out;
}

export function buildR(c: Catalog, selection: Parameters<typeof openAdapter>[1], options: AdapterOptions): AdapterResult {
  const ctx = openAdapter(c, selection, options, {
    platform: "r",
    ext: "R",
    mime: "text/plain;charset=utf-8",
    suffix: "_labels",
    assumptions: ["The data columns carry the catalog's variable names. A survey tool may rename them or split multiple-choice questions into one column per option.", "Not run in R. Uses base R only."],
  });
  if (ctx.early) return ctx.early;
  const m = buildDocModel(ctx);
  const seen = new Set<string>();
  for (const v of variables(m)) {
    if (seen.has(v.variable)) ctx.err("EXPORT_VARIABLE_NAME_DUPLICATE", `The variable name "${v.variable}" is used twice.`, { itemRef: v.id });
    seen.add(v.variable);
  }
  ctx.mapping.add("labels", "exact", 'Variable labels for every question, factor levels for single-choice and ranking questions, NA for "no answer" codes.');
  ctx.mapping.add("response.multipleChoice", "manual", "Multiple-choice questions get a variable label only; the columns depend on the survey tool.");
  ctx.mapping.add("languages", "unsupported", "One language per file.");
  if (hasErrors(ctx.diagnostics)) return ctx.result(false);
  return ctx.result(true, rLines(m, ctx).join("\n") + "\n");
}
