import { hasErrors } from "../core/diagnostics";
import type { Item, LocalizedText } from "../core/types";
import { AdapterOptions, openAdapter } from "./adapterBase";
import type { AdapterResult } from "./mapping";
import { md } from "./codebook";
import { describeCondition, limitsText, optionPairs } from "./plain";

/**
 * Build plan (PROTOTYPE) for target systems without any importable questionnaire format: Unipark and SurveyMonkey.
 *
 * Research (docs/RECHERCHE_Zielsysteme.md): Unipark has no documented questionnaire import; SurveyMonkey only takes
 * pasted multiple-choice and text questions or an API call with OAuth. The honest output is therefore a plan a
 * person follows in the target system: every selected item with its type in that system's words, wording, answer
 * codes, limits, required flag and condition, plus a checklist of survey-level settings.
 *
 * Nothing is dropped: whatever the plan cannot do for the person is written as an instruction. Conditions appear
 * as sentences, not as syntax, because there is no file the system would read.
 */

export type PlanPlatform = "unipark" | "surveymonkey";

const KIND_NAMES: Record<PlanPlatform, Record<string, string>> = {
  unipark: {
    singleChoice: "Einfachauswahl (Radiobuttons)",
    multipleChoice: "Mehrfachauswahl (Checkboxen)",
    integer: "Zahleneingabe (ganze Zahl)",
    decimal: "Zahleneingabe (Dezimalzahl)",
    shortText: "Texteingabe einzeilig",
    longText: "Texteingabe mehrzeilig",
    date: "Datumseingabe",
    slider: "Schieberegler",
    ranking: "Rangordnung",
    note: "Text-/Informationselement",
  },
  surveymonkey: {
    singleChoice: "Multiple Choice (eine Antwort)",
    multipleChoice: "Checkboxes (mehrere Antworten)",
    integer: "Single Textbox (Validierung: ganze Zahl)",
    decimal: "Single Textbox (Validierung: Dezimalzahl)",
    shortText: "Single Textbox",
    longText: "Comment Box",
    date: "Date/Time",
    slider: "Slider",
    ranking: "Ranking",
    note: "Descriptive Text",
  },
};

const ASSUMPTIONS: Record<PlanPlatform, readonly string[]> = {
  unipark: [
    "PROTOTYPE: there is no file the system reads. The plan is a document for a person.",
    "The names of the question types in Unipark's editor are written from general knowledge and may differ in your version.",
    "Unipark's special missing codes (-77, -66, -99) come from a secondary source; the plan does not apply them.",
    "Whether Unipark offers an import of structured questionnaires for licence holders is open (ask Tivian or the university support); this plan would then be replaced by a file.",
  ],
  surveymonkey: [
    "PROTOTYPE: there is no file the system reads. The plan is a document for a person. SurveyMonkey's API (OAuth) is not used.",
    "The names of the question types are written from general knowledge and may differ in your plan or language.",
    "The block 'Zum Einfügen' lists only choice questions in the form 'question, then one answer per line'; whether SurveyMonkey's paste import accepts exactly this form was not checked.",
  ],
};

const NAMES: Record<PlanPlatform, string> = { unipark: "Unipark", surveymonkey: "SurveyMonkey" };

export function buildBauplan(platform: PlanPlatform, c: Parameters<typeof openAdapter>[0], selection: Parameters<typeof openAdapter>[1], options: AdapterOptions): AdapterResult {
  const ctx = openAdapter(c, selection, options, { platform, ext: "md", mime: "text/markdown;charset=utf-8", assumptions: ASSUMPTIONS[platform], suffix: "_bauplan" });
  if (ctx.early) return ctx.early;
  const { mapping } = ctx;
  const name = NAMES[platform];
  const q = c.questionnaire;
  const out: string[] = [];
  const push = (...x: string[]): void => {
    out.push(...x);
  };
  const t = (lt: LocalizedText | undefined, what: string, itemRef?: string): string => md(ctx.need(lt, what, itemRef));
  const block = (label: string, lt: LocalizedText | undefined, what: string): void => {
    if (lt) push(`**${label}**`, "", ...ctx.need(lt, what).split(/\r\n?|\n/).map((l) => "> " + md(l)), "");
  };

  const label = ctx.titleLabel();
  push(`# Bauplan für ${name}: ${t(c.catalog.title, "The catalog title")}`, "");
  if (label) push(`> **${md(label)}**`, "");
  push(`_Das ist kein Import. ${name} liest keine Fragebogendatei, die dieses Tool erzeugen kann. Bauen Sie den Fragebogen anhand dieses Plans im Umfragetool nach. Prototyp, ungeprüft._`, "");
  push(`Katalog \`${c.catalog.id}\` ${c.catalog.version}, Sprache \`${ctx.lang}\`, ${ctx.selected.size} Einträge.`, "");

  push("## Einstellungen der Umfrage (von Hand)", "");
  push("- [ ] Titel der Umfrage setzen und Sprache wählen (eine Sprache pro Plan).");
  push("- [ ] Anonymität und Datenspeicherung nach dem Datenschutzkonzept der Schule einstellen (Teilnehmerverfolgung, IP-Speicherung, Erfassung von E-Mail-Adressen).");
  push("- [ ] Fortschrittsanzeige, Seitenaufteilung und Pflichtfeld-Hinweis einstellen.");
  if (q.consent) push("- [ ] Einwilligung als eigene Pflichtfrage bauen und die Umfrage bei Ablehnung beenden.");
  if ((q.hiddenFields ?? []).length > 0) for (const h of q.hiddenFields ?? []) push(`- [ ] Verstecktes Feld \`${h.variableName}\` (${h.source}${h.constantValue ? `, Wert \`${h.constantValue}\`` : ""}) anlegen.`);
  push("- [ ] Nach dem Bauen: Vorschau durchgehen, Testantworten abgeben, Datenexport und Codes mit dem Codebuch vergleichen.", "");
  mapping.add("survey.settings", "manual", "All survey settings (title, anonymity, progress, consent, hidden fields) are set by hand; the plan lists them.");
  mapping.add("prototype", "manual", `PROTOTYPE: ${name} imports no questionnaire file; the whole questionnaire is built by hand from the plan.`);
  mapping.add("languages", "unsupported", "One language per plan.");

  block("Einleitung", q.introduction, "The introduction");
  block("Einwilligung", q.consent?.text, "The consent text");
  block("Information für Eltern", q.consent?.parentalConsentText, "The parental consent text");
  block("Datenschutzhinweis", q.privacyNotice, "The privacy notice");

  const pasteLines: string[] = [];
  let n = 0;
  push("## Fragen", "");
  for (const section of q.sections) {
    const ids = section.itemRefs.filter((x) => ctx.selected.has(x));
    if (ids.length === 0) continue;
    push(`### Seite/Abschnitt: ${t(section.title, `The title of section "${section.id}"`)}`, "");
    if (section.instruction) push(...ctx.need(section.instruction, `The instruction of section "${section.id}"`).split(/\r\n?|\n/).map((l) => "> " + md(l)), "");
    if (section.layout === "matrix" || section.layout === "table") {
      push(`_Vorschlag: die folgenden Fragen mit gleichen Antworten als Matrix/Tabelle darstellen (Layout \`${section.layout}\`)._`, "");
      mapping.add("section.layout", "manual", `The ${section.layout} layout is a suggestion in the plan.`);
    }
    for (const id of ids) {
      const item = ctx.items.get(id) as Item;
      const r = item.response;
      n++;
      push(`#### ${n}. \`${item.variableName}\`${item.displayNumber ? ` (Nr. ${md(item.displayNumber)})` : ""}`, "");
      push(`- Typ in ${name}: **${KIND_NAMES[platform][r.kind]}**`);
      push(`- Wortlaut: ${t(item.text, `Item "${id}"`, id)}`);
      if (item.instruction) push(`- Anweisung: ${t(item.instruction, `The instruction of "${id}"`, id)}`);
      if (item.respondentHelp) push(`- Hilfetext für Teilnehmende: ${t(item.respondentHelp, `The help text of "${id}"`, id)}`);
      if (r.kind !== "note") push(`- Pflichtantwort: ${item.answerRequired ? "**ja**" : "nein"}`);
      const lim = limitsText(r);
      if (lim) push(`- Grenzen und Format (von Hand als Validierung setzen): ${md(lim)}`);
      if (item.visibleWhen) push(`- **Nur anzeigen, wenn:** ${md(describeCondition(ctx, item.visibleWhen))}`);
      if (item.presentation?.optionOrder === "random") push("- Antwortreihenfolge zufällig");
      if (item.sensitivity) push(`- ⚠ Sensibles Item (${item.sensitivity.level}).${item.sensitivity.warningText ? ` Vorher anzeigen: ${t(item.sensitivity.warningText, `The warning of "${id}"`, id)}` : ""}${item.sensitivity.helpResourcesText ? ` Hilfsangebot: ${t(item.sensitivity.helpResourcesText, `The help text of "${id}"`, id)}` : ""}`);
      const pairs = optionPairs(ctx, item);
      if (pairs.length > 0) {
        push("", "  | Code | Beschriftung | Hinweis |", "  |---|---|---|");
        for (const p of pairs) push(`  | \`${p.code}\` | ${md(p.label)} | ${p.missing ? "Missing-Option (z. B. weiss nicht), als gewöhnliche Antwort anlegen" : ""} |`);
        push("", "  Setzen Sie die Codes in der Datenansicht, damit die Auswertung mit dem Codebuch übereinstimmt.");
      }
      push("");
      const kind = r.kind;
      mapping.add(`response.${kind}`, "manual", `${KIND_NAMES[platform][kind]}: by hand, the plan gives type, wording, codes and limits.`, id);
      if (item.visibleWhen) mapping.add("visibleWhen", "manual", "The condition is written as a sentence; set up the display logic by hand.", id);
      if (platform === "surveymonkey" && (kind === "singleChoice" || kind === "multipleChoice")) {
        pasteLines.push(ctx.need(item.text, `Item "${id}"`, id).replace(/\r\n?|\n/g, " "), ...pairs.map((p) => p.label.replace(/\r\n?|\n/g, " ")), "");
      }
    }
  }
  block("Schlusstext", q.closingText, "The closing text");
  block("Hilfsangebote", q.helpResources, "The help resources text");

  if (platform === "surveymonkey" && pasteLines.length > 0) {
    push("## Zum Einfügen (nur Auswahlfragen)", "", "Frage, dann eine Antwort pro Zeile, Leerzeile zwischen den Fragen. Nur falls Ihr SurveyMonkey-Konto das Einfügen von Fragen anbietet.", "", "```text", ...pasteLines.map((l) => l.replace(/`/g, "'")), "```", "");
    mapping.add("paste", "transformed", "Choice questions are additionally listed as paste text; other types are not part of it.");
  }

  if (hasErrors(ctx.diagnostics)) return ctx.result(false);
  return ctx.result(true, out.join("\n").replace(/\n{3,}/g, "\n\n").trimEnd() + "\n");
}
