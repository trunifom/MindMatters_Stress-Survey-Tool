/**
 * Structure view: the order of the questionnaire.
 *
 * What may move is decided by the catalog (`section.reorder`): a whole block (a scale) or the single items inside
 * it. Both are off by default, because standardized instruments are asked in the published order. Nothing here
 * changes the wording of a question. A move that would put the trigger of a condition behind its dependent item is
 * refused by state.ts (orderNotice) and explained here.
 */

import type { Item, Section } from "../../core/types";
import { isCustomId } from "../../model/customize";
import { adminText } from "../content";
import { h } from "../dom";
import { t } from "../i18n";
import { moveItem, moveSection, movableSectionIds, resetOrder } from "../state";
import type { AppState, Store } from "../state";
import type { ViewContext } from "./registry";

const truncate = (x: string, n: number) => (x.length > n ? x.slice(0, n - 1).trimEnd() + "…" : x.replace(/\s+/g, " "));

/** The structure tab: sections with arrows where the catalog allows moving, and a reset button once something was changed. */
export function renderStructure({ state: s, store }: ViewContext): HTMLElement {
  if (!s.loaded) return h("p", { class: "muted" }, t("import.noCatalog"));
  const c = s.loaded.catalog;
  const sections = c.questionnaire.sections;
  const movable = movableSectionIds(c);
  const items = new Map(c.items.map((i) => [i.id, i]));
  const changed = !!s.customization.sectionOrder?.length || Object.keys(s.customization.itemOrder ?? {}).length > 0;
  const anyMovable = movable.length > 0 || sections.some((x) => x.reorder?.itemsReorderable === true);

  return h(
    "section",
    { class: "card", "aria-labelledby": "structure-h" },
    h("h2", { id: "structure-h" }, t("structure.title")),
    h("p", { class: "banner banner-info", role: "note" }, t("structure.serverHint")),
    s.orderNotice ? h("p", { class: "banner banner-warning", role: "alert", id: "order-notice" }, t("structure.blocked") + " " + s.orderNotice) : null,
    !anyMovable ? h("p", { class: "muted", id: "nothing-movable" }, t("structure.nothingMovable")) : null,
    h("ol", { class: "structure-list" }, ...sections.map((sec) => sectionCard(s, store, sec, movable, items))),
    changed ? h("button", { type: "button", class: "btn", id: "order-reset", "data-focus": "order-reset", on: { click: () => resetOrder(store) } }, t("structure.reset")) : null,
  );
}

function arrow(label: string, focus: string, symbol: string, disabled: boolean, run: () => void): HTMLElement {
  return h("button", { type: "button", class: "btn btn-small btn-icon", "aria-label": label, title: label, "data-focus": focus, disabled, on: { click: run } }, symbol);
}

function sectionCard(s: AppState, store: Store, sec: Section, movable: string[], items: Map<string, Item>): HTMLElement {
  const title = adminText(s, sec.title) ?? sec.id;
  const isMovable = sec.reorder?.movable === true;
  const itemsFree = sec.reorder?.itemsReorderable === true;
  const pos = movable.indexOf(sec.id);
  const rows = sec.itemRefs.filter((id) => items.has(id));
  const catalogRows = rows.filter((id) => !isCustomId(id));

  return h(
    "li",
    { class: `structure-card card-inner${isMovable ? " is-movable" : ""}`, "data-section": sec.id },
    h(
      "div",
      { class: "structure-head" },
      h("h3", null, title),
      h("span", { class: `badge ${isMovable ? "badge-adapted" : "badge-locked"}` }, isMovable ? t("structure.blockMovable") : "🔒 " + t("structure.blockFixed")),
      isMovable ? arrow(t("structure.upBlock", { title }), `section-${sec.id}-up`, "↑", pos <= 0, () => moveSection(store, sec.id, -1)) : null,
      isMovable ? arrow(t("structure.downBlock", { title }), `section-${sec.id}-down`, "↓", pos < 0 || pos >= movable.length - 1, () => moveSection(store, sec.id, 1)) : null,
    ),
    h("p", { class: "muted small" }, itemsFree ? t("structure.itemsFree") : t("structure.itemsFixed")),
    h(
      "ol",
      { class: "structure-items" },
      ...rows.map((id) => {
        const it = items.get(id)!;
        const own = isCustomId(id);
        const i = catalogRows.indexOf(id);
        const text = truncate(adminText(s, it.text) ?? id, 90);
        return h(
          "li",
          { class: `structure-item${s.selection.has(id) ? "" : " is-off"}${own ? " is-own" : ""}`, "data-item": id },
          h("span", { class: "structure-text" }, text),
          own ? h("span", { class: "badge" }, t("structure.ownBlock")) : null,
          !s.selection.has(id) ? h("span", { class: "badge" }, t("structure.notSelected")) : null,
          itemsFree && !own ? arrow(t("structure.upItem", { text }), `item-${id}-up`, "↑", i <= 0, () => moveItem(store, sec.id, id, -1)) : null,
          itemsFree && !own ? arrow(t("structure.downItem", { text }), `item-${id}-down`, "↓", i < 0 || i >= catalogRows.length - 1, () => moveItem(store, sec.id, id, 1)) : null,
        );
      }),
    ),
  );
}
