import { hasErrors } from "../core/diagnostics";
import type { Catalog, Item, Response } from "../core/types";
import { AdapterContext, AdapterOptions, openAdapter } from "./adapterBase";
import type { AdapterResult } from "./mapping";
import { describeCondition, limitsText } from "./plain";

/**
 * Readable and machine-readable copies of the questionnaire itself: a printable page (HTML), a Markdown
 * document and a neutral JSON file. They are for people who need the questionnaire on paper, in a committee
 * application, in an e-mail or as input to their own scripts. None of them is an import file for a survey tool.
 *
 * All three are written from one resolved model (`buildDocModel`), so they can never disagree about wording,
 * order or answer options. The model uses exact-language texts only; a missing text is reported
 * (EXPORT_TEXT_MISSING) and never replaced by another language. All text is escaped for its target format,
 * and the HTML page contains no script, no external resource and no event handler.
 */

export interface DocOption {
  code: string;
  label: string;
  missing: boolean;
}

export interface DocItem {
  id: string;
  variable: string;
  kind: Response["kind"];
  /** Only for kind "note". */
  style?: NonNullable<Response["style"]>;
  /** Number among the questions (notes are not numbered); 0 for notes. */
  number: number;
  text: string;
  instruction?: string;
  required: boolean;
  /** Readable condition, if the item is shown only in some cases. */
  condition?: string;
  options: DocOption[];
  limits: string;
  minimum?: number | string;
  maximum?: number | string;
  step?: number;
  labels?: { min?: string; mid?: string; max?: string };
  unit?: string;
  optionSetRef?: string;
}

export interface DocSection {
  id: string;
  title: string;
  instruction?: string;
  layout?: "list" | "matrix" | "table";
  pageBreakBefore: boolean;
  items: DocItem[];
}

export interface DocModel {
  title: string;
  /** "[ENTWURF]", "[TEST …]" or empty. */
  statusLabel: string;
  introduction?: string;
  consent?: { title?: string; text: string; parentalConsentText?: string };
  privacyNotice?: string;
  helpResources?: string;
  closingText?: string;
  sections: DocSection[];
}

/** Words the printed page needs, in German or English (like the codebook: German for "de…", else English). */
export const WORDS = {
  de: { required: "Pflichtfrage", onlyIf: "Nur wenn", notice: "Hinweis", pick1: "Eine Antwort wählen", pickMany: "Mehrere Antworten möglich", rankHint: "Bringen Sie die Antworten in eine Reihenfolge (1 = am wichtigsten)", missing: "keine Angabe", question: "Frage", date: "TT.MM.JJJJ", draft: "Entwurf – nicht für die produktive Durchführung freigegeben", footer: "Erzeugt mit MindMatters. Druckansicht des Fragebogens, kein Import in ein Umfragetool.", from: "von", to: "bis" },
  en: { required: "Required", onlyIf: "Only if", notice: "Notice", pick1: "Choose one answer", pickMany: "Several answers possible", rankHint: "Put the answers in order (1 = most important)", missing: "no answer", question: "Question", date: "DD.MM.YYYY", draft: "Draft – not released for productive use", footer: "Created with MindMatters. Print view of the questionnaire, not an import into a survey tool.", from: "from", to: "to" },
} as const;

export const wordsFor = (lang: string): (typeof WORDS)["de"] | (typeof WORDS)["en"] => (lang.toLowerCase().startsWith("de") ? WORDS.de : WORDS.en);

/** Control characters other than tab and line breaks are never wanted in a text file. */
export const cleanControl = (s: string): string => s.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\u2028\u2029]/g, "").replace(/\r\n?/g, "\n");

/** Resolve the selected questionnaire into plain text and structure for one language. */
export function buildDocModel(ctx: AdapterContext): DocModel {
  const q = ctx.c.questionnaire;
  const opt = (lt: Parameters<AdapterContext["need"]>[0], what: string) => (lt ? cleanControl(ctx.need(lt, what)) : undefined);
  let n = 0;
  const sections: DocSection[] = [];
  for (const section of q.sections) {
    const ids = section.itemRefs.filter((x) => ctx.selected.has(x));
    if (ids.length === 0) continue;
    const items: DocItem[] = ids.map((id) => {
      const item = ctx.items.get(id) as Item;
      const r = item.response;
      const isNote = r.kind === "note";
      if (!isNote) n++;
      const os = ctx.optionSets.get(r.optionSetRef ?? "");
      const labels = r.labels
        ? {
            ...(r.labels.min ? { min: cleanControl(ctx.need(r.labels.min, `The minimum label of "${id}"`, id)) } : {}),
            ...(r.labels.mid ? { mid: cleanControl(ctx.need(r.labels.mid, `The middle label of "${id}"`, id)) } : {}),
            ...(r.labels.max ? { max: cleanControl(ctx.need(r.labels.max, `The maximum label of "${id}"`, id)) } : {}),
          }
        : undefined;
      const out: DocItem = {
        id,
        variable: item.variableName,
        kind: r.kind,
        number: isNote ? 0 : n,
        text: cleanControl(ctx.need(item.text, `Item "${id}"`, id)),
        required: !isNote && item.answerRequired,
        options: (os?.options ?? []).map((o) => ({ code: o.code, label: cleanControl(ctx.need(o.label, `Option "${o.code}" of "${id}"`, id)), missing: o.role === "missing" })),
        limits: limitsText(r),
      };
      if (isNote) out.style = r.style ?? "text";
      if (item.instruction) out.instruction = cleanControl(ctx.need(item.instruction, `The instruction of "${id}"`, id));
      if (item.visibleWhen) out.condition = cleanControl(describeCondition(ctx, item.visibleWhen));
      if (r.minimum !== undefined) out.minimum = r.minimum;
      if (r.maximum !== undefined) out.maximum = r.maximum;
      if (r.step !== undefined) out.step = r.step;
      if (labels && Object.keys(labels).length > 0) out.labels = labels;
      if (r.unit) out.unit = cleanControl(ctx.need(r.unit.label, `The unit of "${id}"`, id));
      if (r.optionSetRef) out.optionSetRef = r.optionSetRef;
      return out;
    });
    const sec: DocSection = {
      id: section.id,
      title: cleanControl(ctx.need(section.title, `The title of section "${section.id}"`)),
      pageBreakBefore: section.pageBreakBefore === true,
      items,
    };
    if (section.instruction) sec.instruction = cleanControl(ctx.need(section.instruction, `The instruction of section "${section.id}"`));
    if (section.layout) sec.layout = section.layout;
    sections.push(sec);
  }
  const model: DocModel = { title: cleanControl(ctx.need(q.title, "The questionnaire title")), statusLabel: ctx.titleLabel(), sections };
  const intro = opt(q.introduction, "The introduction");
  if (intro) model.introduction = intro;
  if (q.consent) {
    const text = opt(q.consent.text, "The consent text") ?? "";
    const title = opt(q.consent.title, "The consent title");
    const parental = q.consent.requiresParentalConsent === true || q.consent.parentalConsentText ? opt(q.consent.parentalConsentText, "The parental consent text") : undefined;
    model.consent = { text, ...(title ? { title } : {}), ...(parental ? { parentalConsentText: parental } : {}) };
  }
  const privacy = opt(q.privacyNotice, "The privacy notice");
  if (privacy) model.privacyNotice = privacy;
  const help = opt(q.helpResources, "The help resources");
  if (help) model.helpResources = help;
  const closing = opt(q.closingText, "The closing text");
  if (closing) model.closingText = closing;
  return model;
}

/** Shared frame of the three builders: gate, model, error check. */
function build(
  c: Catalog,
  selection: Parameters<typeof openAdapter>[1],
  options: AdapterOptions,
  spec: { platform: string; ext: string; mime: string; suffix: string; assumptions: string[] },
  mappingNote: string,
  write: (model: DocModel, ctx: AdapterContext) => string,
): AdapterResult {
  const ctx = openAdapter(c, selection, options, { platform: spec.platform, ext: spec.ext, mime: spec.mime, assumptions: spec.assumptions, suffix: spec.suffix });
  if (ctx.early) return ctx.early;
  const model = buildDocModel(ctx);
  ctx.mapping.add("document", "exact", mappingNote);
  ctx.mapping.add("languages", "unsupported", "One language per file.");
  if (hasErrors(ctx.diagnostics)) return ctx.result(false);
  return ctx.result(true, write(model, ctx));
}

// ---------------------------------------------------------------------------
// HTML (print view)
// ---------------------------------------------------------------------------

export const escapeHtml = (s: string): string => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");

/** Paragraphs are separated by a blank line, consecutive lines starting with "- " become a list. */
export function textBlocks(text: string): Array<{ kind: "p"; text: string } | { kind: "ul"; items: string[] }> {
  const out: Array<{ kind: "p"; text: string } | { kind: "ul"; items: string[] }> = [];
  for (const block of text.split(/\n\s*\n/)) {
    let list: string[] | null = null;
    let para: string[] = [];
    const flush = () => {
      if (para.length) out.push({ kind: "p", text: para.join("\n") });
      para = [];
    };
    for (const line of block.split("\n").filter((l) => l.trim() !== "")) {
      const m = /^\s*-\s+(.*)$/.exec(line);
      if (m) {
        flush();
        if (!list) {
          list = [];
          out.push({ kind: "ul", items: list });
        }
        list.push(m[1] as string);
      } else {
        list = null;
        para.push(line);
      }
    }
    flush();
  }
  return out;
}

/** "<" kept out of literal tag text: this file is bundled into an inline script of the single-file build. */
const LT = "<";
const html = (s: string): string => escapeHtml(s);
const htmlText = (text: string): string =>
  textBlocks(text)
    .map((b) => (b.kind === "p" ? `<p>${html(b.text).replace(/\n/g, "<br>")}</p>` : `<ul>${b.items.map((i) => `<li>${html(i)}</li>`).join("")}</ul>`))
    .join("");

const CSS = `
:root{color-scheme:light}
*{box-sizing:border-box}
body{font:11pt/1.5 system-ui,-apple-system,"Segoe UI",Roboto,Arial,sans-serif;color:#111;margin:0;background:#fff}
main{max-width:46rem;margin:0 auto;padding:1.5rem 1rem 3rem}
h1{font-size:1.7rem;margin:.2rem 0 1rem}
h2{font-size:1.2rem;margin:2rem 0 .5rem;padding-bottom:.2rem;border-bottom:2px solid #333}
h3{font-size:1.05rem;margin:1rem 0 .3rem}
.status{display:inline-block;border:2px solid #b45309;color:#7c2d12;background:#fef3c7;padding:.15rem .6rem;border-radius:.3rem;font-weight:600;margin-bottom:.5rem}
.box{border:1px solid #888;border-radius:.4rem;padding:.6rem .9rem;margin:1rem 0;background:#f7f7f7}
.item{margin:1rem 0;break-inside:avoid}
.q{font-weight:600}.num{display:inline-block;min-width:2rem}
.req{color:#b91c1c;font-weight:700}.hint,.cond{color:#555;font-size:.9rem;font-style:italic}
ul.opts{list-style:none;padding:0;margin:.3rem 0 0 2rem}ul.opts li{margin:.15rem 0}
.line{border-bottom:1px solid #333;height:1.6rem;margin:.3rem 0 0 2rem}.area{border:1px solid #333;height:5rem;margin:.3rem 0 0 2rem}
.scale{display:flex;justify-content:space-between;margin:.4rem 0 0 2rem;color:#333}
table.matrix{border-collapse:collapse;width:100%;margin:.5rem 0}table.matrix th,table.matrix td{border:1px solid #888;padding:.3rem .4rem;text-align:center;vertical-align:middle}
table.matrix td.l{text-align:left}table.matrix th{background:#eee;font-weight:600;font-size:.9rem}
.note-title{font-size:1.4rem;font-weight:700}.note-subtitle{font-size:1.15rem;font-weight:600}.note-notice{border-left:4px solid #1d4ed8;background:#eff6ff;padding:.4rem .8rem}
footer{margin-top:3rem;color:#666;font-size:.85rem;border-top:1px solid #ccc;padding-top:.5rem}
@media print{main{max-width:none;padding:0}.pb{break-before:page}h2{break-after:avoid}}
@page{margin:18mm}`;

function htmlOptions(o: DocOption[], mark: string, w: ReturnType<typeof wordsFor>): string {
  return `<ul class="opts">${o.map((x) => `<li>${mark} ${html(x.label)}${x.missing ? ` <span class="hint">(${html(w.missing)})</span>` : ""}</li>`).join("")}</ul>`;
}

function htmlAnswer(it: DocItem, w: ReturnType<typeof wordsFor>): string {
  switch (it.kind) {
    case "singleChoice":
      return `<div class="hint">${html(w.pick1)}</div>` + htmlOptions(it.options, "○", w);
    case "multipleChoice":
      return `<div class="hint">${html(w.pickMany)}${it.limits ? ` (${html(it.limits)})` : ""}</div>` + htmlOptions(it.options, "☐", w);
    case "ranking":
      return `<div class="hint">${html(w.rankHint)}</div><ul class="opts">${it.options.map((x) => `<li>▢ ${html(x.label)}</li>`).join("")}</ul>`;
    case "slider": {
      const l = it.labels ?? {};
      return `<div class="scale"><span>${html(l.min ?? String(it.minimum ?? ""))}</span><span>${html(l.mid ?? "")}</span><span>${html(l.max ?? String(it.maximum ?? ""))}</span></div><div class="line"></div>${it.limits ? `<div class="hint" style="margin-left:2rem">${html(it.limits)}</div>` : ""}`;
    }
    case "longText":
      return `<div class="area"></div>`;
    case "date":
      return `<div class="line" style="width:12rem"></div><div class="hint" style="margin-left:2rem">${html(w.date)}</div>`;
    case "integer":
    case "decimal":
      return `<div class="line" style="width:12rem"></div>${it.limits || it.unit ? `<div class="hint" style="margin-left:2rem">${html([it.limits, it.unit].filter(Boolean).join(" · "))}</div>` : ""}`;
    case "note":
      return "";
    default:
      return `<div class="line"></div>`;
  }
}

function htmlItem(it: DocItem, w: ReturnType<typeof wordsFor>): string {
  if (it.kind === "note") {
    const cls = `note-${it.style ?? "text"}`;
    return `<div class="item ${cls}" data-item="${html(it.id)}">${htmlText(it.text)}</div>`;
  }
  return (
    `<div class="item" data-item="${html(it.id)}">` +
    (it.condition ? `<div class="cond">${html(w.onlyIf)}: ${html(it.condition)}</div>` : "") +
    `<div class="q"><span class="num">${it.number}.</span>${html(it.text)}${it.required ? ` <span class="req" title="${html(w.required)}">*</span>` : ""}</div>` +
    (it.instruction ? `<div class="hint" style="margin-left:2rem">${html(it.instruction)}</div>` : "") +
    htmlAnswer(it, w) +
    `</div>`
  );
}

/** A matrix section: all items share one option set, so a table is the printed form of the battery. */
function isMatrix(s: DocSection): boolean {
  return (s.layout === "matrix" || s.layout === "table") && s.items.length > 1 && s.items.every((i) => i.kind === "singleChoice" && i.optionSetRef !== undefined && i.optionSetRef === s.items[0]?.optionSetRef);
}

function htmlSection(s: DocSection, w: ReturnType<typeof wordsFor>, first: boolean): string {
  const head = `<h2${s.pageBreakBefore && !first ? ' class="pb"' : ""}>${html(s.title)}</h2>${s.instruction ? `<p class="hint">${html(s.instruction)}</p>` : ""}`;
  if (isMatrix(s)) {
    const opts = s.items[0]!.options;
    return (
      `<section data-section="${html(s.id)}">${head}<table class="matrix"><thead><tr><th></th>${opts.map((o) => `<th>${html(o.label)}</th>`).join("")}</tr></thead><tbody>` +
      s.items.map((it) => `<tr data-item="${html(it.id)}"><td class="l">${it.number}. ${html(it.text)}${it.required ? ' <span class="req">*</span>' : ""}</td>${opts.map(() => "<td>○</td>").join("")}</tr>`).join("") +
      `</tbody></table></section>`
    );
  }
  return `<section data-section="${html(s.id)}">${head}${s.items.map((it) => htmlItem(it, w)).join("")}</section>`;
}

export function renderHtml(m: DocModel, lang: string): string {
  const w = wordsFor(lang);
  const box = (title: string | undefined, text: string) => `<div class="box">${title ? `<h3>${html(title)}</h3>` : ""}${htmlText(text)}</div>`;
  const body = [
    m.statusLabel ? `<div class="status">${html(m.statusLabel)}</div>` : "",
    `<h1>${html(m.title)}</h1>`,
    m.introduction ? htmlText(m.introduction) : "",
    m.consent ? box(m.consent.title, m.consent.text) + (m.consent.parentalConsentText ? box(undefined, m.consent.parentalConsentText) : "") : "",
    m.privacyNotice ? box(undefined, m.privacyNotice) : "",
    ...m.sections.map((s, i) => htmlSection(s, w, i === 0)),
    m.helpResources ? box(undefined, m.helpResources) : "",
    m.closingText ? `<div class="closing">${htmlText(m.closingText)}</div>` : "",
  ].join("\n");
  return (
    `<!doctype html>\n<html lang="${html(lang)}">\n<head>\n<meta charset="utf-8">\n<meta name="viewport" content="width=device-width,initial-scale=1">\n` +
    `<meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'">\n<title>${html(m.statusLabel ? `${m.statusLabel} ${m.title}` : m.title)}</title>\n${LT}style>${CSS}${LT}/style>\n</head>\n<body>\n<main>\n${body}\n<footer>${html(w.footer)}</footer>\n</main>\n</body>\n</html>\n`
  );
}

export function buildHtmlDocument(c: Catalog, selection: Parameters<typeof openAdapter>[1], options: AdapterOptions): AdapterResult {
  return build(
    c,
    selection,
    options,
    { platform: "html", ext: "html", mime: "text/html;charset=utf-8", suffix: "_print", assumptions: ["A page for people to read and print (Print to PDF in the browser). It is not an import file for a survey tool.", "The page contains no script and loads nothing from the internet."] },
    "Questionnaire as a printable HTML page; matrix sections become tables.",
    (m, ctx) => renderHtml(m, ctx.lang),
  );
}

// ---------------------------------------------------------------------------
// Markdown
// ---------------------------------------------------------------------------

/** Escapes characters that Markdown would interpret, and neutralizes raw HTML. */
export const escapeMd = (s: string): string => s.replace(/\\/g, "\\\\").replace(/([`*_{}[\]()#+!|~])/g, "\\$1").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/^(\s*)-/gm, "$1\\-").replace(/^(\s*)(\d+)\./gm, "$1$2\\.");

const mdText = (text: string): string =>
  textBlocks(text)
    .map((b) => (b.kind === "p" ? escapeMd(b.text).replace(/\n/g, "  \n") : b.items.map((i) => `- ${escapeMd(i)}`).join("\n")))
    .join("\n\n");

export function renderMarkdown(m: DocModel, lang: string): string {
  const w = wordsFor(lang);
  const out: string[] = [];
  if (m.statusLabel) out.push(`> **${escapeMd(m.statusLabel)}**`);
  out.push(`# ${escapeMd(m.title)}`);
  if (m.introduction) out.push(mdText(m.introduction));
  if (m.consent) {
    out.push(`> ${m.consent.title ? `**${escapeMd(m.consent.title)}**\n> \n> ` : ""}${mdText(m.consent.text).replace(/\n/g, "\n> ")}`);
    if (m.consent.parentalConsentText) out.push(`> ${mdText(m.consent.parentalConsentText).replace(/\n/g, "\n> ")}`);
  }
  if (m.privacyNotice) out.push(`> ${mdText(m.privacyNotice).replace(/\n/g, "\n> ")}`);
  for (const s of m.sections) {
    out.push(`## ${escapeMd(s.title)}`);
    if (s.instruction) out.push(`*${escapeMd(s.instruction)}*`);
    for (const it of s.items) {
      if (it.kind === "note") {
        out.push(it.style === "title" ? `### ${escapeMd(it.text)}` : it.style === "subtitle" ? `#### ${escapeMd(it.text)}` : it.style === "notice" ? `> ${mdText(it.text).replace(/\n/g, "\n> ")}` : mdText(it.text));
        continue;
      }
      const lines = [`**${it.number}.** ${escapeMd(it.text)}${it.required ? " \\*" : ""}`];
      if (it.condition) lines.push(`*${escapeMd(w.onlyIf)}: ${escapeMd(it.condition)}*`);
      if (it.instruction) lines.push(`*${escapeMd(it.instruction)}*`);
      const mark = it.kind === "multipleChoice" ? "☐" : it.kind === "singleChoice" ? "○" : "▢";
      if (it.options.length > 0) lines.push(it.options.map((o) => `- ${mark} ${escapeMd(o.label)}${o.missing ? ` *(${escapeMd(w.missing)})*` : ""}`).join("\n"));
      else if (it.kind === "slider") lines.push(`${escapeMd(it.labels?.min ?? String(it.minimum ?? ""))} … ${escapeMd(it.labels?.max ?? String(it.maximum ?? ""))}${it.limits ? ` (${escapeMd(it.limits)})` : ""}`);
      else if (it.limits) lines.push(`*(${escapeMd(it.limits)})*`);
      out.push(lines.join("\n\n"));
    }
  }
  if (m.helpResources) out.push(`> ${mdText(m.helpResources).replace(/\n/g, "\n> ")}`);
  if (m.closingText) out.push(mdText(m.closingText));
  out.push(`---\n*${escapeMd(w.footer)}*`);
  return out.join("\n\n") + "\n";
}

export function buildMarkdownDocument(c: Catalog, selection: Parameters<typeof openAdapter>[1], options: AdapterOptions): AdapterResult {
  return build(
    c,
    selection,
    options,
    { platform: "markdown", ext: "md", mime: "text/markdown;charset=utf-8", suffix: "_questionnaire", assumptions: ["A readable document, not an import file. Markdown characters in the texts are escaped."] },
    "Questionnaire as a Markdown document.",
    (m, ctx) => renderMarkdown(m, ctx.lang),
  );
}

// ---------------------------------------------------------------------------
// Neutral JSON
// ---------------------------------------------------------------------------

export const NEUTRAL_JSON_FORMAT = "mindmatters-neutral-questionnaire";
export const NEUTRAL_JSON_VERSION = "1.0.0";

export function buildNeutralJson(c: Catalog, selection: Parameters<typeof openAdapter>[1], options: AdapterOptions): AdapterResult {
  return build(
    c,
    selection,
    options,
    {
      platform: "json",
      ext: "json",
      mime: "application/json;charset=utf-8",
      suffix: "_neutral",
      assumptions: ["A flat, resolved copy of the selected questionnaire for your own scripts. Its structure is documented in docs/AUSGABEN.md and may grow in later versions (see formatVersion)."],
    },
    "Questionnaire as neutral JSON with resolved texts, answer options and conditions in one language.",
    (m, ctx) =>
      JSON.stringify(
        { format: NEUTRAL_JSON_FORMAT, formatVersion: NEUTRAL_JSON_VERSION, catalog: { id: c.catalog.id, version: c.catalog.version, status: c.catalog.status }, language: ctx.lang, testArtifact: ctx.test, ...m },
        null,
        2,
      ) + "\n",
  );
}
