import { CUSTOMIZABLE_TEXTS, CustomBlock, CustomizableText, LocalizedText } from "../../core/types";
import { baseText, catalogNotes, isLocked, isNoteLocked } from "../../model/customize";
import { h, richText } from "../dom";
import { t, TextKey } from "../i18n";
import {
  addCustomBlock,
  removeCustomBlock,
  resetCustomText,
  resetNoteText,
  setNoteText,
  setCustomBlockText,
  setCustomText,
  updateCustomBlock,
} from "../state";
import type { AppState, Store } from "../state";
import { adminText } from "../content";
import type { ViewContext } from "./registry";

/**
 * Adapt texts: the school changes title, introduction, closing, privacy, help and consent texts (unless the
 * catalog locks them) and adds its own text blocks. Questions and answer options are never touched here.
 * Edits are applied when a field is left (change event), so typing never re-renders under the cursor.
 */

const STYLES: Array<CustomBlock["style"]> = ["title", "subtitle", "text", "notice"];

export function renderTexts({ state: s, store }: ViewContext): HTMLElement {
  if (!s.loaded) return h("p", { class: "muted" }, t("import.noCatalog"));
  const eff = s.loaded.catalog;
  const lang = s.language;

  const keys = CUSTOMIZABLE_TEXTS.filter((k) => {
    if (k === "consentTitle" || k === "parentalConsentText") return !!eff.questionnaire.consent;
    return true;
  });

  return h(
    "section",
    { class: "card", "aria-labelledby": "texts-h" },
    h("h2", { id: "texts-h" }, t("texts.title")),
    h("p", { class: "muted" }, t("view.texts.intro")),
    h("p", { class: "banner banner-info", role: "note" }, h("strong", null, t("texts.lang", { lang })), " ", t("texts.saveHint")),
    h("h3", null, t("texts.fixedTitle")),
    h("div", { class: "text-fields" }, ...keys.map((k) => textField(s, store, k))),
    h("h3", { class: "texts-blocks-h" }, t("texts.notesTitle")),
    h("p", { class: "muted" }, t("texts.notesIntro")),
    h("div", { class: "text-fields", id: "catalog-notes" }, ...catalogNotes(s.loaded.base).map((n) => noteField(s, store, n.id))),
    h("h3", { class: "texts-blocks-h" }, t("texts.blocksTitle")),
    h("p", { class: "muted" }, t("texts.blocksIntro")),
    h("p", { class: "muted small" }, t("texts.catalogBlocks")),
    newBlockForm(s, store),
    blockList(s, store),
  );
}

function missingLanguages(c: AppState["loaded"], lt: LocalizedText | undefined): string[] {
  if (!c || !lt) return [];
  return c.catalog.languages.filter((l) => lt[l] === undefined);
}

function textField(s: AppState, store: Store, key: CustomizableText): HTMLElement {
  const base = s.loaded!.base;
  const locked = isLocked(base, key);
  const original = baseText(base, key);
  const lang = s.language;
  const override = s.customization.textOverrides?.[key];
  const effective = override?.[lang] ?? original?.[lang] ?? "";
  const originalHere = original?.[lang] ?? original?.[base.catalog.defaultLanguage];
  const id = `text-${key}`;
  const adapted = !!override && Object.keys(override).length > 0;
  const lt: LocalizedText | undefined = adapted ? { ...(original ?? {}), ...override } : original;
  const missing = locked ? [] : missingLanguages(s.loaded, lt);

  const area = h("textarea", {
    id,
    rows: key === "title" || key === "consentTitle" ? 2 : 5,
    "data-focus": id,
    disabled: locked,
    "aria-describedby": `${id}-help`,
    value: effective,
    on: {
      change: (ev) => {
        const v = (ev.target as HTMLTextAreaElement).value;
        // the original wording typed back in is no adaptation
        setCustomText(store, key, lang, original?.[lang] === v ? "" : v);
      },
    },
  });

  return h(
    "div",
    { class: `text-field${locked ? " is-locked" : ""}`, "data-text": key },
    h(
      "div",
      { class: "text-field-head" },
      h("label", { for: id }, h("strong", null, t(`texts.key.${key}` as TextKey))),
      locked ? h("span", { class: "badge badge-locked" }, "🔒 " + t("texts.locked")) : null,
      adapted ? h("span", { class: "badge badge-adapted" }, t("texts.edited")) : null,
    ),
    area,
    h(
      "div",
      { class: "text-field-help muted small", id: `${id}-help` },
      ...(original ? [t("texts.original") + ": ", h("q", null, truncate(originalHere ?? "", 160))] : [t("texts.noOriginal")]),
    ),
    missing.length > 0 && (adapted || original) ? h("p", { class: "small warn-text" }, "! " + t("texts.missingLang", { langs: missing.join(", ") })) : null,
    adapted && !locked
      ? h("button", { type: "button", class: "btn btn-small", "data-focus": `${id}-reset`, on: { click: () => resetCustomText(store, key) } }, t("texts.reset"))
      : null,
  );
}

function noteField(s: AppState, store: Store, itemId: string): HTMLElement {
  const base = s.loaded!.base;
  const item = base.items.find((i) => i.id === itemId)!;
  const section = base.questionnaire.sections.find((x) => x.itemRefs.includes(itemId));
  const locked = isNoteLocked(base, itemId);
  const lang = s.language;
  const override = s.customization.noteOverrides?.[itemId];
  const original = item.text;
  const effective = override?.[lang] ?? original[lang] ?? "";
  const originalHere = original[lang] ?? original[base.catalog.defaultLanguage];
  const id = `note-${itemId}`;
  const adapted = !!override && Object.keys(override).length > 0;
  const missing = locked ? [] : missingLanguages(s.loaded, adapted ? { ...original, ...override } : original);
  const style = (item.response.kind === "note" ? item.response.style : undefined) ?? "text";
  const label = t("texts.noteLabel", { style: t(`texts.style.${style}` as TextKey), section: (section && adminText(s, section.title)) || section?.id || "" });

  return h(
    "div",
    { class: `text-field${locked ? " is-locked" : ""}`, "data-note": itemId },
    h(
      "div",
      { class: "text-field-head" },
      h("label", { for: id }, h("strong", null, label)),
      locked ? h("span", { class: "badge badge-locked" }, "🔒 " + t("texts.locked")) : null,
      adapted ? h("span", { class: "badge badge-adapted" }, t("texts.edited")) : null,
    ),
    h("textarea", {
      id,
      rows: style === "title" || style === "subtitle" ? 2 : 5,
      "data-focus": id,
      disabled: locked,
      "aria-describedby": `${id}-help`,
      value: effective,
      on: {
        change: (ev) => {
          const v = (ev.target as HTMLTextAreaElement).value;
          setNoteText(store, itemId, lang, original[lang] === v ? "" : v);
        },
      },
    }),
    h("div", { class: "text-field-help muted small", id: `${id}-help` }, t("texts.original") + ": ", h("q", null, truncate(originalHere ?? "", 160))),
    missing.length > 0 ? h("p", { class: "small warn-text" }, "! " + t("texts.missingLang", { langs: missing.join(", ") })) : null,
    adapted && !locked ? h("button", { type: "button", class: "btn btn-small", "data-focus": `${id}-reset`, on: { click: () => resetNoteText(store, itemId) } }, t("texts.reset")) : null,
  );
}

const truncate = (x: string, n: number) => (x.length > n ? x.slice(0, n - 1).trimEnd() + "…" : x.replace(/\s+/g, " "));

function sectionOptions(s: AppState): Array<[string, string]> {
  return s.loaded!.catalog.questionnaire.sections.map((sec): [string, string] => [sec.id, adminText(s, sec.title) ?? sec.id]);
}

/** Positions inside a section: its start, or after each of its items (own blocks included). */
function positionOptions(s: AppState, sectionId: string, exceptId?: string): Array<[string, string]> {
  const c = s.loaded!.catalog;
  const sec = c.questionnaire.sections.find((x) => x.id === sectionId);
  const out: Array<[string, string]> = [["", t("texts.atStart")]];
  for (const id of sec?.itemRefs ?? []) {
    if (id === exceptId) continue;
    const it = c.items.find((i) => i.id === id);
    const text = it ? adminText(s, it.text) : undefined;
    out.push([id, t("texts.after", { text: truncate(text ?? id, 60) })]);
  }
  return out;
}

function select(id: string, label: string, value: string, options: Array<[string, string]>, onChange: (v: string) => void): HTMLElement {
  return h(
    "div",
    { class: "field" },
    h("label", { for: id }, label),
    h("select", { id, "data-focus": id, on: { change: (ev) => onChange((ev.target as HTMLSelectElement).value) } }, ...options.map(([v, text]) => h("option", { value: v, selected: v === value }, text))),
  );
}

/** Local form state of the "new block" form: kept in the DOM, not in the store (nothing to save before it is added). */
function newBlockForm(s: AppState, store: Store): HTMLElement {
  const sections = sectionOptions(s);
  const lang = s.language;
  let style: CustomBlock["style"] = "text";
  let section = sections[0]?.[0] ?? "";
  let after = "";
  const posHost = h("div", { class: "field-host" });
  const area = h("textarea", { id: "new-block-text", rows: 4, "data-focus": "new-block-text", "aria-describedby": "new-block-format" });
  const msg = h("p", { class: "small warn-text", role: "status", id: "new-block-msg" });

  const renderPos = () => {
    posHost.replaceChildren(
      select("new-block-pos", t("texts.position"), after, positionOptions(s, section), (v) => {
        after = v;
      }),
    );
  };
  renderPos();

  return h(
    "div",
    { class: "new-block card-inner" },
    h("h4", null, t("texts.newBlock")),
    h(
      "div",
      { class: "filters" },
      select("new-block-style", t("texts.style"), style, STYLES.map((x): [string, string] => [x, t(`texts.style.${x}` as TextKey)]), (v) => {
        style = v as CustomBlock["style"];
      }),
      select("new-block-section", t("texts.section"), section, sections, (v) => {
        section = v;
        after = "";
        renderPos();
      }),
      posHost,
    ),
    h("label", { for: "new-block-text" }, t("texts.content", { lang })),
    area,
    h("p", { class: "muted small", id: "new-block-format" }, t("texts.format")),
    msg,
    h(
      "button",
      {
        type: "button",
        class: "btn btn-primary",
        id: "new-block-add",
        "data-focus": "new-block-add",
        on: {
          click: () => {
            const text = (area as HTMLTextAreaElement).value;
            if (text.trim() === "" || !section) {
              msg.textContent = t("texts.emptyAdd");
              return;
            }
            addCustomBlock(store, section, after || null, style, lang, text);
          },
        },
      },
      t("texts.add"),
    ),
  );
}

function blockList(s: AppState, store: Store): HTMLElement {
  const blocks = s.customization.customBlocks ?? [];
  if (blocks.length === 0) return h("p", { class: "muted", id: "no-blocks" }, t("texts.noBlocks"));
  return h("ul", { class: "block-list" }, ...blocks.map((b) => blockCard(s, store, b)));
}

function blockCard(s: AppState, store: Store, b: CustomBlock): HTMLElement {
  const lang = s.language;
  const id = `block-${b.id}`;
  const missing = s.loaded!.catalog.languages.filter((l) => b.text[l] === undefined);
  const sections = sectionOptions(s);
  const text = b.text[lang] ?? "";
  return h(
    "li",
    { class: "block-card card-inner", "data-block": b.id },
    h("h4", null, t("texts.blockLabel", { id: b.id })),
    h(
      "div",
      { class: "filters" },
      select(`${id}-style`, t("texts.style"), b.style, STYLES.map((x): [string, string] => [x, t(`texts.style.${x}` as TextKey)]), (v) => updateCustomBlock(store, b.id, { style: v as CustomBlock["style"] })),
      select(`${id}-section`, t("texts.section"), b.sectionRef, sections, (v) => updateCustomBlock(store, b.id, { sectionRef: v, afterItemRef: null })),
      select(`${id}-pos`, t("texts.position"), b.afterItemRef ?? "", positionOptions(s, b.sectionRef, b.id), (v) => updateCustomBlock(store, b.id, { afterItemRef: v || null })),
    ),
    h("label", { for: `${id}-text` }, t("texts.content", { lang })),
    h("textarea", {
      id: `${id}-text`,
      rows: 4,
      "data-focus": `${id}-text`,
      value: text,
      on: { change: (ev) => setCustomBlockText(store, b.id, lang, (ev.target as HTMLTextAreaElement).value) },
    }),
    missing.length > 0 ? h("p", { class: "small warn-text" }, "! " + t("texts.missingLang", { langs: missing.join(", ") })) : null,
    h("div", { class: `block-sample block-sample-${b.style}`, "aria-hidden": "true" }, richText(text)),
    h("button", { type: "button", class: "btn btn-small", "data-focus": `${id}-remove`, on: { click: () => removeCustomBlock(store, b.id) } }, t("texts.remove")),
  );
}
