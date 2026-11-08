/**
 * Questionnaire preview and answer previews.
 *
 * Shows the selected items in questionnaire order the way participants would see them, plus small disabled answer
 * controls for the question list. Nothing is collected: every control is disabled, there is no form, nothing is
 * stored. Conditions are shown as a structure preview, not simulated. Texts follow content.ts: locked items show
 * no wording, a text missing in the chosen language is marked and never replaced silently.
 */

import { templateOrder } from "../../core/structure";
import type { Item, Option, OptionSet, Section } from "../../core/types";
import { conditionText, displayDecision, shownText } from "../content";
import { h, richText } from "../dom";
import { t } from "../i18n";
import type { AppState } from "../state";
import type { ViewContext } from "./registry";

/**
 * Preview (spec A10): the selected items in questionnaire order with instructions,
 * participant help and answer format. Empty sections disappear. Nothing is
 * collected: every control is disabled, there is no form and nothing is stored.
 * Conditions are shown as a structure preview, not simulated.
 */
export function renderPreview({ state: s }: ViewContext): HTMLElement {
  const loaded = s.loaded;
  if (!loaded) return h("p", { class: "muted" }, t("import.noCatalog"));
  const c = loaded.catalog;
  const q = c.questionnaire;
  const order = templateOrder(c);
  const selected = c.items.filter((i) => s.selection.has(i.id)).sort((a, b) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0));

  const frag: Array<Node | null> = [];
  const title = shownText(s, q.title);
  frag.push(h("h2", { class: "pv-title" }, title?.text ?? q.id));
  const para = (lt: Record<string, string> | undefined, cls = "pv-block") => {
    const x = shownText(s, lt);
    return x ? h("div", { class: cls }, richText(x.text), x.fallback ? fallbackMark(x.language) : null) : null;
  };
  frag.push(para(q.introduction, "pv-block pv-intro"));
  if (q.consent) {
    const ct = shownText(s, q.consent.title);
    frag.push(h("section", { class: "pv-callout", "aria-label": t("preview.consent") }, h("h3", null, ct?.text ?? t("preview.consent")), para(q.consent.text), para(q.consent.parentalConsentText)));
  }
  frag.push(q.privacyNotice ? h("section", { class: "pv-callout", "aria-label": t("preview.privacy") }, h("h3", null, t("preview.privacy")), para(q.privacyNotice)) : null);

  if (selected.length === 0) frag.push(h("p", { class: "muted", role: "status" }, t("preview.empty")));

  for (const section of q.sections) {
    const items = section.itemRefs.map((id) => selected.find((i) => i.id === id)).filter((i): i is Item => !!i);
    if (items.length === 0) continue; // an empty section disappears with its instruction (B15)
    const st = shownText(s, section.title);
    frag.push(
      h(
        "section",
        { class: "pv-section" },
        st ? h("h3", { class: "pv-section-title" }, st.text) : null,
        para(section.instruction, "pv-block pv-section-instruction"),
        renderSectionItems(s, section, items),
      ),
    );
  }

  frag.push(q.helpResources ? h("section", { class: "pv-callout", "aria-label": t("preview.help") }, h("h3", null, t("preview.help")), para(q.helpResources)) : null);
  frag.push(para(q.closingText, "pv-block pv-closing"));
  frag.push(h("p", { class: "muted pv-end" }, t("preview.end")));

  return h(
    "section",
    { class: "card", "aria-labelledby": "preview-h" },
    h("h2", { id: "preview-h", class: "visually-hidden" }, t("tab.preview.heading")),
    h("p", { class: "banner banner-info", role: "note" }, h("strong", null, t("preview.notice"))),
    h("div", { class: "pv", lang: s.language }, ...frag),
  );
}

function fallbackMark(lang: string): HTMLElement {
  return h("span", { class: "badge pv-fallback" }, t("preview.fallback", { lang }));
}

function optionSetOf(s: AppState, item: Item): OptionSet | undefined {
  return item.response.optionSetRef ? s.loaded!.catalog.optionSets.find((o) => o.id === item.response.optionSetRef) : undefined;
}

/** Matrix/table sections render items that share one option set as a table; anything else falls back to a list. */
function renderSectionItems(s: AppState, section: Section, items: Item[]): HTMLElement {
  if (section.layout === "matrix" || section.layout === "table") {
    const sets = items.map((i) => (i.response.kind === "singleChoice" ? i.response.optionSetRef : undefined));
    const first = sets[0];
    // A matrix must never swallow content an item carries (warning for sensitive items, instruction,
    // help, condition) or show locked items: in those cases the faithful list is rendered instead.
    const plain = (i: Item) => !i.sensitivity && !i.instruction && !i.respondentHelp && !i.visibleWhen;
    const allowed = new Set(displayDecision(s.loaded!.catalog).allowedItemIds);
    if (first && sets.every((x) => x === first) && items.every((i) => allowed.has(i.id) && plain(i))) {
      return matrix(s, items, optionSetOf(s, items[0] as Item) as OptionSet);
    }
  }
  return h("div", { class: "pv-items" }, ...items.map((i) => renderItem(s, i)));
}

function matrix(s: AppState, items: Item[], os: OptionSet): HTMLElement {
  const label = (o: Option) => shownText(s, o.label)?.text ?? o.code;
  const table = h(
    "table",
    { class: "pv-matrix", "aria-label": t("preview.matrixLabel") },
    h("thead", null, h("tr", null, h("th", { scope: "col" }), ...os.options.map((o) => h("th", { scope: "col" }, label(o))))),
    h(
      "tbody",
      null,
      ...items.map((it) => {
        const text = shownText(s, it.text)!;
        return h(
          "tr",
          { "data-item": it.id },
          h("th", { scope: "row" }, text.text, requirement(it)),
          ...os.options.map((o) => h("td", null, h("input", { type: "radio", disabled: true, name: `pv-${it.id}`, "aria-label": `${text.text}: ${label(o)}` }))),
        );
      }),
    ),
  );
  // On narrow screens the table scrolls inside its own region instead of widening the page.
  return h("div", { class: "pv-matrix-wrap", role: "region", tabindex: "0", "aria-label": t("preview.matrixLabel") }, table);
}

function requirement(item: Item): HTMLElement {
  return h("span", { class: "pv-req" }, ` (${item.answerRequired ? t("preview.required") : t("preview.optional")})`);
}

function renderItem(s: AppState, item: Item): HTMLElement {
  const c = s.loaded!.catalog;
  const r = item.response;

  if (!displayDecision(c).allowedItemIds.includes(item.id)) {
    return h("div", { class: "pv-item pv-locked", "data-item": item.id }, h("em", null, t("preview.locked", { id: item.id })));
  }
  const text = shownText(s, item.text);
  const body = text ? richText(text.text) : document.createTextNode(item.id);

  // text blocks: title, subtitle, notice, text
  if (r.kind === "note") {
    const style = r.style ?? "text";
    const content = h("div", { class: "pv-note-body" }, body, text?.fallback ? fallbackMark(text.language) : null);
    if (style === "title") return h("div", { class: "pv-item pv-note", "data-item": item.id }, h("h3", { class: "pv-note-title" }, text?.text ?? item.id));
    if (style === "subtitle") return h("div", { class: "pv-item pv-note", "data-item": item.id }, h("h4", { class: "pv-note-subtitle" }, text?.text ?? item.id));
    if (style === "notice") return h("div", { class: "pv-item pv-note pv-callout", role: "note", "data-item": item.id }, content);
    return h("div", { class: "pv-item pv-note", "data-item": item.id }, content);
  }

  const horizontal = item.presentation?.orientation === "horizontal";
  const extras: Array<Node | null> = [];
  const sens = item.sensitivity;
  if (sens && (sens.warningText || sens.helpResourcesText)) {
    extras.push(
      h(
        "div",
        { class: "pv-callout pv-sensitive", role: "note" },
        h("strong", null, t("preview.sensitive") + ": "),
        sens.warningText ? richText(shownText(s, sens.warningText)?.text ?? "") : null,
        sens.helpResourcesText ? richText(shownText(s, sens.helpResourcesText)?.text ?? "") : null,
      ),
    );
  }
  const instruction = shownText(s, item.instruction);
  const help = shownText(s, item.respondentHelp);

  return h(
    "fieldset",
    { class: "pv-item pv-question", "data-item": item.id },
    h("legend", null, h("span", { class: "pv-qtext" }, body), requirement(item), text?.fallback ? fallbackMark(text.language) : null),
    ...extras,
    instruction ? h("p", { class: "pv-instruction" }, instruction.text) : null,
    help ? h("p", { class: "pv-help muted" }, help.text) : null,
    h("div", { class: `pv-answers${horizontal ? " pv-horizontal" : ""}` }, ...control(s, item)),
    item.presentation?.optionOrder === "random" ? h("p", { class: "muted pv-hint" }, t("preview.randomOrder")) : null,
    item.visibleWhen ? h("p", { class: "muted pv-hint pv-cond" }, t("preview.condition", { cond: conditionText(item.visibleWhen) })) : null,
  );
}

/** The (disabled) control for an answer type. */
function control(s: AppState, item: Item): Node[] {
  const r = item.response;
  const os = optionSetOf(s, item);
  const optionLabel = (o: Option) => {
    const x = shownText(s, o.label);
    return h("span", null, x?.text ?? o.code, x?.fallback ? fallbackMark(x.language) : null);
  };
  const name = `pv-${item.id}`;

  switch (r.kind) {
    case "singleChoice": {
      if (!os) return [];
      if (item.presentation?.widget === "dropdown") {
        return [h("select", { disabled: true, "aria-label": shownText(s, item.text)?.text ?? item.id }, h("option", null, ""), ...os.options.map((o) => h("option", { value: o.code }, shownText(s, o.label)?.text ?? o.code)))];
      }
      return os.options.map((o) => h("label", { class: "pv-opt" }, h("input", { type: "radio", name, disabled: true, value: o.code }), " ", optionLabel(o)));
    }
    case "multipleChoice": {
      if (!os) return [];
      const min = r.minSelections;
      const max = r.maxSelections;
      const hint = min !== undefined || max !== undefined ? t("preview.multiHint", { min: min ?? 0, max: max ?? os.options.length }) : t("preview.multiHintOpen");
      const excl = r.exclusiveCodes?.length ? h("p", { class: "muted pv-hint" }, t("preview.exclusive", { codes: r.exclusiveCodes.join(", ") })) : null;
      return [
        h("p", { class: "muted pv-hint" }, hint),
        ...os.options.map((o) => h("label", { class: "pv-opt" }, h("input", { type: "checkbox", name, disabled: true, value: o.code }), " ", optionLabel(o))),
        excl as Node,
      ].filter(Boolean) as Node[];
    }
    case "integer":
    case "decimal": {
      const step = r.kind === "integer" ? "1" : r.maxDecimalPlaces !== undefined ? String(Math.pow(10, -r.maxDecimalPlaces)) : "any";
      const input = h("input", { type: "number", disabled: true, min: r.minimum, max: r.maximum, step, "aria-label": shownText(s, item.text)?.text ?? item.id });
      return r.unit ? [input, h("span", { class: "pv-unit" }, " " + (shownText(s, r.unit.label)?.text ?? r.unit.code))] : [input];
    }
    case "shortText":
      return [h("input", { type: r.format === "email" ? "email" : r.format === "url" ? "url" : r.format === "phone" ? "tel" : "text", disabled: true, maxlength: r.maxLength, "aria-label": shownText(s, item.text)?.text ?? item.id })];
    case "longText":
      return [h("textarea", { disabled: true, rows: 4, maxlength: r.maxLength, "aria-label": shownText(s, item.text)?.text ?? item.id })];
    case "date":
      return [h("input", { type: "date", disabled: true, min: r.minimum as string | undefined, max: r.maximum as string | undefined, "aria-label": shownText(s, item.text)?.text ?? item.id })];
    case "slider": {
      const lo = shownText(s, r.labels?.min)?.text;
      const hi = shownText(s, r.labels?.max)?.text;
      const mid = shownText(s, r.labels?.mid)?.text;
      return [
        h("div", { class: "pv-slider" }, lo ? h("span", null, lo) : null, h("input", { type: "range", disabled: true, min: r.minimum, max: r.maximum, step: r.step ?? 1, "aria-label": shownText(s, item.text)?.text ?? item.id }), hi ? h("span", null, hi) : null),
        mid ? h("p", { class: "muted pv-hint" }, mid) : null,
        h("p", { class: "muted pv-hint" }, t("preview.sliderRange", { min: r.minimum as number, max: r.maximum as number })),
      ].filter(Boolean) as Node[];
    }
    case "ranking": {
      if (!os) return [];
      return [
        h("p", { class: "muted pv-hint" }, r.maxRanks ? t("preview.rank", { n: r.maxRanks }) : t("preview.rankAll")),
        h("ol", { class: "pv-rank" }, ...os.options.filter((o) => o.role === "substantive").map((o) => h("li", null, optionLabel(o)))),
      ];
    }
    default:
      return [];
  }
}

/** One question or text block exactly as the preview shows it (used for the module preview in the list). */
export function renderItemPreview(s: AppState, item: Item): HTMLElement {
  return renderItem(s, item);
}

/**
 * The answer options of a question as small, disabled controls, for the question list. Text blocks and
 * locked items have none. Choice answers are laid out in a row so a whole scale is visible at a glance.
 */
export function answerPreview(s: AppState, item: Item): HTMLElement | null {
  if (item.response.kind === "note") return null;
  if (!displayDecision(s.loaded!.catalog).allowedItemIds.includes(item.id)) return null;
  const nodes = control(s, item);
  if (nodes.length === 0) return null;
  return h("div", { class: "answer-preview", role: "group", "aria-label": t("items.answerPreviewLabel") }, h("div", { class: "pv-answers pv-horizontal" }, ...nodes));
}
