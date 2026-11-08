/**
 * Information dialog (spec A09) for an item, module, scale or construct.
 *
 * Sections appear in the specified order and unknown facts are shown as "not documented" instead of being guessed.
 * Texts of items whose display rights are not confirmed stay locked (rights come from content.displayDecision).
 * Everything is inserted as text; links only for http(s) URLs (dom.externalLink). Opening, closing and focus are
 * handled by the shell (app.ts), the target lives in AppState.info.
 */

import type { Catalog, Construct, Item, Module, ReferencePeriod, Scale, SourceLink } from "../../core/types";
import { effectiveRights } from "../../model/rights";
import { scoreAvailability } from "../../model/selection";
import { adminText, conditionText, constructPath, displayDecision, mandatoryOf, shownText } from "../content";
import { externalLink, h, richText } from "../dom";
import { t, TextKey } from "../i18n";
import { closeInfo, InfoTarget, Store } from "../state";
import type { AppState } from "../state";

const notDocumented = (): HTMLElement => h("span", { class: "muted" }, t("info.notDocumented"));
const section = (title: string, ...body: Array<Node | null>): HTMLElement => h("section", { class: "info-section" }, h("h3", null, title), ...body);
const row = (label: string, value: Node | string | null | undefined): HTMLElement =>
  h("div", { class: "info-row" }, h("dt", null, label), h("dd", null, value === null || value === undefined || value === "" ? notDocumented() : value));
const dl = (...rows: Array<HTMLElement | null>): HTMLElement => h("dl", { class: "info-dl" }, ...rows);
const list = (items: Array<Node | string>): HTMLElement => h("ul", null, ...items.map((i) => h("li", null, i)));

/** The modal dialog for `s.info`, or null if nothing is open or the target no longer exists. */
export function renderInfoDialog(s: AppState, store: Store): HTMLElement | null {
  if (!s.loaded || !s.info) return null;
  const built = build(s, s.info);
  if (!built) return null;
  return h(
    "div",
    {
      class: "modal-backdrop",
      on: {
        click: (ev) => {
          if (ev.target === ev.currentTarget) closeInfo(store);
        },
      },
    },
    h(
      "div",
      { class: "modal", role: "dialog", "aria-modal": "true", "aria-labelledby": "info-title" },
      h(
        "div",
        { class: "modal-head" },
        h("h2", { id: "info-title" }, built.title),
        h("button", { type: "button", class: "btn", id: "info-close", "data-focus": "info-close", on: { click: () => closeInfo(store) } }, t("info.close")),
      ),
      h("div", { class: "modal-body" }, ...built.sections),
    ),
  );
}

function build(s: AppState, target: InfoTarget): { title: string; sections: HTMLElement[] } | undefined {
  const c = s.loaded!.catalog;
  if (target.kind === "item") {
    const item = c.items.find((i) => i.id === target.id);
    return item ? { title: `${t("info.dialogFor")}: ${item.id}`, sections: itemSections(s, item) } : undefined;
  }
  if (target.kind === "module") {
    const m = c.modules.find((x) => x.id === target.id);
    return m ? { title: `${t("info.dialogFor")}: ${adminText(s, m.title) ?? m.id}`, sections: moduleSections(s, m) } : undefined;
  }
  if (target.kind === "scale") {
    const sc = c.scales.find((x) => x.id === target.id);
    return sc ? { title: `${t("info.dialogFor")}: ${adminText(s, sc.title) ?? sc.id}`, sections: scaleSections(s, sc) } : undefined;
  }
  const k = c.constructs.find((x) => x.id === target.id);
  return k ? { title: `${t("info.dialogFor")}: ${adminText(s, k.label) ?? k.id}`, sections: constructSections(s, k) } : undefined;
}

// --- sources ---------------------------------------------------------------------------------------

function sourceNode(s: AppState, link: SourceLink): HTMLElement {
  const src = s.loaded!.catalog.sources.find((x) => x.id === link.sourceRef);
  if (!src) return h("span", null, link.sourceRef);
  const bits: Array<Node | string> = [h("strong", null, src.title), ` (${src.type}`];
  if (src.authors?.length) bits.push(`, ${src.authors.join(", ")}`);
  if (src.year) bits.push(`, ${src.year}`);
  if (src.edition) bits.push(`, ${src.edition}`);
  bits.push(`) – ${link.relation}`);
  if (link.locator) bits.push(`, ${link.locator}`);
  if (src.doi) bits.push(`, DOI ${src.doi}`);
  if (src.url) bits.push(", ", externalLink(src.url, src.url));
  if (src.citationText) bits.push(` – ${src.citationText}`);
  return h("span", null, ...bits);
}

function periodText(p: ReferencePeriod): string {
  if (p.kind === "relative" && p.amount && p.unit) {
    return t("info.period.relative", { n: p.amount, unit: t(`info.unit.${p.unit}` as TextKey) });
  }
  return t(`info.period.${p.kind}` as TextKey);
}

// --- item --------------------------------------------------------------------------------------------

function itemSections(s: AppState, item: Item): HTMLElement[] {
  const c = s.loaded!.catalog;
  const locked = !displayDecision(c).allowedItemIds.includes(item.id);
  const instrument = item.instrumentRef ? c.instruments.find((i) => i.id === item.instrumentRef) : undefined;
  const scales = c.scales.filter((x) => x.itemRefs.includes(item.id));
  const out: HTMLElement[] = [];

  if (locked) out.push(h("p", { class: "banner banner-warning", role: "note" }, h("strong", null, t("info.lockedNote"))));
  else out.push(section(t("items.listLabel"), h("div", { class: "info-wording" }, ...[shownText(s, item.text) ? richText(shownText(s, item.text)!.text) : null])));

  // 1 short description and measurement goal
  const goal: Node[] = [];
  const docs = item.documentation;
  for (const lt of [docs?.summary, docs?.measurementExplanation]) {
    const x = adminText(s, lt);
    if (x) goal.push(h("p", null, x));
  }
  for (const r of item.constructRefs) {
    const k = c.constructs.find((x) => x.id === r);
    const d = k && adminText(s, k.description);
    if (k && d) goal.push(h("p", null, h("strong", null, adminText(s, k.label) ?? k.id), ": ", d));
  }
  out.push(section(t("info.goal"), goal.length ? h("div", null, ...goal) : notDocumented()));

  // 2 dimensions and scales
  out.push(
    section(
      t("info.dimensions"),
      dl(
        row(t("info.constructs"), item.constructRefs.length ? list(item.constructRefs.map((r) => constructPath(s, r))) : null),
        row(
          t("info.scales"),
          scales.length
            ? list(scales.map((sc) => `${adminText(s, sc.title) ?? sc.id} – ${t("info.scaleItems", { n: sc.itemRefs.length })}, ${sc.selectionPolicy === "wholeScale" ? t("info.policyWhole") : t("info.policyPartial")}`))
            : null,
        ),
      ),
    ),
  );

  // 3 source, instrument form, original number (direct sources and instrument sources stay separate)
  out.push(
    section(
      t("info.source"),
      dl(
        row(t("info.instrument"), instrument ? adminText(s, instrument.title) ?? instrument.id : null),
        row(t("info.formName"), instrument?.formName),
        row(t("info.versionLabel"), instrument?.versionLabel),
        row(t("info.originalNumber"), item.originalItemNumber),
        row(t("info.directSources"), item.sourceLinks?.length ? list(item.sourceLinks.map((l) => sourceNode(s, l))) : null),
        row(t("info.instrumentSources"), instrument?.sourceLinks?.length ? list(instrument.sourceLinks.map((l) => sourceNode(s, l))) : null),
      ),
    ),
  );

  // 4 target population and perspective
  const age = instrument?.ageRange;
  out.push(
    section(
      t("info.population"),
      dl(
        row(t("info.targetPopulation"), adminText(s, instrument?.targetPopulation)),
        row(t("info.role"), instrument?.respondentRole ? t(`info.role.${instrument.respondentRole}` as TextKey) : null),
        row(t("info.ageRange"), age ? t("info.years", { range: `${age.minYears ?? "?"}–${age.maxYears ?? "?"}` }) : null),
      ),
    ),
  );

  // 5 reference period, with its origin (undocumented is never turned into "general")
  const period = item.referencePeriod
    ? `${periodText(item.referencePeriod)} (${t("info.periodItem")})`
    : instrument?.referencePeriod
      ? `${periodText(instrument.referencePeriod)} (${t("info.periodInstrument")})`
      : null;
  out.push(section(t("info.period"), dl(row(t("info.period"), period))));

  // 6 instruction and answer format
  out.push(section(t("info.instruction"), instructionBlock(s, item, locked), answerFormat(s, item, locked)));

  // 7 limits of selection and scoring
  const limitTexts = [docs?.limitations, instrument?.documentation?.limitations].map((x) => adminText(s, x)).filter((x): x is string => !!x);
  const advice = adminText(s, docs?.selectionAdvice);
  const avail = scoreAvailability(c, s.selection);
  const defs = (c.scoringDefinitions ?? []).filter((d) => d.itemRefs.includes(item.id));
  out.push(
    section(
      t("info.limits"),
      dl(
        row(t("info.itemLimits"), limitTexts.length ? list(limitTexts) : null),
        row(t("info.selectionAdvice"), advice),
        row(
          t("info.scoring"),
          defs.length
            ? list(
                defs.map((d) => {
                  const a = avail.find((x) => x.id === d.id)!;
                  return a.available ? t("info.scoreAvailable", { id: d.id }) : t("info.scoreUnavailable", { id: d.id, n: a.missingItems.length });
                }),
              )
            : null,
        ),
      ),
    ),
  );

  // 8 translation status
  const tr = instrument?.translation;
  out.push(
    section(
      t("info.translation"),
      dl(
        row(t("info.translationStatus"), tr?.status),
        row(t("info.translationMethod"), tr?.method),
        row(t("info.textLanguages"), locked ? null : Object.keys(item.text).join(", ")),
      ),
    ),
  );

  // 9 rights
  out.push(rightsSection(c, item));

  // 10 export particulars
  const hints = item.exportHints ? Object.entries(item.exportHints) : [];
  out.push(
    section(
      t("info.export"),
      dl(
        row(t("info.variable"), h("code", null, item.variableName)),
        row(t("info.exportLabel"), adminText(s, item.exportLabel)),
        row(t("info.inclusion"), mandatoryOf(c).has(item.id) ? t("info.inclusionMandatory") : t("info.inclusionOptional")),
        row(t("info.condition"), item.visibleWhen ? h("code", null, conditionText(item.visibleWhen)) : null),
        row(t("info.keyDirection"), item.keyDirection),
        row(t("info.origin"), item.origin),
        row(t("info.sensitivity"), item.sensitivity?.level),
        row(
          t("info.hints"),
          hints.length
            ? list(hints.map(([platform, hint]) => `${platform}: ${[hint.variableName ? `${t("info.variable")} ${hint.variableName}` : "", adminText(s, hint.notes) ?? ""].filter(Boolean).join(", ")}`))
            : null,
        ),
      ),
    ),
  );
  return out;
}

function instructionBlock(s: AppState, item: Item, locked: boolean): HTMLElement {
  const c = s.loaded!.catalog;
  if (locked) return h("div");
  const sec = c.questionnaire.sections.find((x) => x.itemRefs.includes(item.id));
  const instrument = item.instrumentRef ? c.instruments.find((i) => i.id === item.instrumentRef) : undefined;
  const parts = [c.questionnaire.introduction, sec?.instruction, instrument?.instruction, item.instruction]
    .map((lt) => shownText(s, lt)?.text)
    .filter((x): x is string => !!x);
  return dl(row(t("info.effectiveInstruction"), parts.length ? list(parts) : null));
}

function answerFormat(s: AppState, item: Item, locked: boolean): HTMLElement {
  const c = s.loaded!.catalog;
  const r = item.response;
  const cons: string[] = [];
  if (r.minimum !== undefined) cons.push(`min ${r.minimum}`);
  if (r.maximum !== undefined) cons.push(`max ${r.maximum}`);
  if (r.step !== undefined) cons.push(`step ${r.step}`);
  if (r.maxDecimalPlaces !== undefined) cons.push(`max decimals ${r.maxDecimalPlaces}`);
  if (r.minLength !== undefined) cons.push(`min length ${r.minLength}`);
  if (r.maxLength !== undefined) cons.push(`max length ${r.maxLength}`);
  if (r.minSelections !== undefined) cons.push(`min selections ${r.minSelections}`);
  if (r.maxSelections !== undefined) cons.push(`max selections ${r.maxSelections}`);
  if (r.maxRanks !== undefined) cons.push(`max ranks ${r.maxRanks}`);
  if (r.format) cons.push(`format ${r.format}`);
  if (r.exclusiveCodes?.length) cons.push(`exclusive ${r.exclusiveCodes.join(", ")}`);
  const os = r.optionSetRef ? c.optionSets.find((o) => o.id === r.optionSetRef) : undefined;
  const options = os
    ? list(
        os.options.map((o) => {
          const label = locked ? "" : ` ${adminText(s, o.label) ?? ""}`;
          return `${o.code}${label}${o.role === "missing" ? ` (missing: ${o.missingReason ?? ""})` : ""}`;
        }),
      )
    : null;
  return dl(
    row(t("info.answerType"), h("code", null, r.kind)),
    row(t("info.constraints"), cons.length ? cons.join(", ") : null),
    os ? row(t("info.options"), options) : null,
  );
}

function rightsSection(c: Catalog, item: Item): HTMLElement {
  const r = effectiveRights(c, item);
  const perm = (name: keyof typeof r.permissions) => `${t(`info.perm.${name}` as TextKey)}: ${t(`info.${r.permissions[name]}` as TextKey)}`;
  const profile = r.profileId ? c.rights.find((x) => x.id === r.profileId) : undefined;
  return section(
    t("info.rights"),
    dl(
      row(t("info.rightsProfile"), r.profileId ? h("code", null, r.profileId) : null),
      row(t("info.rightsSource"), t(`info.rightsSource.${r.source}` as TextKey)),
      row(t("info.reviewStatus"), t(`info.review.${r.reviewStatus}` as TextKey)),
      row(t("info.rights"), list((["electronicDisplay", "electronicAdministration", "export", "redistribution", "modification"] as const).map(perm))),
      row(t("info.license"), profile?.licenseName ? (profile.licenseUrl ? externalLink(profile.licenseUrl, profile.licenseName) : profile.licenseName) : null),
      row(t("info.holder"), profile?.rightsHolder),
      row(t("info.attribution"), r.attribution ? Object.values(r.attribution)[0] : null),
    ),
    h("p", { class: "muted" }, t("info.rightsNote")),
  );
}

// --- module, scale, construct --------------------------------------------------------------------------

function memberList(s: AppState, ids: string[]): HTMLElement {
  const c = s.loaded!.catalog;
  const allowed = new Set(displayDecision(c).allowedItemIds);
  return list(
    ids.map((id) => {
      const item = c.items.find((i) => i.id === id);
      const text = item && allowed.has(id) ? shownText(s, item.text)?.text : undefined;
      return text ? `${id}: ${text.split("\n")[0]}` : id;
    }),
  );
}

function moduleSections(s: AppState, m: Module): HTMLElement[] {
  const docs = m.documentation;
  return [
    section(
      t("info.description"),
      dl(
        row(t("info.description"), adminText(s, m.description)),
        row(t("info.goal"), adminText(s, docs?.summary) ?? adminText(s, docs?.measurementExplanation)),
        row(t("info.selectionAdvice"), adminText(s, docs?.selectionAdvice)),
        row(t("info.itemLimits"), adminText(s, docs?.limitations)),
        row(t("info.moduleMode"), t(`info.mode.${m.selectionMode}` as TextKey)),
        row(t("info.inclusion"), m.inclusionRequired ? t("info.inclusionMandatory") : t("info.inclusionOptional")),
      ),
    ),
    section(t("info.members"), memberList(s, m.itemRefs)),
  ];
}

function scaleSections(s: AppState, sc: Scale): HTMLElement[] {
  const docs = sc.documentation;
  return [
    section(
      t("info.description"),
      dl(
        row(t("info.description"), adminText(s, sc.description)),
        row(t("info.goal"), adminText(s, docs?.summary) ?? adminText(s, docs?.measurementExplanation)),
        row(t("info.limits"), sc.selectionPolicy === "wholeScale" ? t("info.policyWhole") : t("info.policyPartial")),
        row(t("info.itemLimits"), adminText(s, docs?.limitations)),
        row(t("info.directSources"), sc.sourceLinks?.length ? list(sc.sourceLinks.map((l) => sourceNode(s, l))) : null),
      ),
    ),
    section(t("info.members"), memberList(s, sc.itemRefs)),
  ];
}

function constructSections(s: AppState, k: Construct): HTMLElement[] {
  const c = s.loaded!.catalog;
  const related = c.items.filter((i) => i.constructRefs.includes(k.id)).map((i) => i.id);
  return [
    section(
      t("info.description"),
      dl(
        row(t("info.description"), adminText(s, k.description)),
        row(t("info.parent"), k.parentRef ? constructPath(s, k.parentRef) : null),
        row(t("info.directSources"), k.sourceLinks?.length ? list(k.sourceLinks.map((l) => sourceNode(s, l))) : null),
      ),
    ),
    section(t("info.ofItems"), related.length ? memberList(s, related) : notDocumented()),
  ];
}
