import { hasErrors } from "../core/diagnostics";
import type { Item, LocalizedText } from "../core/types";
import { AdapterOptions, openAdapter } from "./adapterBase";
import type { AdapterResult } from "./mapping";

/**
 * Google Forms adapter: Apps Script that builds the form (PROTOTYPE).
 *
 * Google Forms has no file import. The adapter writes a script (.gs) that the school pastes into
 * script.google.com and runs once; it creates the form in the school's own account. Nothing is sent
 * anywhere by this tool. The API names (FormApp, addMultipleChoiceItem, ...) come from general knowledge of
 * Apps Script and were NOT executed (see the assumptions).
 *
 * Safety: catalog text only ever appears inside JSON string literals (JSON.stringify, with U+2028/2029 escaped),
 * never as code. Items Google Forms cannot represent (ranking, branching conditions, sliders outside the
 * scale range) are errors, never dropped or replaced (ADR-007).
 */

export const GOOGLEFORMS_ASSUMPTIONS: readonly string[] = [
  "PROTOTYPE: the script was never run in Google Apps Script. Method names (FormApp.create, addMultipleChoiceItem, addCheckboxItem, addTextItem, addParagraphTextItem, addDateItem, addScaleItem, addSectionHeaderItem, addPageBreakItem, setValidation, setConfirmationMessage) come from general knowledge.",
  "Google Forms has no answer codes: the label is what gets stored. The catalog codes are lost in the responses and must be mapped back with the codebook.",
  "Scale items allow a lower bound of 0 or 1 and an upper bound of 2 to 10; sliders in other ranges are not exported.",
  "Number validation uses requireWholeNumber, requireNumber and requireNumberBetween; the exact behaviour of limits for integers was not checked.",
  "Branching ('go to page based on answer') is not generated; conditions are errors.",
  "The script creates a new form in the account that runs it and logs its edit and published URLs.",
];

/** A valid JavaScript string literal for any text (also safe inside a script that is pasted as is). */
export function jsStr(s: string): string {
  const bs = String.fromCharCode(92); // backslash
  return JSON.stringify(s).split(String.fromCharCode(0x2028)).join(bs + "u2028").split(String.fromCharCode(0x2029)).join(bs + "u2029");
}

/** A JavaScript array literal of strings, safe for any text. */
export function jsList(items: string[]): string {
  return "[" + items.map(jsStr).join(", ") + "]";
}

export function buildGoogleForms(c: Parameters<typeof openAdapter>[0], selection: Parameters<typeof openAdapter>[1], options: AdapterOptions): AdapterResult {
  const ctx = openAdapter(c, selection, options, { platform: "googleForms", ext: "gs", mime: "text/javascript;charset=utf-8", assumptions: GOOGLEFORMS_ASSUMPTIONS });
  if (ctx.early) return ctx.early;
  const { mapping, err } = ctx;
  const q = c.questionnaire;
  const out: string[] = [];
  const text = (lt: LocalizedText | undefined, what: string, itemRef?: string): string => ctx.need(lt, what, itemRef);

  const label = ctx.titleLabel();
  const title = text(c.catalog.title, "The catalog title");
  out.push("// MindMatters: Google Forms builder (PROTOTYPE, not run)", "// Paste into script.google.com, run createQuestionnaire() once, then read the log.", "function createQuestionnaire() {");
  out.push(`  var form = FormApp.create(${jsStr((label ? label + " " : "") + title)});`);
  if (q.introduction) out.push(`  form.setDescription(${jsStr(text(q.introduction, "The introduction"))});`);
  if (q.closingText || q.helpResources) {
    const parts = [q.closingText && text(q.closingText, "The closing text"), q.helpResources && text(q.helpResources, "The help resources text")].filter(Boolean) as string[];
    out.push(`  form.setConfirmationMessage(${jsStr(parts.join("\n\n"))});`);
  }
  for (const [name, lt, what] of [
    ["consent", q.consent?.text, "The consent text"],
    ["parental consent", q.consent?.parentalConsentText, "The parental consent text"],
    ["privacy", q.privacyNotice, "The privacy notice"],
  ] as Array<[string, LocalizedText | undefined, string]>) {
    if (lt) out.push(`  form.addSectionHeaderItem().setTitle(${jsStr(text(lt, what))}); // ${name}`);
  }
  if (q.consent) mapping.add("consent", "manual", "The consent text is a section header. A required consent question and the end of the form on refusal must be set up manually.");
  mapping.add("survey.settings", "manual", "Collecting e-mail addresses, one response per person, progress bar and publishing are form settings; set them in Google Forms.");
  mapping.add("languages", "unsupported", "One language per form.");
  mapping.add("prototype", "manual", "PROTOTYPE: run the script in a test account and check the form before use.");
  for (const h of q.hiddenFields ?? []) mapping.add("hiddenFields", "manual", `Hidden field "${h.variableName}" (${h.source}) is not written; Google Forms has pre-filled links instead.`);

  let first = true;
  for (const section of q.sections) {
    const ids = section.itemRefs.filter((x) => ctx.selected.has(x));
    if (ids.length === 0) continue;
    const sTitle = text(section.title, `The title of section "${section.id}"`);
    if (!first || section.pageBreakBefore) {
      out.push(`  form.addPageBreakItem().setTitle(${jsStr(sTitle)})${section.instruction ? `.setHelpText(${jsStr(text(section.instruction, `The instruction of section "${section.id}"`))})` : ""};`);
    } else {
      out.push(`  form.addSectionHeaderItem().setTitle(${jsStr(sTitle)})${section.instruction ? `.setHelpText(${jsStr(text(section.instruction, `The instruction of section "${section.id}"`))})` : ""};`);
    }
    first = false;
    if (section.layout === "matrix" || section.layout === "table") mapping.add("section.layout", "transformed", `The ${section.layout} layout is not written; every item becomes its own question.`);
    for (const id of ids) {
      const item = ctx.items.get(id) as Item;
      const r = item.response;
      const t = text(item.text, `Item "${id}"`, id);
      if (item.visibleWhen) {
        err("EXPORT_CONDITION_UNSUPPORTED", `Item "${id}": this adapter does not generate branching, the question would be shown to everyone, so it is not exported.`, {
          itemRef: id,
          remediation: "Deselect the item or its trigger, or build the branching in Google Forms by hand.",
        });
        continue;
      }
      const help = item.instruction ? `.setHelpText(${jsStr(text(item.instruction, `The instruction of "${id}"`, id))})` : "";
      if (item.instruction) mapping.add("item.instruction", "transformed", "The instruction is written as help text of the question.", id);
      const req = item.answerRequired && r.kind !== "note" ? ".setRequired(true)" : "";
      if (item.answerRequired && r.kind !== "note") mapping.add("answerRequired", "exact", "Required answer.", id);
      if (item.respondentHelp) mapping.add("item.respondentHelp", "manual", "Help text for participants is not written.", id);
      if (item.sensitivity) mapping.add("sensitivity", "manual", "The warning and help-resource text of sensitive items is not placed before the question; add it manually.", id);
      if (item.presentation?.optionOrder === "random") mapping.add("randomization", "manual", "Random answer order is a setting of the question; set it manually.", id);
      const labels = (): string[] | undefined => {
        const os = ctx.optionSets.get(r.optionSetRef ?? "")?.options ?? [];
        if (os.length === 0) {
          err("EXPORT_OPTION_CODE_INVALID", `Item "${id}" has no answer options; Google Forms throws on a choice question without choices.`, { itemRef: id });
          return undefined;
        }
        const ls = os.map((o) => ctx.need(o.label, `Option "${o.code}" of "${id}"`, id));
        if (new Set(ls).size !== ls.length || ls.some((x) => x === "")) {
          err("EXPORT_OPTION_CODE_DUPLICATE", `Item "${id}": Google Forms stores the label, so the option labels must be unique and not empty.`, { itemRef: id });
          return undefined;
        }
        if (os.some((o) => o.role === "missing")) mapping.add("option.missing", "transformed", "Missing-value options become ordinary choices.", id);
        mapping.add("option.codes", "unsupported", "Google Forms has no answer codes; the label is stored. Map the labels back with the codebook.", id);
        return ls;
      };
      switch (r.kind) {
        case "note":
          out.push(`  form.addSectionHeaderItem().setTitle(${jsStr(t)});`);
          mapping.add("response.note", "transformed", `Text block as a section header; the style (${r.style ?? "text"}) is lost.`, id);
          break;
        case "singleChoice": {
          const ls = labels();
          if (ls) out.push(`  form.addMultipleChoiceItem().setTitle(${jsStr(t)}).setChoiceValues(${jsList(ls)})${help}${req};`);
          mapping.add("response.singleChoice", "exact", "Multiple choice with one answer.", id);
          break;
        }
        case "multipleChoice": {
          const ls = labels();
          if (ls) out.push(`  form.addCheckboxItem().setTitle(${jsStr(t)}).setChoiceValues(${jsList(ls)})${help}${req};`);
          mapping.add("response.multipleChoice", "exact", "Checkboxes.", id);
          if (r.minSelections !== undefined || r.maxSelections !== undefined) mapping.add("response.selectionLimits", "manual", "Minimum and maximum number of selections are not written.", id);
          if (r.exclusiveCodes?.length) mapping.add("response.exclusive", "manual", "The exclusive option cannot be written.", id);
          break;
        }
        case "integer":
        case "decimal": {
          const lo = r.minimum;
          const hi = r.maximum;
          const hasLimits = typeof lo === "number" && typeof hi === "number";
          const v = hasLimits ? `FormApp.createTextValidation().requireNumberBetween(${lo}, ${hi}).build()` : r.kind === "integer" ? "FormApp.createTextValidation().requireWholeNumber().build()" : "FormApp.createTextValidation().requireNumber().build()";
          out.push(`  form.addTextItem().setTitle(${jsStr(t)}).setValidation(${v})${help}${req};`);
          mapping.add(`response.${r.kind}`, "transformed", "Text question with number validation.", id);
          if (r.kind === "decimal" && r.maxDecimalPlaces !== undefined) mapping.add("response.decimalPlaces", "manual", "The maximum number of decimal places cannot be written.", id);
          if (r.unit) mapping.add("response.unit", "manual", "The unit is not written; add it to the question text if it is not there.", id);
          if (r.kind === "integer" && hasLimits) mapping.add("response.wholeNumber", "manual", "With limits the check is 'number between'; the whole-number rule must be added manually.", id);
          if ((lo === undefined) !== (hi === undefined)) mapping.add("response.limits", "manual", "A single limit cannot be written; set it manually.", id);
          break;
        }
        case "shortText": {
          const v = r.format === "email" ? ".setValidation(FormApp.createTextValidation().requireTextIsEmail().build())" : r.format === "url" ? ".setValidation(FormApp.createTextValidation().requireTextIsUrl().build())" : "";
          if (r.format === "phone") mapping.add("response.format", "manual", "Phone numbers have no validation in Google Forms.", id);
          out.push(`  form.addTextItem().setTitle(${jsStr(t)})${v}${help}${req};`);
          mapping.add("response.shortText", "exact", "Short answer.", id);
          if (r.maxLength !== undefined || r.minLength !== undefined) mapping.add("response.textLength", "manual", "Text length limits are not written.", id);
          break;
        }
        case "longText":
          out.push(`  form.addParagraphTextItem().setTitle(${jsStr(t)})${help}${req};`);
          mapping.add("response.longText", "exact", "Paragraph.", id);
          break;
        case "date":
          out.push(`  form.addDateItem().setTitle(${jsStr(t)})${help}${req};`);
          mapping.add("response.date", "exact", "Date question; date limits are not written.", id);
          break;
        case "slider": {
          const lo = Number(r.minimum);
          const hi = Number(r.maximum);
          if (r.step !== undefined && r.step !== 1) {
            err("EXPORT_RESPONSE_UNSUPPORTED", `Item "${id}": a Google Forms scale always has steps of 1; the catalog step ${r.step} is not written.`, { itemRef: id, remediation: "Deselect the item or build the scale in Google Forms by hand." });
            break;
          }
          if (!((lo === 0 || lo === 1) && Number.isInteger(hi) && hi >= 2 && hi <= 10)) {
            err("EXPORT_RESPONSE_UNSUPPORTED", `Item "${id}": a Google Forms scale runs from 0 or 1 to 2 up to 10; the catalog slider (${String(r.minimum)} to ${String(r.maximum)}) is not rescaled.`, { itemRef: id, remediation: "Deselect the item or build the scale in Google Forms by hand." });
            break;
          }
          const lab = (l: LocalizedText | undefined) => jsStr(l ? ctx.need(l, `A slider label of "${id}"`, id) : "");
          out.push(`  form.addScaleItem().setTitle(${jsStr(t)}).setBounds(${lo}, ${hi}).setLabels(${lab(r.labels?.min)}, ${lab(r.labels?.max)})${help}${req};`);
          mapping.add("response.slider", "transformed", "Slider as a linear scale with discrete steps.", id);
          break;
        }
        case "ranking":
          err("EXPORT_RESPONSE_UNSUPPORTED", `Item "${id}": Google Forms has no ranking question, so the item cannot be exported.`, { itemRef: id, remediation: "Deselect the item, or use a grid or a checkbox grid by hand." });
          break;
      }
    }
  }
  out.push("  Logger.log('Edit: ' + form.getEditUrl());", "  Logger.log('Respondents: ' + form.getPublishedUrl());", "}");

  if (hasErrors(ctx.diagnostics)) return ctx.result(false);
  return ctx.result(true, out.join("\n") + "\n");
}
