import type { Condition, ConditionOrGroup, Item, LocalizedText, Option } from "../core/types";
import { AdapterOptions, openAdapter } from "./adapterBase";
import { hasErrors } from "../core/diagnostics";
import type { AdapterResult } from "./mapping";

/**
 * REDCap adapter: Data Dictionary CSV (PROTOTYPE).
 *
 * No official public page for the format could be read (docs/RECHERCHE_Zielsysteme.md, open point 3). The only
 * readable source is the third-party LinkML schema https://linkml.io/linkml-redcap/. The header row below is
 * written from general knowledge of REDCap and is NOT verified. Download the empty data dictionary of a test
 * project and compare its first row before relying on this file.
 *
 * Same principles as the other adapters (ADR-007): nothing is repaired silently, an item REDCap cannot represent
 * (ranking, slider outside 0 to 100) is an error, conditions become branching logic.
 */

export const REDCAP_ASSUMPTIONS: readonly string[] = [
  "PROTOTYPE: the header row (18 columns) is written from general knowledge, the linkml schema only confirms the order and meaning of the columns, not the header strings.",
  'Branching logic syntax ([var] = \'1\', [var(code)] = \'1\' for checkbox options, <> for not equal, and/or) comes from general knowledge, not from a page that could be read.',
  "Variable names must match ^[a-z][a-z0-9_]*$ (linkml schema); a length limit is not confirmed, names of at most 26 characters are recommended by secondary sources.",
  "Choice codes are limited to letters, digits and underscore here; REDCap's real rule was not found.",
  "Text validation codes (integer, number, number_1dp .. number_4dp, date_ymd, email, phone) come from the linkml list; min and max are written as plain numbers or ISO dates.",
  "Sliders in REDCap run from 0 to 100; the adapter only exports sliders with exactly that range and writes the end labels.",
  "The file is written as UTF-8 without byte order mark with LF line endings and every field quoted.",
  "Hidden fields, survey settings (title, instructions, completion text, anonymous link) are not part of the data dictionary and must be set manually.",
];

const HEADER = [
  "Variable / Field Name",
  "Form Name",
  "Section Header",
  "Field Type",
  "Field Label",
  "Choices, Calculations, OR Slider Labels",
  "Field Note",
  "Text Validation Type OR Show Slider Number",
  "Text Validation Min",
  "Text Validation Max",
  "Identifier?",
  "Branching Logic (Show field only if...)",
  "Required Field?",
  "Custom Alignment",
  "Question Number (surveys only)",
  "Matrix Group Name",
  "Matrix Ranking?",
  "Field Annotation",
] as const;

const VAR_RE = /^[a-z][a-z0-9_]*$/;
const CODE_RE = /^[A-Za-z0-9_]{1,50}$/;
const rcCode = (o: Option): string => o.exportHints?.redcap?.code ?? o.code;

function html(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\t/g, " ").replace(/\r\n?|\n/g, "<br>");
}
const quoteCsv = (s: string): string => '"' + s.replace(/"/g, '""') + '"';

export function buildRedcap(c: Parameters<typeof openAdapter>[0], selection: Parameters<typeof openAdapter>[1], options: AdapterOptions): AdapterResult {
  const ctx = openAdapter(c, selection, options, { platform: "redcap", ext: "csv", mime: "text/csv;charset=utf-8", assumptions: REDCAP_ASSUMPTIONS });
  if (ctx.early) return ctx.early;
  const { mapping, err } = ctx;
  const rows: string[][] = [];
  const form = c.catalog.id.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^[^a-z]+/, "f").slice(0, 60) || "form";
  const text = (lt: LocalizedText | undefined, what: string, itemRef?: string): string => html(ctx.need(lt, what, itemRef));

  const names = new Map<string, string>();
  const varOf = new Map<string, string>();
  for (const id of ctx.selected) {
    const item = ctx.items.get(id) as Item;
    const n = item.exportHints?.redcap?.variableName ?? item.variableName;
    if (!VAR_RE.test(n)) {
      err("EXPORT_VARIABLE_NAME_INVALID", `Item "${id}": "${n}" is not a valid REDCap variable name (lowercase letters, digits and underscore, starting with a letter).`, {
        itemRef: id,
        remediation: "Set exportHints.redcap.variableName in the catalog. REDCap would otherwise change the name silently.",
      });
      continue;
    }
    if (n === "record_id" || names.has(n)) {
      err("EXPORT_VARIABLE_NAME_DUPLICATE", `Items "${names.get(n) ?? "record_id"}" and "${id}" would both get the REDCap variable "${n}".`, { itemRef: id });
      continue;
    }
    names.set(n, id);
    varOf.set(id, n);
  }

  const row = (f: Partial<Record<(typeof HEADER)[number], string>>): void => {
    rows.push(HEADER.map((h) => f[h] ?? ""));
  };
  row({ "Variable / Field Name": "record_id", "Form Name": form, "Field Type": "text", "Field Label": "Record ID", "Field Annotation": ctx.titleLabel() });
  mapping.add("recordId", "transformed", "REDCap needs a first text field as record identifier; record_id is added.");

  const descriptive = (name: string, lt: LocalizedText | undefined, what: string): void => {
    if (lt === undefined) return;
    row({ "Variable / Field Name": name, "Form Name": form, "Field Type": "descriptive", "Field Label": text(lt, what) });
  };
  descriptive("mm_intro", c.questionnaire.introduction, "The introduction");
  descriptive("mm_consent", c.questionnaire.consent?.text, "The consent text");
  descriptive("mm_consent_parents", c.questionnaire.consent?.parentalConsentText, "The parental consent text");
  descriptive("mm_privacy", c.questionnaire.privacyNotice, "The privacy notice");
  if (c.questionnaire.consent) mapping.add("consent", "manual", "The consent text is a descriptive field. A consent choice and the end of the survey on refusal must be set up manually.");
  mapping.add("survey.settings", "manual", "Survey title, instructions, completion text, anonymous survey link and language are survey settings, not part of the data dictionary.");
  for (const h of c.questionnaire.hiddenFields ?? []) mapping.add("hiddenFields", "manual", `Hidden field "${h.variableName}" (${h.source}) is not written; set it up with REDCap tools.`);

  // ---- branching logic
  function single(cond: Condition, owner: Item): string | undefined {
    const target = ctx.items.get(cond.itemRef);
    const v = varOf.get(cond.itemRef);
    if (!target || !ctx.selected.has(cond.itemRef)) {
      err("EXPORT_CONDITION_TARGET_MISSING", `Item "${owner.id}" depends on "${cond.itemRef}", which is not in the questionnaire.`, { itemRef: owner.id });
      return undefined;
    }
    if (!v) return undefined;
    const bad = (why: string): undefined => {
      err("EXPORT_CONDITION_UNSUPPORTED", `Item "${owner.id}": the condition on "${cond.itemRef}" (${cond.operator}) cannot be expressed for REDCap: ${why}.`, { itemRef: owner.id });
      return undefined;
    };
    const kind = target.response.kind;
    const opts = ctx.optionSets.get(target.response.optionSetRef ?? "")?.options ?? [];
    const exportValue = (x: string): string | undefined => {
      const o = opts.find((y) => y.code === x);
      return o ? rcCode(o) : undefined;
    };
    if (kind === "multipleChoice") {
      if (cond.operator !== "contains" && cond.operator !== "notContains") return bad("only contains/notContains work on multiple choice");
      const ev = exportValue(cond.value);
      if (ev === undefined) return bad(`option "${cond.value}" does not exist`);
      return `[${v}(${ev})] ${cond.operator === "contains" ? "=" : "<>"} '1'`;
    }
    if (kind === "ranking" || kind === "note") return bad(`${kind} items cannot be the subject of a condition`);
    const numeric = kind === "integer" || kind === "decimal" || kind === "slider";
    const map: Record<string, string> = { equals: "=", notEquals: "<>", greaterThan: ">", greaterThanOrEqual: ">=", lessThan: "<", lessThanOrEqual: "<=" };
    const op = map[cond.operator];
    if (!op) return bad("operator not available for this answer type");
    if (op !== "=" && op !== "<>" && !numeric) return bad("comparison with < or > needs a numeric answer type");
    if (numeric) {
      if (cond.value.trim() === "" || !Number.isFinite(Number(cond.value))) return bad(`"${cond.value}" is not a number`);
      return `[${v}] ${op} '${Number(cond.value)}'`;
    }
    const value = kind === "singleChoice" ? exportValue(cond.value) : cond.value;
    if (value === undefined) return bad(`option "${cond.value}" does not exist`);
    if (/['\r\n\t]/.test(value)) return bad("the value contains characters that cannot be quoted safely");
    return `[${v}] ${op} '${value}'`;
  }
  function logic(vw: ConditionOrGroup, owner: Item): string | undefined {
    if ("itemRef" in vw) return single(vw, owner);
    const list = vw.all ?? vw.any ?? [];
    const parts = list.map((x) => single(x, owner));
    if (parts.some((p) => p === undefined)) return undefined;
    return "(" + parts.join(vw.all ? ") and (" : ") or (") + ")";
  }

  // ---- choices
  function choices(item: Item): string | undefined {
    const os = ctx.optionSets.get(item.response.optionSetRef ?? "")?.options ?? [];
    const seen = new Set<string>();
    const parts: string[] = [];
    for (const o of os) {
      const code = rcCode(o);
      const label = ctx.need(o.label, `Option "${o.code}" of "${item.id}"`, item.id);
      if (!CODE_RE.test(code) || seen.has(code)) {
        err(seen.has(code) ? "EXPORT_OPTION_CODE_DUPLICATE" : "EXPORT_OPTION_CODE_INVALID", `Item "${item.id}": the answer code "${code}" is not usable for REDCap (letters, digits, underscore; unique).`, {
          itemRef: item.id,
          remediation: `Set exportHints.redcap.code on the option "${o.code}" of its option set.`,
        });
        return undefined;
      }
      if (label.includes("|")) {
        err("EXPORT_TEXT_RESERVED", `Option "${o.code}" of "${item.id}": the label contains "|", which separates choices in REDCap.`, { itemRef: item.id });
        return undefined;
      }
      seen.add(code);
      parts.push(`${code}, ${html(label)}`);
      if (o.exportHints?.redcap?.code) mapping.add("option.code", "exact", "Choice code taken from the option's exportHints.redcap.code.", item.id);
      if (o.role === "missing") mapping.add("option.missing", "transformed", "Missing-value options become ordinary choices; REDCap's missing data codes are project settings, not part of the data dictionary.", item.id);
    }
    return parts.join(" | ");
  }

  // matrix groups: only consecutive single choices with the same option set
  const matrixGroup = (sectionId: string, ids: string[]): Map<string, string> => {
    const out = new Map<string, string>();
    const first = ctx.items.get(ids[0] ?? "");
    const same = ids.length > 1 && ids.every((id) => {
      const it = ctx.items.get(id);
      return it && it.response.kind === "singleChoice" && it.response.optionSetRef === first?.response.optionSetRef && !it.visibleWhen && !it.sensitivity;
    });
    if (same) for (const id of ids) out.set(id, sectionId.toLowerCase().replace(/[^a-z0-9]+/g, "_"));
    return out;
  };

  for (const section of c.questionnaire.sections) {
    const ids = section.itemRefs.filter((x) => ctx.selected.has(x));
    if (ids.length === 0) continue;
    const matrix = section.layout === "matrix" ? matrixGroup(section.id, ids) : new Map<string, string>();
    if (section.layout === "matrix" && matrix.size === 0) mapping.add("section.layout", "transformed", "The matrix layout is only written for consecutive single choices with the same answers; otherwise every item is an ordinary field.");
    let header: string | undefined = text(section.title, `The title of section "${section.id}"`);
    for (const id of ids) {
      const item = ctx.items.get(id) as Item;
      const v = varOf.get(id);
      if (!v) continue;
      const r = item.response;
      const f: Partial<Record<(typeof HEADER)[number], string>> = {
        "Variable / Field Name": v,
        "Form Name": form,
        "Section Header": header ?? "",
        "Field Label": text(item.text, `Item "${id}"`, id),
      };
      header = undefined;
      if (item.answerRequired && r.kind !== "note") f["Required Field?"] = "y";
      if (item.instruction) {
        f["Field Note"] = text(item.instruction, `The instruction of "${id}"`, id);
        mapping.add("item.instruction", "transformed", "The instruction is written as the field note.", id);
      }
      if (item.respondentHelp) mapping.add("item.respondentHelp", "manual", "Help text for participants is not written.", id);
      if (item.sensitivity) mapping.add("sensitivity", "manual", "The warning and help-resource text of sensitive items is not placed before the field; add it manually.", id);
      if (item.presentation?.optionOrder === "random") mapping.add("randomization", "manual", "Random answer order is an action tag (@RANDORDER) in REDCap; set it manually.", id);
      if (matrix.has(id)) {
        f["Matrix Group Name"] = matrix.get(id) as string;
        mapping.add("section.matrix", "transformed", "Consecutive single choices with identical answers are written as a matrix group.", id);
      }
      if (item.visibleWhen) {
        const b = logic(item.visibleWhen, item);
        if (b !== undefined) {
          f["Branching Logic (Show field only if...)"] = b;
          mapping.add("visibleWhen", "transformed", "Visibility conditions are written as branching logic.", id);
        }
      }
      switch (r.kind) {
        case "note":
          f["Field Type"] = "descriptive";
          mapping.add("response.note", "transformed", `Text block as a descriptive field; the style (${r.style ?? "text"}) is lost.`, id);
          break;
        case "singleChoice":
          f["Field Type"] = "radio";
          f["Choices, Calculations, OR Slider Labels"] = choices(item) ?? "";
          mapping.add("response.singleChoice", "exact", "Single choice as radio buttons.", id);
          break;
        case "multipleChoice":
          f["Field Type"] = "checkbox";
          f["Choices, Calculations, OR Slider Labels"] = choices(item) ?? "";
          mapping.add("response.multipleChoice", "exact", "Multiple choice as checkboxes; every option becomes a separate export variable.", id);
          if (r.minSelections !== undefined || r.maxSelections !== undefined) mapping.add("response.selectionLimits", "manual", "Minimum and maximum number of selections cannot be written.", id);
          if (r.exclusiveCodes?.length) mapping.add("response.exclusive", "manual", "The exclusive option cannot be written.", id);
          break;
        case "integer":
        case "decimal": {
          f["Field Type"] = "text";
          const dp = r.maxDecimalPlaces;
          f["Text Validation Type OR Show Slider Number"] = r.kind === "integer" ? "integer" : dp !== undefined && dp >= 1 && dp <= 4 ? `number_${dp}dp` : "number";
          if (r.minimum !== undefined) f["Text Validation Min"] = String(r.minimum);
          if (r.maximum !== undefined) f["Text Validation Max"] = String(r.maximum);
          if (r.kind === "decimal" && dp !== undefined && (dp < 1 || dp > 4)) mapping.add("response.decimalPlaces", "manual", "Only 1 to 4 decimal places have a validation type.", id);
          mapping.add(`response.${r.kind}`, "exact", "Text field with number validation and limits.", id);
          break;
        }
        case "shortText":
          f["Field Type"] = "text";
          if (r.format === "email" || r.format === "phone") f["Text Validation Type OR Show Slider Number"] = r.format;
          else if (r.format) mapping.add("response.format", "manual", `The format "${r.format}" has no validation type; set it manually.`, id);
          if (r.maxLength !== undefined || r.minLength !== undefined) mapping.add("response.textLength", "manual", "Text length limits cannot be written.", id);
          mapping.add("response.shortText", "exact", "Text field.", id);
          break;
        case "longText":
          f["Field Type"] = "notes";
          mapping.add("response.longText", "exact", "Notes box.", id);
          break;
        case "date":
          f["Field Type"] = "text";
          f["Text Validation Type OR Show Slider Number"] = "date_ymd";
          if (typeof r.minimum === "string") f["Text Validation Min"] = r.minimum;
          if (typeof r.maximum === "string") f["Text Validation Max"] = r.maximum;
          mapping.add("response.date", "transformed", "Date as text field with date_ymd validation (year-month-day); the display format is set per project.", id);
          break;
        case "slider": {
          if (Number(r.minimum) !== 0 || Number(r.maximum) !== 100) {
            err("EXPORT_RESPONSE_UNSUPPORTED", `Item "${id}": REDCap sliders always run from 0 to 100; the catalog slider runs from ${String(r.minimum)} to ${String(r.maximum)} and is not rescaled.`, {
              itemRef: id,
              remediation: "Use a 0 to 100 slider, deselect the item, or build the slider in REDCap by hand.",
            });
            break;
          }
          f["Field Type"] = "slider";
          f["Choices, Calculations, OR Slider Labels"] = [r.labels?.min, r.labels?.mid, r.labels?.max].map((l) => (l ? html(ctx.need(l, `A slider label of "${id}"`, id)) : "")).join(" | ");
          f["Text Validation Type OR Show Slider Number"] = "number";
          mapping.add("response.slider", "transformed", "Slider 0 to 100 with end labels and the number shown; a step other than 1 cannot be written.", id);
          break;
        }
        case "ranking":
          err("EXPORT_RESPONSE_UNSUPPORTED", `Item "${id}": REDCap has no ranking field type, so the item cannot be exported.`, { itemRef: id, remediation: "Deselect the item, or build the ranking in REDCap by hand." });
          break;
      }
      row(f);
    }
  }
  descriptive("mm_closing", c.questionnaire.closingText, "The closing text");
  descriptive("mm_help", c.questionnaire.helpResources, "The help resources text");
  mapping.add("languages", "unsupported", "One language per file; the data dictionary has no multilingual import.");
  mapping.add("prototype", "manual", "PROTOTYPE: compare the header row with a data dictionary downloaded from your REDCap project before uploading.");

  if (hasErrors(ctx.diagnostics)) return ctx.result(false);
  return ctx.result(true, [HEADER.map(quoteCsv).join(","), ...rows.map((r) => r.map(quoteCsv).join(","))].join("\n") + "\n");
}

