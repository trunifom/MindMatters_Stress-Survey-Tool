import { Diagnostic } from "../core/diagnostics";
import { exactText, resolveText } from "../core/localized";
import type { Catalog, Condition, ConditionOrGroup, Item, LocalizedText, OptionSet, Response } from "../core/types";
import { evaluateAction, requiredAttributions } from "../model/rights";
import { orderedSelection, Selection } from "../model/selection";
import { APP_VERSION } from "../version";

/**
 * Codebook (spec C08): a Markdown document describing the selected questionnaire.
 *
 * - It is NOT a native import file.
 * - Item wording is only written for items whose rights cover the codebook
 *   (export, redistribution, electronicDisplay, profile reviewed). Other items
 *   appear by ID only, so protected text cannot leak into the document.
 * - Draft catalogs carry the draft notice, withdrawn catalogs a withdrawal notice.
 * - Administrative information is marked as such; school notes appear only if the
 *   caller opts in; no scoring or diagnosis is computed.
 * - All catalog text is escaped, the output contains no HTML.
 */

export interface CodebookOptions {
  /** Language of item texts. Must be a catalog language. */
  language: string;
  /** Only with explicit choice (C08: "Keine Schulnotizen ohne ausdrückliche Wahl"). */
  schoolNotes?: { schoolLabel?: string; internalNotes?: string };
  /** Injected for deterministic output. */
  now?: Date;
}

export interface CodebookResult {
  markdown: string;
  diagnostics: Diagnostic[];
  /** Items whose wording was left out for rights reasons. */
  withheldItemIds: string[];
}

const L = {
  de: {
    title: "Codebuch",
    draft: "Entwurf – nicht für produktive Durchführung freigegeben",
    withdrawn: "ZURÜCKGEZOGEN: Der Herausgeber hat diesen Katalog zurückgezogen. Nicht für neue Befragungen verwenden.",
    notImport: "Dieses Dokument ist kein Import für ein Umfragetool, sondern eine Beschreibung.",
    admin: "Verwaltungsinformation, nicht für Teilnehmende",
    catalog: "Katalog", version: "Version", status: "Status", language: "Sprache", publisher: "Herausgeber",
    created: "Erstellt", updated: "Aktualisiert", generated: "Codebuch erzeugt", tool: "Erzeugt mit", items: "Items in der Auswahl",
    attribution: "Erforderliche Quellenangaben", sources: "Quellen", constructs: "Dimensionen und Konstrukte",
    instruments: "Instrumente", scales: "Skalen", questionnaire: "Fragebogen", intro: "Einleitung", consent: "Einwilligung",
    parental: "Information für Eltern", privacy: "Datenschutzhinweis", help: "Hilfsangebote", closing: "Schlusstext",
    delivery: "Durchführung", hidden: "Versteckte Felder (Gruppierungsvariablen)", section: "Abschnitt", scoring: "Dokumentierte Auswertung",
    scoringNote: "Nur Dokumentation. Das Tool berechnet keine Scores, Normen oder Diagnosen.",
    text: "Wortlaut", instruction: "Anweisung", help2: "Hilfe für Teilnehmende", type: "Antworttyp", options: "Antwortoptionen",
    code: "Code", label: "Beschriftung", role: "Rolle", constraints: "Einschränkungen", required: "Pflicht",
    inclusion: "Standardumfang (nicht abwählbar)", answer: "Antwort erforderlich", visible: "Angezeigt wenn", source: "Quelle",
    instrument: "Instrument", originalNo: "Originalnummer", direction: "Skalierungsrichtung", origin: "Herkunft",
    sensitive: "Sensibles Item", exportLabel: "Exportlabel", variable: "Variable", yes: "ja", no: "nein",
    locked: "Wortlaut gesperrt: Die Rechte für das Codebuch sind nicht bestätigt.",
    fallback: "Hinweis: In dieser Sprache nicht vorhanden, Text in", textblock: "Textblock",
    construct: "Dimension", itemsHdr: "Items", policy: "Auswahlregel", whole: "nur vollständig", partial: "Teilauswahl mit Warnung",
    method: "Methode", minAnswered: "Mindestanzahl Antworten", level: "Skalenniveau",
  },
  en: {
    title: "Codebook",
    draft: "Draft – not released for productive use",
    withdrawn: "WITHDRAWN: The publisher has withdrawn this catalog. Do not use for new surveys.",
    notImport: "This document is not an import file for a survey tool but a description.",
    admin: "Administrative information, not for participants",
    catalog: "Catalog", version: "Version", status: "Status", language: "Language", publisher: "Publisher",
    created: "Created", updated: "Updated", generated: "Codebook generated", tool: "Generated with", items: "Items in the selection",
    attribution: "Required attributions", sources: "Sources", constructs: "Dimensions and constructs",
    instruments: "Instruments", scales: "Scales", questionnaire: "Questionnaire", intro: "Introduction", consent: "Consent",
    parental: "Information for parents", privacy: "Privacy notice", help: "Help resources", closing: "Closing text",
    delivery: "Delivery", hidden: "Hidden fields (grouping variables)", section: "Section", scoring: "Documented scoring",
    scoringNote: "Documentation only. The tool computes no scores, norms or diagnoses.",
    text: "Wording", instruction: "Instruction", help2: "Help for participants", type: "Answer type", options: "Answer options",
    code: "Code", label: "Label", role: "Role", constraints: "Constraints", required: "Required",
    inclusion: "Standard scope (cannot be deselected)", answer: "Answer required", visible: "Shown when", source: "Source",
    instrument: "Instrument", originalNo: "Original number", direction: "Key direction", origin: "Origin",
    sensitive: "Sensitive item", exportLabel: "Export label", variable: "Variable", yes: "yes", no: "no",
    locked: "Wording withheld: the rights for the codebook are not confirmed.",
    fallback: "Note: not available in this language, text in", textblock: "Text block",
    construct: "Dimension", itemsHdr: "Items", policy: "Selection rule", whole: "complete only", partial: "partial with warning",
    method: "Method", minAnswered: "Minimum answered", level: "Level of measurement",
  },
} as const;
type Labels = Record<keyof (typeof L)["de"], string>;

/** Escape Markdown and neutralize HTML so catalog text can never become markup. */
export function md(s: string): string {
  return s
    .replace(/[\\`*_{}\[\]()#+!|<>~]/g, (m) => "\\" + m)
    .replace(/\r\n?|\n/g, " ")
    .trim();
}

/** Escape a multi-line text for a blockquote. */
function quote(s: string): string {
  return s
    .split(/\r\n?|\n/)
    .map((line) => "> " + (line === "" ? "" : md(line)))
    .join("\n");
}

const code = (s: string): string => "`" + s.replace(/`/g, "'") + "`";

export function buildCodebook(c: Catalog, selection: Selection, options: CodebookOptions): CodebookResult {
  const lang = options.language;
  const l: Labels = lang.toLowerCase().startsWith("de") ? L.de : L.en;
  const dflt = c.catalog.defaultLanguage;
  const ids = orderedSelection(c, selection);
  const decision = evaluateAction(c, "codebookWithTexts", { selection });
  const allowed = new Set(decision.allowedItemIds);
  const withheld = ids.filter((id) => !allowed.has(id));
  const items = new Map(c.items.map((i) => [i.id, i]));
  const optionSets = new Map(c.optionSets.map((o) => [o.id, o]));
  const out: string[] = [];
  const push = (...x: string[]) => out.push(...x);

  const admin = (lt: LocalizedText | undefined): string | undefined => {
    const r = resolveText(lt, lang, dflt);
    return r ? (r.fallback ? `${r.text} _(${r.language})_` : r.text) : undefined;
  };
  const part = (lt: LocalizedText | undefined): string => {
    const t = exactText(lt, lang);
    return t === undefined ? `_(${l.fallback} ${resolveText(lt, lang, dflt)?.language ?? "?"})_ ` + (lt ? md(resolveText(lt, lang, dflt)!.text) : "") : md(t);
  };

  const title = admin(c.catalog.title) ?? c.catalog.id;
  push(`# ${l.title}: ${md(title)}`, "");
  if (decision.flags.draftWatermark) push(`> **${l.draft}**`, "");
  if (decision.flags.withdrawnNotice) push(`> **${l.withdrawn}**`, "");
  push(`_${l.notImport}_`, "");

  push(`| | |`, `|---|---|`);
  push(`| ${l.catalog} | ${code(c.catalog.id)} |`, `| ${l.version} | ${code(c.catalog.version)} |`, `| ${l.status} | ${code(c.catalog.status)} |`, `| ${l.language} | ${code(lang)} |`);
  if (c.catalog.createdAt) push(`| ${l.created} | ${md(c.catalog.createdAt)} |`);
  if (c.catalog.updatedAt) push(`| ${l.updated} | ${md(c.catalog.updatedAt)} |`);
  push(`| ${l.generated} | ${(options.now ?? new Date()).toISOString().slice(0, 10)} |`, `| ${l.tool} | MindMatters ${APP_VERSION} |`, `| ${l.items} | ${ids.length} |`, "");

  if (options.schoolNotes && (options.schoolNotes.schoolLabel || options.schoolNotes.internalNotes)) {
    push(`> ${l.admin}`);
    if (options.schoolNotes.schoolLabel) push(`> ${md(options.schoolNotes.schoolLabel)}`);
    if (options.schoolNotes.internalNotes) push(quote(options.schoolNotes.internalNotes));
    push("");
  }

  const attributions = requiredAttributions(c, selection);
  if (attributions.length > 0) {
    push(`## ${l.attribution}`, "");
    for (const a of attributions) push(`- ${md(admin(a.attribution) ?? "")} (${code(a.profileId)})`);
    push("");
  }

  // --- sources, constructs, instruments, scales (administrative)
  push(`## ${l.sources}`, `_${l.admin}_`, "");
  for (const s of c.sources) push(`- ${code(s.id)} ${md(s.title)} (${s.type})`);
  push("");

  push(`## ${l.constructs}`, `_${l.admin}_`, "");
  const children = (parent?: string) => c.constructs.filter((x) => x.parentRef === parent);
  const walk = (parent: string | undefined, depth: number, seen: Set<string>) => {
    for (const k of children(parent)) {
      if (seen.has(k.id)) continue;
      seen.add(k.id);
      push(`${"  ".repeat(depth)}- ${code(k.id)} **${md(admin(k.label) ?? k.id)}**: ${md(admin(k.description) ?? "")}`);
      walk(k.id, depth + 1, seen);
    }
  };
  walk(undefined, 0, new Set());
  push("");

  push(`## ${l.instruments}`, `_${l.admin}_`, "");
  for (const i of c.instruments) {
    push(`- ${code(i.id)} **${md(admin(i.title) ?? i.id)}**${i.formName ? ` – ${md(i.formName)}` : ""}`);
  }
  push("");

  push(`## ${l.scales}`, `_${l.admin}_`, "");
  for (const s of c.scales) {
    const sel = s.itemRefs.filter((id) => selection.has(id)).length;
    push(`- ${code(s.id)} **${md(admin(s.title) ?? s.id)}**: ${sel}/${s.itemRefs.length} ${l.itemsHdr.toLowerCase()}, ${l.policy}: ${s.selectionPolicy === "wholeScale" ? l.whole : l.partial}`);
  }
  push("");

  // --- questionnaire
  push(`## ${l.questionnaire}`, "");
  const q = c.questionnaire;
  const block = (label: string, lt: LocalizedText | undefined) => {
    if (!lt) return;
    push(`### ${label}`, "", quote(exactText(lt, lang) ?? resolveText(lt, lang, dflt)?.text ?? ""), "");
  };
  block(l.intro, q.introduction);
  block(l.consent, q.consent?.text);
  block(l.parental, q.consent?.parentalConsentText);
  block(l.privacy, q.privacyNotice);
  block(l.help, q.helpResources);
  if (q.hiddenFields && q.hiddenFields.length > 0) {
    push(`### ${l.hidden}`, "");
    for (const h of q.hiddenFields) push(`- ${code(h.variableName)} (${h.source}${h.constantValue ? `, ${code(h.constantValue)}` : ""})`);
    push("");
  }

  // --- items in questionnaire order
  let n = 0;
  for (const section of q.sections) {
    const inSel = section.itemRefs.filter((id) => selection.has(id));
    if (inSel.length === 0) continue; // empty sections disappear with their instruction (B15)
    push(`### ${l.section}: ${md(exactText(section.title, lang) ?? admin(section.title) ?? section.id)}`, "");
    const sInstr = exactText(section.instruction, lang);
    if (sInstr) push(quote(sInstr), "");
    for (const id of inSel) {
      const item = items.get(id) as Item;
      n++;
      writeItem(item, n);
    }
  }
  block(l.closing, q.closingText);

  // --- documented scoring
  const defs = c.scoringDefinitions ?? [];
  if (defs.length > 0) {
    push(`## ${l.scoring}`, `_${l.scoringNote}_`, "");
    for (const d of defs) {
      const full = d.itemRefs.every((x) => selection.has(x));
      push(`- ${code(d.id)} ${l.method}: ${d.method}, ${l.minAnswered}: ${d.minimumAnswered}, ${l.itemsHdr}: ${d.itemRefs.length}${full ? "" : " – ⚠ incomplete selection, not available"}`);
    }
    push("");
  }

  return {
    markdown: out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n",
    diagnostics: decision.diagnostics,
    withheldItemIds: withheld,
  };

  // -------------------------------------------------------------------------
  function writeItem(item: Item, number: number): void {
    const r = item.response;
    push(`#### ${md(item.displayNumber ?? String(number))} ${code(item.variableName)}`, "");
    push(`- ID: ${code(item.id)}, ${l.variable}: ${code(item.variableName)}, v${item.version}`);
    if (!allowed.has(item.id)) {
      push(`- ${l.type}: ${code(r.kind)}`, `- **${l.locked}**`, "");
      return;
    }
    if (r.kind === "note") {
      push(`- ${l.textblock} (${code(r.style ?? "text")})`, "", quote(exactText(item.text, lang) ?? resolveText(item.text, lang, dflt)?.text ?? ""), "");
      return;
    }
    push(`- ${l.text}:`, "", quote(exactText(item.text, lang) ?? resolveText(item.text, lang, dflt)?.text ?? ""));
    if (exactText(item.text, lang) === undefined) push("", `  _(${l.fallback} ${resolveText(item.text, lang, dflt)?.language ?? "?"})_`);
    push("");
    const instr = item.instruction && part(item.instruction);
    if (instr) push(`- ${l.instruction}: ${instr}`);
    const help = item.respondentHelp && part(item.respondentHelp);
    if (help) push(`- ${l.help2}: ${help}`);
    push(`- ${l.type}: ${describeType(r)}`);
    const cons = constraints(r);
    if (cons) push(`- ${l.constraints}: ${cons}`);
    push(`- ${l.inclusion}: ${item.inclusionRequired ? l.yes : l.no}; ${l.answer}: ${item.answerRequired ? l.yes : l.no}`);
    if (item.visibleWhen) push(`- ${l.visible}: ${describeCondition(item.visibleWhen)}`);
    if (item.exportLabel) push(`- ${l.exportLabel}: ${md(admin(item.exportLabel) ?? "")}`);
    if (item.keyDirection) push(`- ${l.direction}: ${item.keyDirection}`);
    if (item.origin) push(`- ${l.origin}: ${item.origin}`);
    if (item.sensitivity) push(`- ${l.sensitive}: ${item.sensitivity.level}`);
    if (item.instrumentRef) push(`- ${l.instrument}: ${code(item.instrumentRef)}${item.originalItemNumber ? `, ${l.originalNo}: ${md(item.originalItemNumber)}` : ""}`);
    if (item.sourceLinks?.length) push(`- ${l.source}: ${item.sourceLinks.map((s) => code(s.sourceRef) + (s.locator ? ` (${md(s.locator)})` : "")).join(", ")}`);
    if (item.organizerHelp) push(`- _${l.admin}:_ ${md(admin(item.organizerHelp) ?? "")}`);
    const os = r.optionSetRef ? optionSets.get(r.optionSetRef) : undefined;
    if (os) writeOptions(os);
    push("");
  }

  function writeOptions(os: OptionSet): void {
    push("", `  ${l.options} (${code(os.id)}${os.measurementLevel ? `, ${l.level}: ${os.measurementLevel}` : ""}):`, "");
    push(`  | ${l.code} | ${l.label} | ${l.role} |`, `  |---|---|---|`);
    for (const o of os.options) {
      const label = md(exactText(o.label, lang) ?? resolveText(o.label, lang, dflt)?.text ?? "");
      const role = o.role === "missing" ? `missing (${o.missingReason ?? ""})` : `substantive${o.ordinalPosition ? ` #${o.ordinalPosition}` : ""}`;
      push(`  | ${code(o.code)} | ${label} | ${role} |`);
    }
  }

  function describeType(r: Response): string {
    return code(r.kind) + (r.format ? ` (${r.format})` : "") + (r.optionSetRef ? `, ${code(r.optionSetRef)}` : "");
  }

  function constraints(r: Response): string {
    const p: string[] = [];
    const unit = r.unit ? ` ${md(admin(r.unit.label) ?? r.unit.code)}` : "";
    if (r.minimum !== undefined) p.push(`min ${md(String(r.minimum))}${unit}`);
    if (r.maximum !== undefined) p.push(`max ${md(String(r.maximum))}${unit}`);
    if (r.step !== undefined) p.push(`step ${r.step}`);
    if (r.maxDecimalPlaces !== undefined) p.push(`max decimals ${r.maxDecimalPlaces}`);
    if (r.minLength !== undefined) p.push(`min length ${r.minLength}`);
    if (r.maxLength !== undefined) p.push(`max length ${r.maxLength}`);
    if (r.minSelections !== undefined) p.push(`min selections ${r.minSelections}`);
    if (r.maxSelections !== undefined) p.push(`max selections ${r.maxSelections}`);
    if (r.maxRanks !== undefined) p.push(`max ranks ${r.maxRanks}`);
    if (r.exclusiveCodes?.length) p.push(`exclusive ${r.exclusiveCodes.map(code).join(", ")}`);
    return p.join(", ");
  }

  function describeCondition(vw: ConditionOrGroup): string {
    const one = (c1: Condition) => `${code(c1.itemRef)} ${c1.operator} ${code(c1.value)}`;
    if ("itemRef" in vw) return one(vw);
    if (vw.all) return vw.all.map(one).join(" AND ");
    return (vw.any ?? []).map(one).join(" OR ");
  }
}
