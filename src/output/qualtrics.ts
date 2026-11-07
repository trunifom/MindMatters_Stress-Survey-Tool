import { Diagnostic, diag, hasErrors } from "../core/diagnostics";
import { exactText } from "../core/localized";
import type { Catalog, Item, LocalizedText, Option } from "../core/types";
import { evaluateAction } from "../model/rights";
import { checkSelection, orderedSelection, Selection } from "../model/selection";
import { AdapterResult, MappingCollector } from "./mapping";

/**
 * Qualtrics adapter: TXT in the "Advanced Format" (spec C09, M6).
 *
 * Source: https://www.qualtrics.com/support/survey-platform/survey-module/survey-tools/import-and-export-surveys/
 * (read on 2026-11-07). The page documents the tags [[AdvancedFormat]], [[Block:name]], [[Question:type:subtype]]
 * with the types MC, Matrix, TE, CS, RO, DB, [[ID:...]], [[AdvancedChoices]] with [[Choice:recode]], [[ED:field:value]],
 * [[PageBreak]]. It states that the format cannot carry forced response, validation, display logic or skip logic,
 * has no slider and no date type, and that a UTF-16 file does not upload.
 *
 * Because the format cannot carry logic, this adapter follows ADR-007 strictly:
 *  - a condition (visibleWhen) is an error, never dropped (the follow-up question would show for everyone);
 *  - an item type the format lacks (slider) is an error, never replaced by something else;
 *  - requirements it cannot write (forced response, number or text validation, limits) are reported as manual.
 */

export const QUALTRICS_ASSUMPTIONS: readonly string[] = [
  "Recode values (the value in [[Choice:...]]) must be integers; the page does not say so, this comes from general knowledge of Qualtrics. Options with other codes need exportHints.qualtrics.code.",
  "The file is written as UTF-8 without byte order mark; the page only says that UTF-16 does not upload.",
  "The text entry subtypes SingleLine and Essay, the MC subtype SingleAnswer/MultipleAnswer and the tags [[Question:RO]] with [[AdvancedChoices]] are used as the page lists them; the combination RO with recodes is not shown in an example.",
  "Question text is written as HTML (entities for & < > \" and <br> for line breaks); the page confirms that HTML can be used for styling but not how plain text is treated.",
  "Export tags in [[ID:...]] are taken from the item variable name (letters, digits and underscore); Qualtrics rules for export tags are not stated on the page.",
  "The import adds the questions to an existing survey (TXT) instead of creating a new one, as the page says; blocks are created per section.",
];

export interface QualtricsOptions {
  language: string;
  mode: "native" | "test";
}

const UI = {
  de: { intro: "Einleitung", closing: "Schluss", testTitle: "[TEST – nicht für die Durchführung]", draftTitle: "[ENTWURF]" },
  en: { intro: "Introduction", closing: "Closing", testTitle: "[TEST – not for productive use]", draftTitle: "[DRAFT]" },
} as const;

const NAME_RE = /^[A-Za-z][A-Za-z0-9_]{0,99}$/;
const RECODE_RE = /^[0-9]{1,9}$/;
const qCode = (o: Option): string => o.exportHints?.qualtrics?.code ?? o.code;

/** Catalog text as one line of Qualtrics HTML text. */
export function qText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/\t/g, " ")
    .replace(/\r\n?|\n/g, "<br>");
}

export function buildQualtrics(c: Catalog, selection: Selection, options: QualtricsOptions): AdapterResult {
  const lang = options.language;
  const test = options.mode === "test";
  const ui = lang.toLowerCase().startsWith("de") ? UI.de : UI.en;
  const decision = evaluateAction(c, test ? "devTestExport" : "nativeExport", { selection });
  const ds: Diagnostic[] = [...decision.diagnostics.filter((d) => d.severity !== "info" || d.code === "TEST_ARTIFACT" || d.code === "DRAFT_WATERMARK_REQUIRED")];
  const mapping = new MappingCollector();
  const fileName = `${c.catalog.id}_${c.catalog.version}_qualtrics${test ? "_TEST" : ""}.txt`;
  const result = (ok: boolean, content?: string): AdapterResult => ({
    platform: "qualtrics",
    ok,
    ...(content !== undefined && ok ? { content } : {}),
    fileName,
    mimeType: "text/plain;charset=utf-8",
    diagnostics: ds,
    mapping: mapping.entries(),
    assumptions: [...QUALTRICS_ASSUMPTIONS],
    decision,
    testArtifact: test,
  });
  const err = (code: string, message: string, extra: Partial<Diagnostic> = {}): void => {
    ds.push(diag("export", "error", code, message, { targetPlatform: "qualtrics", ...extra }));
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
  const out: string[] = ["[[AdvancedFormat]]"];

  const need = (lt: LocalizedText | undefined, what: string, itemRef?: string): string => {
    const t = exactText(lt, lang);
    if (t === undefined) {
      err("EXPORT_TEXT_MISSING", `${what} has no text in "${lang}". An export is never filled with another language.`, itemRef ? { itemRef } : {});
      return "";
    }
    if (t.includes("[[") || t.includes("]]")) {
      err("EXPORT_TEXT_RESERVED", `${what} contains "[[" or "]]", which Qualtrics reads as a tag.`, itemRef ? { itemRef } : {});
      return "";
    }
    return qText(t);
  };

  const q = c.questionnaire;
  const titleBase = need(c.catalog.title, "The catalog title");
  const prefix = test ? ui.testTitle : c.catalog.status === "draft" ? ui.draftTitle : "";

  // embedded data from hidden fields
  for (const h of q.hiddenFields ?? []) {
    if (!NAME_RE.test(h.variableName) || /[\]\r\n:]/.test(h.constantValue ?? "")) {
      err("EXPORT_HIDDEN_FIELD_INVALID", `Hidden field "${h.id}" has a name or value Qualtrics embedded data cannot take.`);
      continue;
    }
    out.push(h.source === "constant" && h.constantValue !== undefined ? `[[ED:${h.variableName}:${h.constantValue}]]` : `[[ED:${h.variableName}]]`);
    mapping.add("hiddenFields", h.source === "constant" ? "exact" : "transformed", h.source === "constant" ? "Constant hidden field as embedded data." : "Hidden field from a URL parameter or panel is declared as embedded data; the value must be passed in the survey link.");
  }

  const dbQuestion = (id: string, text: string): void => {
    out.push("[[Question:DB]]", `[[ID:${id}]]`, text);
  };

  // introduction block
  const introParts: Array<[string, LocalizedText | undefined, string]> = [
    ["mm_intro", q.introduction, "The introduction"],
    ["mm_consent", q.consent?.text, "The consent text"],
    ["mm_consent_parents", q.consent?.parentalConsentText, "The parental consent text"],
    ["mm_privacy", q.privacyNotice, "The privacy notice"],
  ];
  const introPresent = introParts.filter(([, lt]) => lt !== undefined);
  if (introPresent.length > 0) {
    out.push(`[[Block:${prefix ? prefix + " " : ""}${titleBase || ui.intro}]]`);
    for (const [id, lt, what] of introPresent) dbQuestion(id, need(lt, what));
  }
  if (q.consent) mapping.add("consent", "manual", "The consent text is shown as a text block. A consent choice, its forced answer and the end of the survey on refusal must be set up manually in Qualtrics.");
  if (q.introduction || q.privacyNotice) mapping.add("introduction", "transformed", "Introduction and privacy notice are text blocks in the first block.");
  mapping.add("survey.title", "transformed", "The first block carries the survey title as its name; the survey name itself is set when the survey is created in Qualtrics.");

  const seenNames = new Map<string, string>();
  function writeItem(item: Item): void {
    const r = item.response;
    const name = item.exportHints?.qualtrics?.variableName ?? item.variableName;
    if (!NAME_RE.test(name)) {
      err("EXPORT_VARIABLE_NAME_INVALID", `Item "${item.id}": "${name}" is not a usable export tag.`, { itemRef: item.id, remediation: "Set exportHints.qualtrics.variableName in the catalog." });
      return;
    }
    const clash = seenNames.get(name.toLowerCase());
    if (clash) {
      err("EXPORT_VARIABLE_NAME_DUPLICATE", `Items "${clash}" and "${item.id}" would both get the export tag "${name}".`, { itemRef: item.id });
      return;
    }
    seenNames.set(name.toLowerCase(), item.id);
    if (item.visibleWhen) {
      err("EXPORT_CONDITION_UNSUPPORTED", `Item "${item.id}": Qualtrics TXT import cannot carry display logic. The question would be shown to everyone, so it is not exported.`, {
        itemRef: item.id,
        remediation: "Deselect the item or its trigger, or build the questionnaire in Qualtrics by hand.",
      });
      return;
    }
    const text = need(item.text, `Item "${item.id}"`, item.id);
    if (item.answerRequired && r.kind !== "note") {
      mapping.add("answerRequired", "manual", "Forced response cannot be written; set it in Qualtrics for the questions that must be answered.", item.id);
    }
    if (item.instruction) mapping.add("item.instruction", "manual", "Item instructions are not written; put them into the question text if needed.", item.id);
    if (item.respondentHelp) mapping.add("item.respondentHelp", "manual", "Help text for participants is not written.", item.id);
    if (item.sensitivity) mapping.add("sensitivity", "manual", "The warning and help-resource text of sensitive items is not placed before the question; add it manually.", item.id);
    if (item.presentation?.optionOrder === "random") mapping.add("randomization", "manual", "Random answer order is not written in the Advanced Format; set it in Qualtrics.", item.id);
    if (item.sensitivity?.excludeFromExportByDefault) ds.push(diag("export", "info", "EXPORT_SENSITIVE_INCLUDED", `Item "${item.id}" is sensitive and excluded from exports by default; it is included because it was selected explicitly.`, { itemRef: item.id, targetPlatform: "qualtrics" }));

    const choices = (kind: "MC" | "RO", sub: string): void => {
      const os = optionSets.get(r.optionSetRef ?? "")?.options ?? [];
      const codes = new Set<string>();
      let bad = false;
      for (const o of os) {
        const code = qCode(o);
        if (!RECODE_RE.test(code)) {
          err("EXPORT_OPTION_CODE_INVALID", `Item "${item.id}": the answer code "${code}" is not an integer recode value for Qualtrics.`, {
            itemRef: item.id,
            remediation: `Set exportHints.qualtrics.code (an integer) on the option "${o.code}" of its option set.`,
          });
          bad = true;
        } else if (codes.has(code)) {
          err("EXPORT_OPTION_CODE_DUPLICATE", `Item "${item.id}": two options would both get the recode value ${code}.`, { itemRef: item.id });
          bad = true;
        }
        codes.add(code);
        if (o.exportHints?.qualtrics?.code) mapping.add("option.code", "exact", "Recode value taken from the option's exportHints.qualtrics.code.", item.id);
        if (o.role === "missing") mapping.add("option.missing", "transformed", "Missing-value options (don't know, refused) become ordinary choices.", item.id);
      }
      if (bad) return;
      out.push(sub ? `[[Question:${kind}:${sub}]]` : `[[Question:${kind}]]`, `[[ID:${name}]]`, text, "[[AdvancedChoices]]");
      for (const o of os) out.push(`[[Choice:${qCode(o)}]]`, need(o.label, `Option "${o.code}" of "${item.id}"`, item.id));
    };

    switch (r.kind) {
      case "note":
        dbQuestion(name, text);
        mapping.add("response.note", "transformed", `Text block as a text/graphic question; the style (${r.style ?? "text"}) is lost.`, item.id);
        return;
      case "singleChoice":
        choices("MC", "SingleAnswer");
        mapping.add("response.singleChoice", "exact", "Single answer multiple choice.", item.id);
        return;
      case "multipleChoice":
        choices("MC", "MultipleAnswer");
        mapping.add("response.multipleChoice", "exact", "Multiple answer multiple choice.", item.id);
        if (r.minSelections !== undefined || r.maxSelections !== undefined) mapping.add("response.selectionLimits", "manual", "Minimum and maximum number of selections cannot be written.", item.id);
        if (r.exclusiveCodes?.length) mapping.add("response.exclusive", "manual", "The exclusive option (\"none of these\") cannot be written; set it in Qualtrics.", item.id);
        return;
      case "ranking":
        choices("RO", "");
        mapping.add("response.ranking", "transformed", "Rank order question with the choices; the maximum number of ranks cannot be written.", item.id);
        return;
      case "integer":
      case "decimal":
      case "shortText":
        out.push("[[Question:TE:SingleLine]]", `[[ID:${name}]]`, text);
        mapping.add(`response.${r.kind}`, r.kind === "shortText" ? "exact" : "transformed", r.kind === "shortText" ? "Single-line text entry." : "Numbers become a single-line text entry; limits and number validation cannot be written, set them in Qualtrics.", item.id);
        if (r.kind !== "shortText") mapping.add("response.numberValidation", "manual", "Number type and limits must be set as validation in Qualtrics.", item.id);
        if (r.kind === "shortText" && (r.format || r.maxLength !== undefined || r.minLength !== undefined)) mapping.add("response.textValidation", "manual", "Text format and length limits cannot be written.", item.id);
        return;
      case "longText":
        out.push("[[Question:TE:Essay]]", `[[ID:${name}]]`, text);
        mapping.add("response.longText", "exact", "Essay text entry.", item.id);
        return;
      case "date":
        out.push("[[Question:TE:SingleLine]]", `[[ID:${name}]]`, text);
        mapping.add("response.date", "transformed", "Dates become a single-line text entry; the format and date validation must be set in Qualtrics.", item.id);
        return;
      case "slider":
        err("EXPORT_RESPONSE_UNSUPPORTED", `Item "${item.id}": the Qualtrics TXT import has no slider question, so the item cannot be exported.`, {
          itemRef: item.id,
          remediation: "Deselect the item, or add the slider in Qualtrics by hand.",
        });
        return;
    }
  }

  const blockName = (lt: LocalizedText, id: string): string => need(lt, `The title of section "${id}"`).replace(/:/g, " ");
  for (const section of q.sections) {
    const inSel = section.itemRefs.filter((x) => selected.has(x));
    if (inSel.length === 0) continue;
    out.push(`[[Block:${blockName(section.title, section.id)}]]`);
    if (section.instruction) {
      out.push("[[Question:DB]]", `[[ID:mm_s_${section.id.replace(/[^A-Za-z0-9_]/g, "_")}]]`, need(section.instruction, `The instruction of section "${section.id}"`));
    }
    if (section.layout === "matrix" || section.layout === "table") mapping.add("section.layout", "transformed", `The ${section.layout} layout is not written; every item becomes its own question.`);
    for (const id of inSel) writeItem(items.get(id) as Item);
  }

  const endParts: Array<[string, LocalizedText | undefined, string]> = [
    ["mm_closing", q.closingText, "The closing text"],
    ["mm_help", q.helpResources, "The help resources text"],
  ];
  const endPresent = endParts.filter(([, lt]) => lt !== undefined);
  if (endPresent.length > 0) {
    out.push(`[[Block:${ui.closing}]]`);
    for (const [id, lt, what] of endPresent) dbQuestion(id, need(lt, what));
    mapping.add("closingText", "transformed", "Closing text and help resources are text blocks in a last block, not Qualtrics' end-of-survey message.");
  }
  mapping.add("languages", "unsupported", "One language per file; the Advanced Format has no multilingual import.");

  if (hasErrors(ds)) return result(false);
  return result(true, out.join("\n") + "\n");
}
