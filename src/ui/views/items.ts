/**
 * Questions and modules view: search, filters, selection and the info buttons.
 *
 * Selection changes go through state.ts (which uses model/selection), never through the DOM: a checkbox only
 * displays the state. Filters change what is listed, not the selection or the output order. Item texts are only
 * shown where the display rights allow it (content.itemText); search does not look into locked texts.
 */

import type { Item, Module } from "../../core/types";
import { mandatoryReasons } from "../../model/selection";
import { templateOrder } from "../../core/structure";
import { diagnosticsList } from "../components";
import { adminText, conditionText, displayDecision, itemMatches, itemText, mandatoryOf, styleLabel } from "../content";
import { h } from "../dom";
import { t } from "../i18n";
import {
  counts,
  deselectAllOptional,
  openInfo,
  restoreInitialSelection,
  setPreviewOpen,
  setShowAnswers,
  selectionDiagnostics,
  setFilter,
  switchModule,
  toggleItem,
} from "../state";
import { answerPreview, renderItemPreview } from "./preview";
import type { ViewContext } from "./registry";

/** Questions and modules: search, filters, selection and the info buttons. */
export function renderItems({ state: s, store }: ViewContext): HTMLElement {
  const loaded = s.loaded;
  if (!loaded) return h("p", { class: "muted" }, t("import.noCatalog"));
  const c = loaded.catalog;
  const order = templateOrder(c);
  const byTemplate = (a: Item, b: Item) => (order.get(a.id) ?? 0) - (order.get(b.id) ?? 0);
  const visible = c.items.filter((i) => itemMatches(s, i));
  const visibleIds = new Set(visible.map((i) => i.id));
  const cnt = counts(s);

  // groups: modules in catalog order, then items without module
  const inModule = new Set(c.modules.flatMap((m) => m.itemRefs));
  const groups: Array<{ module?: Module; items: Item[] }> = c.modules.map((m) => ({
    module: m,
    items: m.itemRefs.map((id) => c.items.find((i) => i.id === id)).filter((i): i is Item => !!i && visibleIds.has(i.id)).sort(byTemplate),
  }));
  groups.push({ items: visible.filter((i) => !inModule.has(i.id)).sort(byTemplate) });

  const hints = selectionDiagnostics(s).filter((d) => d.severity !== "info");

  return h(
    "section",
    { class: "card", "aria-labelledby": "items-h" },
    h("h2", { id: "items-h" }, t("tab.items")),
    h(
      "ul",
      { class: "counts" },
      h("li", null, t("summary.items", { n: cnt.items })),
      h("li", null, t("summary.modules", { n: cnt.modules })),
      h("li", null, t("summary.mandatory", { n: cnt.mandatory })),
      h("li", null, t("items.shown", { shown: visible.length, total: c.items.length })),
    ),
    filterBar(ctxOf(s, store)),
    h("p", { class: "muted" }, t("items.filterNote")),
    hints.length > 0 ? h("div", { class: "hints", role: "group", "aria-label": t("items.hintsTitle") }, h("h3", null, t("items.hintsTitle")), diagnosticsList(hints)) : null,
    h(
      "div",
      { class: "toolbar" },
      h(
        "label",
        { class: "check-inline", for: "show-answers" },
        h("input", { id: "show-answers", type: "checkbox", checked: s.showAnswers, "data-focus": "show-answers", on: { change: (ev) => setShowAnswers(store, (ev.target as HTMLInputElement).checked) } }),
        " ",
        t("items.showAnswers"),
      ),
      h("button", { type: "button", class: "btn", "data-focus": "deselect-all", on: { click: () => deselectAllOptional(store) } }, t("items.deselectAll")),
      h("button", { type: "button", class: "btn", "data-focus": "restore", on: { click: () => restoreInitialSelection(store) } }, t("items.restore")),
    ),
    visible.length === 0
      ? h("p", { class: "muted", role: "status" }, t("items.noMatch"))
      : h(
          "div",
          { class: "groups", role: "group", "aria-label": t("items.listLabel") },
          ...groups.filter((g) => g.items.length > 0).map((g) => renderGroup(ctxOf(s, store), g.module, g.items)),
        ),
  );
}

type Ctx = Pick<ViewContext, "state" | "store">;
const ctxOf = (state: ViewContext["state"], store: ViewContext["store"]): Ctx => ({ state, store });

function filterBar({ state: s, store }: Ctx): HTMLElement {
  const c = s.loaded!.catalog;
  let composing = false;
  const search = h("input", {
    id: "filter-query",
    type: "search",
    value: s.filter.query,
    placeholder: t("items.searchHint"),
    autocomplete: "off",
    "data-focus": "filter-query",
    on: {
      compositionstart: () => (composing = true),
      compositionend: (ev) => {
        composing = false;
        setFilter(store, { query: (ev.target as HTMLInputElement).value });
      },
      input: (ev) => {
        if (!composing && !(ev as InputEvent).isComposing) setFilter(store, { query: (ev.target as HTMLInputElement).value });
      },
    },
  });
  const select = (id: string, label: string, value: string, options: Array<[string, string]>, on: (v: string) => void) =>
    h(
      "div",
      { class: "field" },
      h("label", { for: id }, label),
      h(
        "select",
        { id, "data-focus": id, on: { change: (ev) => on((ev.target as HTMLSelectElement).value) } },
        ...options.map(([v, text]) => h("option", { value: v, selected: v === value }, text)),
      ),
    );
  return h(
    "div",
    { class: "filters", role: "search" },
    h("div", { class: "field field-wide" }, h("label", { for: "filter-query" }, t("items.search")), search),
    select(
      "filter-scope",
      t("items.scope"),
      s.filter.scope,
      [
        ["all", t("items.scope.all")],
        ["selected", t("items.scope.selected")],
        ["mandatory", t("items.scope.mandatory")],
        ["optional", t("items.scope.optional")],
      ],
      (v) => setFilter(store, { scope: v as typeof s.filter.scope }),
    ),
    c.modules.length > 0
      ? select(
          "filter-module",
          t("items.module"),
          s.filter.moduleId,
          [["", t("items.allModules")], ...c.modules.map((m): [string, string] => [m.id, adminText(s, m.title) ?? m.id])],
          (v) => setFilter(store, { moduleId: v }),
        )
      : null,
    c.constructs.length > 0
      ? select(
          "filter-construct",
          t("items.construct"),
          s.filter.constructId,
          [["", t("items.allConstructs")], ...c.constructs.map((k): [string, string] => [k.id, adminText(s, k.label) ?? k.id])],
          (v) => setFilter(store, { constructId: v }),
        )
      : null,
  );
}

function renderGroup({ state: s, store }: Ctx, module: Module | undefined, items: Item[]): HTMLElement {
  const c = s.loaded!.catalog;
  const reasons = mandatoryReasons(c);
  const heading = module ? (adminText(s, module.title) ?? module.id) : t("items.noModule");
  const mandatoryModule = !!module && module.selectionMode === "allOrNothing" && module.inclusionRequired;

  const head = h(
    "div",
    { class: "group-head" },
    h("h3", null, heading),
    module && mandatoryModule ? h("span", { class: "badge badge-mandatory" }, t("items.moduleMandatory")) : null,
    module && module.selectionMode === "allOrNothing" && !mandatoryModule ? h("span", { class: "badge" }, t("items.moduleWhole")) : null,
    module
      ? h(
          "span",
          { class: "group-actions" },
          h("button", { type: "button", class: "btn btn-small", "data-focus": `mod-all-${module.id}`, on: { click: () => switchModule(store, module.id, true) } }, t("items.moduleAll")),
          " ",
          h("button", { type: "button", class: "btn btn-small", "data-focus": `mod-none-${module.id}`, on: { click: () => switchModule(store, module.id, false) } }, t("items.moduleNone")),
          " ",
          h(
            "button",
            { type: "button", class: "btn btn-small info-btn", "aria-label": t("items.moduleInfo", { id: module.id }), "data-focus": `info-module-${module.id}`, on: { click: () => openInfo(store, { kind: "module", id: module.id }) } },
            "i",
          ),
        )
      : null,
  );
  const desc = module && adminText(s, module.description);
  const chosen = module ? module.itemRefs.filter((id) => s.selection.has(id)).length : items.filter((i) => s.selection.has(i.id)).length;
  const total = module ? module.itemRefs.length : items.length;
  return h(
    "section",
    { class: "group", "aria-label": heading },
    head,
    h("p", { class: "muted group-count" }, t("items.selectedOf", { n: chosen, m: total })),
    desc ? h("p", { class: "muted" }, desc) : null,
    module ? modulePreview({ state: s, store }, module) : null,
    h("ul", { class: "items" }, ...items.map((it) => renderRow({ state: s, store }, it, reasons.has(it.id)))),
  );
}

/** "How the module looks in the survey": the module's items as participants see them, rendered only when opened. */
function modulePreview({ state: s, store }: Ctx, module: Module): HTMLElement {
  const open = s.openPreviews.includes(module.id);
  const c = s.loaded!.catalog;
  const body = open ? h("div", { class: "pv module-pv", lang: s.language }, ...module.itemRefs.map((id) => c.items.find((i) => i.id === id)).filter((i): i is Item => !!i).map((i) => renderItemPreview(s, i))) : null;
  return h(
    "details",
    {
      class: "module-preview",
      open,
      on: { toggle: (ev) => setPreviewOpen(store, module.id, (ev.target as HTMLDetailsElement).open) },
    },
    h("summary", { "data-focus": `mod-preview-${module.id}` }, t("items.modulePreview")),
    body,
  );
}

function renderRow({ state: s, store }: Ctx, item: Item, mandatory: boolean): HTMLElement {
  const shown = itemText(s, item);
  const isNote = item.response.kind === "note";
  const checkboxId = `item-${item.id}`;
  const label =
    shown.kind === "locked"
      ? t("items.locked", { id: item.id })
      : shown.kind === "missing"
        ? item.id
        : shown.text;

  const checkbox = h("input", {
    id: checkboxId,
    type: "checkbox",
    checked: s.selection.has(item.id),
    disabled: mandatory,
    "data-focus": checkboxId,
    "aria-describedby": `${checkboxId}-meta`,
    on: { change: (ev) => toggleItem(store, item.id, (ev.target as HTMLInputElement).checked) },
  });

  const meta: Array<HTMLElement | null> = [
    mandatory ? h("span", { class: "badge badge-mandatory" }, t("items.mandatoryBadge")) : null,
    isNote ? h("span", { class: "badge" }, t("items.textBlock", { style: styleLabel(item.response.style) })) : h("span", { class: "badge" }, item.answerRequired ? t("items.answerRequired") : t("items.answerOptional")),
    !isNote ? h("span", { class: "badge badge-type" }, item.response.kind) : null,
    item.sensitivity ? h("span", { class: "badge sev-warning" }, "! " + t("items.sensitive")) : null,
    item.origin === "own" ? h("span", { class: "badge" }, t("items.own")) : null,
    shown.kind === "text" && shown.fallback ? h("span", { class: "badge" }, t("items.fallbackLang", { lang: shown.language })) : null,
  ];

  return h(
    "li",
    { class: `item${isNote ? " item-note" : ""}${s.selection.has(item.id) ? " is-selected" : ""}`, "data-item": item.id },
    h(
      "div",
      { class: "item-main" },
      checkbox,
      h("label", { for: checkboxId, class: `${shown.kind === "locked" ? "locked" : ""}${isNote ? ` note-${item.response.style ?? "text"}` : ""}`.trim() }, label),
      h(
        "button",
        { type: "button", class: "btn btn-small info-btn", "aria-label": t("items.info", { id: item.id }), "data-focus": `info-item-${item.id}`, on: { click: () => openInfo(store, { kind: "item", id: item.id }) } },
        "i",
      ),
    ),
    s.showAnswers ? h("div", { class: "item-answers" }, answerPreview(s, item) ?? (isNote ? null : null)) : null,
    h("div", { class: "item-meta", id: `${checkboxId}-meta` }, ...meta, item.visibleWhen ? h("span", { class: "muted" }, " " + t("items.condition", { cond: conditionText(item.visibleWhen) })) : null),
  );
}

/** Re-exported for the tests of this view. */
export { displayDecision, mandatoryOf };
