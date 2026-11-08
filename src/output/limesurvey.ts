import { Diagnostic, diag, hasErrors } from "../core/diagnostics";
import { exactText } from "../core/localized";
import type { Catalog, Condition, ConditionOrGroup, Item, LocalizedText, Option, Response } from "../core/types";
import { evaluateAction } from "../model/rights";
import { checkSelection, orderedSelection, Selection } from "../model/selection";
import { hasUnexportableChars } from "./adapterBase";
import { AdapterResult, MappingCollector } from "./mapping";

/**
 * LimeSurvey adapter: tab-separated survey structure (.txt, spec C09/M5).
 *
 * Source of the format: https://www.limesurvey.org/manual/Tab_Separated_Value_survey_structure
 * (read on 2026-11-07). The page names 14 fixed columns, the classes S, SL, G, Q, SQ, A and
 * says that "the remaining columns are an alphabetical list of the database field names for
 * the advanced question codes". It gives no example rows and says nothing about escaping,
 * BOM on import, line endings, type letters or length limits. Everything beyond the page is
 * listed in ASSUMPTIONS and is NOT verified against a LimeSurvey instance.
 *
 * Design rules:
 *  - Nothing is guessed or repaired silently. A name or code the target cannot take is an error
 *    (use Item.exportHints.limesurvey.variableName), never a silent rewrite.
 *  - One language per file (the project language). Text missing in that language is an error.
 *  - No cell ever contains a tab, newline or double quote, so no quoting rules are needed
 *    (relevance equations quote with single quotes):
 *    markup characters become HTML entities (LimeSurvey renders question text as HTML) and
 *    line breaks become <br />.
 *  - A condition the target cannot express is an error, never dropped (dropping would show
 *    the question to everybody).
 */

const BOM = "﻿";
const FIXED = ["id", "related_id", "class", "type/scale", "name", "relevance", "text", "help", "language", "validation", "mandatory", "other", "default", "same_default"] as const;

export const LIMESURVEY_ASSUMPTIONS: readonly string[] = [
  "Question type letters (L, M, N, S, T, D, K, R, X) come from general knowledge of LimeSurvey, not from the TSV manual page.",
  "Advanced question attributes are written as extra columns named after the attribute (min_answers, max_answers, exclude_all_others, num_value_int_only, min_num_value_n, max_num_value_n, slider_layout, slider_min, slider_max, slider_accuracy, random_order); the names were not verified.",
  "Question codes are required to be alphanumeric, start with a letter and have at most 20 characters; answer and subquestion codes alphanumeric with at most 5 characters. The page states no limits; these are cautious values from secondary sources.",
  "The file is written as UTF-8 with a byte order mark and LF line endings, as the manual describes for exports; whether import needs it is not stated.",
  "Expression Manager syntax for relevance (Code.NAOK, Code_sub.NAOK, ==, !=, &&, ||) comes from general knowledge, not from the TSV page.",
  "Text is HTML-escaped and braces become numeric entities so that Expression Manager does not evaluate them; not verified on an instance.",
];

/** The code written to LimeSurvey: the platform hint if the catalog gives one, otherwise the catalog code unchanged. */
const lsCode = (o: Option): string => o.exportHints?.limesurvey?.code ?? o.code;

const ID_RE = /^[A-Za-z][A-Za-z0-9]{0,19}$/;
const OPTION_RE = /^[A-Za-z0-9]{1,5}$/;

export interface LimeSurveyOptions {
  language: string;
  /** "native" needs a released catalog and confirmed rights; "test" is the labelled development export. */
  mode: "native" | "test";
}

interface Row {
  cells: Record<string, string>;
}

const UI = {
  de: { intro: "Einleitung", testTitle: "[TEST – nicht für die Durchführung]", draftTitle: "[ENTWURF]" },
  en: { intro: "Introduction", testTitle: "[TEST – not for productive use]", draftTitle: "[DRAFT]" },
} as const;

/** Make catalog text safe and tab-free for a LimeSurvey cell. */
export function lsText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\{/g, "&#123;")
    .replace(/\}/g, "&#125;")
    .replace(/\t/g, " ")
    .replace(/\r\n?|\n/g, "<br />");
}

export function buildLimeSurvey(c: Catalog, selection: Selection, options: LimeSurveyOptions): AdapterResult {
  const lang = options.language;
  const test = options.mode === "test";
  const ui = lang.toLowerCase().startsWith("de") ? UI.de : UI.en;
  const decision = evaluateAction(c, test ? "devTestExport" : "nativeExport", { selection });
  const ds: Diagnostic[] = [...decision.diagnostics.filter((d) => d.severity !== "info" || d.code === "TEST_ARTIFACT" || d.code === "DRAFT_WATERMARK_REQUIRED")];
  const mapping = new MappingCollector();
  const fileName = `${c.catalog.id}_${c.catalog.version}_limesurvey${test ? "_TEST" : ""}.txt`;
  const result = (ok: boolean, content?: string): AdapterResult => ({
    platform: "limesurvey",
    ok,
    ...(content !== undefined && ok ? { content } : {}),
    fileName,
    mimeType: "text/plain;charset=utf-8",
    diagnostics: ds,
    mapping: mapping.entries(),
    assumptions: [...LIMESURVEY_ASSUMPTIONS],
    decision,
    testArtifact: test,
  });
  const err = (code: string, message: string, extra: Partial<Diagnostic> = {}): void => {
    ds.push(diag("export", "error", code, message, { targetPlatform: "limesurvey", ...extra }));
  };

  if (!decision.allowed) return result(false);
  const selectionErrors = checkSelection(c, selection, "project").filter((d) => d.severity === "error");
  if (selectionErrors.length > 0) {
    ds.push(...selectionErrors);
    err("EXPORT_SELECTION_INVALID", "The selection has unresolved conflicts; an export is only possible for a valid questionnaire.");
    return result(false);
  }
  if (!c.languages.includes(lang)) {
    err("EXPORT_LANGUAGE_UNKNOWN", `The language "${lang}" is not a language of the catalog.`);
    return result(false);
  }

  const items = new Map(c.items.map((i) => [i.id, i]));
  const optionSets = new Map(c.optionSets.map((o) => [o.id, o]));
  const selected = new Set(orderedSelection(c, selection));

  // ---- question codes ------------------------------------------------------------------------
  const codeOf = new Map<string, string>();
  const used = new Map<string, string>();
  for (const id of selected) {
    const item = items.get(id) as Item;
    const hint = item.exportHints?.limesurvey?.variableName;
    const code = hint ?? item.variableName;
    if (!ID_RE.test(code)) {
      err("EXPORT_VARIABLE_NAME_INVALID", `Item "${id}": "${code}" is not a valid LimeSurvey question code (letters and digits only, starting with a letter, at most 20 characters).`, {
        itemRef: id,
        remediation: 'Set exportHints.limesurvey.variableName in the catalog, for example "demo01" instead of "demo_01".',
      });
      continue;
    }
    const clash = used.get(code.toLowerCase());
    if (clash) {
      err("EXPORT_VARIABLE_NAME_DUPLICATE", `Items "${clash}" and "${id}" would both get the LimeSurvey question code "${code}".`, { itemRef: id });
      continue;
    }
    used.set(code.toLowerCase(), id);
    codeOf.set(id, code);
    if (hint) mapping.add("variableName", "exact", "Question code taken from exportHints.limesurvey.variableName.", id);
  }

  // ---- text helpers ---------------------------------------------------------------------------
  const need = (lt: LocalizedText | undefined, what: string, itemRef?: string): string => {
    const t = exactText(lt, lang);
    if (t === undefined) {
      err("EXPORT_TEXT_MISSING", `${what} has no text in "${lang}". An export is never filled with another language.`, itemRef ? { itemRef } : {});
      return "";
    }
    if (hasUnexportableChars(t)) {
      err("EXPORT_TEXT_CHARACTER_INVALID", `${what} contains a control character (for example NUL) or a lone surrogate, which no target format carries faithfully.`, itemRef ? { itemRef } : {});
      return "";
    }
    return lsText(t);
  };
  const optional = (lt: LocalizedText | undefined, what: string, itemRef?: string): string | undefined => (lt === undefined ? undefined : need(lt, what, itemRef));

  // ---- rows -----------------------------------------------------------------------------------
  const rows: Row[] = [];
  const attrNames = new Set<string>();
  const push = (cls: string, f: Partial<Record<(typeof FIXED)[number], string>> & { attrs?: Record<string, string> }): void => {
    const cells: Record<string, string> = { class: cls };
    for (const k of FIXED) if (f[k] !== undefined) cells[k] = f[k] as string;
    for (const [k, v] of Object.entries(f.attrs ?? {})) {
      attrNames.add(k);
      cells[k] = v;
    }
    rows.push({ cells });
  };

  const q = c.questionnaire;
  const titleBase = need(c.catalog.title, "The catalog title");
  const title = test ? `${ui.testTitle} ${titleBase}` : c.catalog.status === "draft" ? `${ui.draftTitle} ${titleBase}` : titleBase;
  push("S", { name: "language", text: lang });
  push("S", { name: "format", text: "G" });
  mapping.add("survey.format", "transformed", "Each questionnaire section becomes one LimeSurvey question group, shown as one page (format G = group by group).");
  push("SL", { name: "surveyls_title", text: title, language: lang });
  const intro = optional(q.introduction, "The introduction");
  if (intro) push("SL", { name: "surveyls_welcometext", text: intro, language: lang });
  const endParts = [optional(q.closingText, "The closing text"), optional(q.helpResources, "The help resources text")].filter((x): x is string => !!x);
  if (endParts.length > 0) {
    push("SL", { name: "surveyls_endtext", text: endParts.join("<br /><br />"), language: lang });
    if (q.helpResources) mapping.add("helpResources", "transformed", "Help resources are appended to the end text of the survey.");
  }

  let qid = 0;
  let gid = 0;
  const nextId = (): number => ++qid;

  // Consent and privacy notice come first as plain text blocks.
  const infoBlocks: Array<[string, LocalizedText | undefined, string]> = [
    ["consentinfo", q.consent?.text, "The consent text"],
    ["consentparents", q.consent?.parentalConsentText, "The parental consent text"],
    ["privacyinfo", q.privacyNotice, "The privacy notice"],
  ];
  const present = infoBlocks.filter(([, lt]) => lt !== undefined);
  if (present.length > 0) {
    gid++;
    push("G", { id: String(gid), name: ui.intro, language: lang });
    for (const [name, lt, what] of present) {
      push("Q", { id: String(nextId()), "type/scale": "X", name, text: need(lt, what), language: lang, mandatory: "N" });
    }
    if (q.consent) mapping.add("consent", "manual", "The consent text is shown as a text block. A consent checkbox, its mandatory answer and the stop on refusal must be set up manually in LimeSurvey.");
    mapping.add("privacyNotice", "transformed", "The privacy notice is shown as a text block in the first group, not in LimeSurvey's own data-policy settings.");
  }
  if ((q.hiddenFields ?? []).length > 0) {
    for (const h of q.hiddenFields ?? []) mapping.add("hiddenFields", "manual", `Hidden field "${h.variableName}" (${h.source}) is not written; set up URL parameters or panel data in LimeSurvey.`);
  }

  const relevanceOf = (item: Item): string | undefined => {
    if (!item.visibleWhen) return undefined;
    const expr = expression(item.visibleWhen, item);
    if (expr !== undefined) mapping.add("visibleWhen", "transformed", "Visibility conditions are written as Expression Manager equations.", item.id);
    return expr;
  };

  function targetName(cond: Condition, owner: Item): string | undefined {
    const target = items.get(cond.itemRef);
    const code = codeOf.get(cond.itemRef);
    if (!target || !selected.has(cond.itemRef)) {
      err("EXPORT_CONDITION_TARGET_MISSING", `Item "${owner.id}" depends on "${cond.itemRef}", which is not in the questionnaire.`, { itemRef: owner.id });
      return undefined;
    }
    if (!code) return undefined; // already reported
    return code;
  }

  function expression(vw: ConditionOrGroup, owner: Item): string | undefined {
    if ("itemRef" in vw) return single(vw, owner);
    const list = vw.all ?? vw.any ?? [];
    const parts = list.map((x) => single(x, owner));
    if (parts.some((p) => p === undefined)) return undefined;
    return "(" + parts.join(vw.all ? " && " : " || ") + ")";
  }

  function single(cond: Condition, owner: Item): string | undefined {
    const code = targetName(cond, owner);
    if (code === undefined) return undefined;
    const target = items.get(cond.itemRef) as Item;
    const kind = target.response.kind;
    const unsupported = (why: string): undefined => {
      err("EXPORT_CONDITION_UNSUPPORTED", `Item "${owner.id}": the condition on "${cond.itemRef}" (${cond.operator}) cannot be expressed for LimeSurvey: ${why}.`, { itemRef: owner.id });
      return undefined;
    };
    const targetOptions = optionSets.get(target.response.optionSetRef ?? "")?.options ?? [];
    const exportValue = (v: string): string | undefined => {
      const o = targetOptions.find((x) => x.code === v);
      return o ? lsCode(o) : undefined;
    };
    if (kind === "multipleChoice") {
      if (cond.operator !== "contains" && cond.operator !== "notContains") return unsupported("only contains/notContains work on multiple choice");
      const ev = exportValue(cond.value);
      if (ev === undefined || !OPTION_RE.test(ev)) return unsupported(`the option "${cond.value}" has no valid LimeSurvey code`);
      return `(${code}_${ev}.NAOK ${cond.operator === "contains" ? "==" : "!="} 'Y')`;
    }
    if (kind === "ranking" || kind === "note") return unsupported(`${kind} items cannot be the subject of a condition`);
    const ref = kind === "slider" ? `${code}_S1.NAOK` : `${code}.NAOK`;
    const numeric = ["integer", "decimal", "slider"].includes(kind);
    const map: Record<string, string> = { equals: "==", notEquals: "!=", greaterThan: ">", greaterThanOrEqual: ">=", lessThan: "<", lessThanOrEqual: "<=" };
    const op = map[cond.operator];
    if (!op) return unsupported("operator not available for this answer type");
    if (op !== "==" && op !== "!=" && !numeric) return unsupported("comparison with < or > needs a numeric answer type");
    if (numeric) {
      if (!Number.isFinite(Number(cond.value)) || cond.value.trim() === "") return unsupported(`"${cond.value}" is not a number`);
      return `(${ref} ${op} ${Number(cond.value)})`;
    }
    const value = kind === "singleChoice" ? exportValue(cond.value) : cond.value;
    if (value === undefined) return unsupported(`the option "${cond.value}" does not exist`);
    if (/['"\\{}\r\n\t]/.test(value)) return unsupported("the value contains characters that cannot be quoted safely");
    return `(${ref} ${op} '${value}')`;
  }

  /** Valid LimeSurvey codes for an option list, or undefined after reporting why not. */
  function optionCodes(item: Item, os: Option[]): Map<string, string> | undefined {
    const out = new Map<string, string>();
    const seen = new Map<string, string>();
    let bad = false;
    for (const o of os) {
      const code = lsCode(o);
      if (!OPTION_RE.test(code)) {
        err("EXPORT_OPTION_CODE_INVALID", `Item "${item.id}": the answer code "${code}" is not valid for LimeSurvey (letters and digits only, at most 5 characters).`, {
          itemRef: item.id,
          remediation: `Set exportHints.limesurvey.code on the option "${o.code}" of its option set, for example a short code of at most 5 characters.`,
        });
        bad = true;
        continue;
      }
      const clash = seen.get(code.toLowerCase());
      if (clash !== undefined) {
        err("EXPORT_OPTION_CODE_DUPLICATE", `Item "${item.id}": the options "${clash}" and "${o.code}" would both get the LimeSurvey code "${code}".`, { itemRef: item.id });
        bad = true;
        continue;
      }
      seen.set(code.toLowerCase(), o.code);
      out.set(o.code, code);
      if (o.exportHints?.limesurvey?.code) mapping.add("option.code", "exact", "Answer code taken from the option's exportHints.limesurvey.code.", item.id);
    }
    return bad ? undefined : out;
  }

  function answerRows(item: Item, os: Option[], scale = "0"): void {
    const codes = optionCodes(item, os);
    if (!codes) return;
    for (const o of os) {
      push("A", { id: String(qid), "type/scale": scale, name: codes.get(o.code) as string, relevance: "", text: need(o.label, `Answer "${o.code}" of "${item.id}"`, item.id), language: lang });
      if (o.role === "missing") mapping.add("option.missing", "transformed", "Missing-value options (don't know, refused) become ordinary answers; LimeSurvey has no separate missing codes here.", item.id);
    }
  }

  function writeItem(item: Item): void {
    const code = codeOf.get(item.id);
    if (!code) return;
    const r: Response = item.response;
    const id = nextId();
    const base = { id: String(id), name: code, relevance: relevanceOf(item) ?? "", language: lang, other: "N" } as const;
    const text = need(item.text, `Item "${item.id}"`, item.id);
    const mandatory = item.answerRequired && r.kind !== "note" ? "Y" : "N";
    if (item.answerRequired && item.requiredMessage) mapping.add("requiredMessage", "manual", "A custom required-answer message cannot be written to the file.", item.id);
    if (item.instruction) mapping.add("item.instruction", "transformed", "The item instruction is placed in the help column.", item.id);
    const help = item.instruction ? need(item.instruction, `The instruction of "${item.id}"`, item.id) : "";
    if (item.respondentHelp) mapping.add("item.respondentHelp", "manual", "Help text for participants is not written; the help column carries the instruction only.", item.id);
    if (item.sensitivity) mapping.add("sensitivity", "manual", "The warning and help-resource text of sensitive items is not placed before the question; add it manually.", item.id);
    if (item.sensitivity?.excludeFromExportByDefault) ds.push(diag("export", "info", "EXPORT_SENSITIVE_INCLUDED", `Item "${item.id}" is sensitive and excluded from exports by default; it is included because it was selected explicitly.`, { itemRef: item.id, targetPlatform: "limesurvey" }));
    const attrs: Record<string, string> = {};
    if (item.presentation?.optionOrder === "random") {
      attrs.random_order = "1";
      mapping.add("randomization", "transformed", "Random answer order is written as the attribute random_order.", item.id);
    }
    const q0 = (type: string, extra: Record<string, string> = {}): void =>
      push("Q", { ...base, "type/scale": type, text, help, mandatory, attrs: { ...attrs, ...extra } });

    switch (r.kind) {
      case "note": {
        push("Q", { ...base, "type/scale": "X", text, help: "", mandatory: "N" });
        mapping.add("response.note", "transformed", `Text block as a "text display" question; the style (${r.style ?? "text"}) is lost, there is no title or notice styling.`, item.id);
        return;
      }
      case "singleChoice": {
        q0("L");
        answerRows(item, optionSets.get(r.optionSetRef ?? "")?.options ?? []);
        mapping.add("response.singleChoice", "exact", "Single choice as list (radio).", item.id);
        return;
      }
      case "multipleChoice": {
        const extra: Record<string, string> = {};
        if (r.minSelections !== undefined) extra.min_answers = String(r.minSelections);
        if (r.maxSelections !== undefined) extra.max_answers = String(r.maxSelections);
        if (r.exclusiveCodes?.length) {
          if (r.exclusiveCodes.length > 1) err("EXPORT_EXCLUSIVE_UNSUPPORTED", `Item "${item.id}" has several exclusive options; LimeSurvey supports one.`, { itemRef: item.id });
        }
        const mOptions = optionSets.get(r.optionSetRef ?? "")?.options ?? [];
        const mCodes = optionCodes(item, mOptions);
        if (r.exclusiveCodes?.length === 1 && mCodes) extra.exclude_all_others = mCodes.get(r.exclusiveCodes[0] as string) ?? (r.exclusiveCodes[0] as string);
        q0("M", extra);
        if (mCodes) {
          for (const o of mOptions) {
            push("SQ", { id: String(nextId()), "type/scale": "0", name: mCodes.get(o.code) as string, text: need(o.label, `Option "${o.code}" of "${item.id}"`, item.id), language: lang });
          }
        }
        mapping.add("response.multipleChoice", "exact", "Multiple choice with one subquestion per option.", item.id);
        if (r.minSelections !== undefined || r.maxSelections !== undefined) mapping.add("response.selectionLimits", "transformed", "Selection limits are written as min_answers/max_answers.", item.id);
        return;
      }
      case "integer":
      case "decimal": {
        const extra: Record<string, string> = {};
        if (r.kind === "integer") extra.num_value_int_only = "1";
        if (r.minimum !== undefined) extra.min_num_value_n = String(r.minimum);
        if (r.maximum !== undefined) extra.max_num_value_n = String(r.maximum);
        if (r.kind === "decimal" && r.maxDecimalPlaces !== undefined) mapping.add("response.decimalPlaces", "manual", "The maximum number of decimal places cannot be written; set it in LimeSurvey if needed.", item.id);
        if (r.unit) mapping.add("response.unit", "manual", "The unit is not written; add it to the question text if it is not there.", item.id);
        q0("N", extra);
        mapping.add(`response.${r.kind}`, "exact", "Numerical input with limits as attributes.", item.id);
        return;
      }
      case "shortText":
      case "longText": {
        if (r.format) mapping.add("response.format", "manual", `The format "${r.format}" (e-mail, link, phone) is not validated; set a validation in LimeSurvey.`, item.id);
        if (r.minLength !== undefined) mapping.add("response.minLength", "unsupported", "A minimum text length cannot be set.", item.id);
        if (r.maxLength !== undefined) mapping.add("response.maxLength", "manual", "The maximum text length is not written; set it in LimeSurvey.", item.id);
        q0(r.kind === "shortText" ? "S" : "T");
        mapping.add(`response.${r.kind}`, "exact", r.kind === "shortText" ? "Short free text." : "Long free text.", item.id);
        return;
      }
      case "date": {
        if (r.minimum !== undefined || r.maximum !== undefined) mapping.add("response.dateLimits", "manual", "Date limits are not written; set them in LimeSurvey.", item.id);
        q0("D");
        mapping.add("response.date", "exact", "Date input.", item.id);
        return;
      }
      case "slider": {
        const extra: Record<string, string> = { slider_layout: "1" };
        if (r.minimum !== undefined) extra.slider_min = String(r.minimum);
        if (r.maximum !== undefined) extra.slider_max = String(r.maximum);
        if (r.step !== undefined) extra.slider_accuracy = String(r.step);
        if (r.labels) mapping.add("response.sliderLabels", "manual", "The labels of the slider ends are not written; set them in LimeSurvey or put them in the question text.", item.id);
        q0("K", extra);
        push("SQ", { id: String(nextId()), "type/scale": "0", name: "S1", text, language: lang });
        mapping.add("response.slider", "transformed", "Slider as a multiple-numerical-input question with one subquestion and the slider layout; unverified on an instance.", item.id);
        return;
      }
      case "ranking": {
        const extra: Record<string, string> = {};
        if (r.maxRanks !== undefined) extra.max_answers = String(r.maxRanks);
        q0("R", extra);
        answerRows(item, optionSets.get(r.optionSetRef ?? "")?.options ?? []);
        mapping.add("response.ranking", "exact", "Ranking question.", item.id);
        return;
      }
    }
  }

  for (const section of q.sections) {
    const inSel = section.itemRefs.filter((x) => selected.has(x));
    if (inSel.length === 0) continue; // empty sections disappear together with their instruction
    gid++;
    push("G", { id: String(gid), name: need(section.title, `The title of section "${section.id}"`), text: optional(section.instruction, `The instruction of section "${section.id}"`) ?? "", language: lang });
    if (section.layout === "matrix" || section.layout === "table") mapping.add("section.layout", "transformed", `The ${section.layout} layout is not written; every item becomes its own question.`);
    for (const id of inSel) writeItem(items.get(id) as Item);
  }

  if (hasErrors(ds)) return result(false);

  const attrs = [...attrNames].sort();
  const header = [...FIXED, ...attrs];
  const lines = [header.join("\t")];
  for (const row of rows) lines.push(header.map((h) => row.cells[h] ?? "").join("\t"));
  return result(true, BOM + lines.join("\n") + "\n");
}
