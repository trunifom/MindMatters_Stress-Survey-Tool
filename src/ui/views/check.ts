import { resolveText } from "../../core/localized";
import { createProject, projectFileName, serializeProject } from "../../model/project";
import { Action, ActionDecision, evaluateAction } from "../../model/rights";
import { documentedDuration, scaleOverview, scoreAvailability } from "../../model/selection";
import { buildCodebook } from "../../output/codebook";
import type { AdapterResult } from "../../output/mapping";
import { buildPackage } from "../../output/package";
import { ADAPTERS } from "../../output/registry";
import { buildCheckReport, isReportStale, reportFileName, serializeReport, stateFingerprint } from "../../output/report";
import { diagnosticsList } from "../components";
import { downloadBytes, downloadText, h } from "../dom";
import { t, TextKey } from "../i18n";
import { counts, markSaved, rememberReport, selectionDiagnostics, setCodebookNotes, setMeta } from "../state";
import type { AppState, Store } from "../state";
import type { ViewContext } from "./registry";

/** The target systems the project plans to support. Adapters do not exist yet; they are listed, not offered. */
export const PLATFORMS: Array<[id: string, name: string]> = [
  ["limesurvey", "LimeSurvey"],
  ["redcap", "REDCap"],
  ["qualtrics", "Qualtrics"],
  ["surveymonkey", "SurveyMonkey"],
  ["googleForms", "Google Forms"],
  ["unipark", "Unipark"],
];

/** Check and output view: findings, project details, the three files, rights per action and the export overview. */
export function renderCheck({ state: s, store }: ViewContext): HTMLElement {
  const loaded = s.loaded;
  if (!loaded) return h("p", { class: "muted" }, t("import.noCatalog"));
  const c = counts(s);
  const cat = loaded.catalog;
  const title = resolveText(cat.catalog.title, s.language, cat.catalog.defaultLanguage)?.text ?? cat.catalog.id;
  const findings = [...loaded.loadDiagnostics.filter((d) => d.stage !== "selection" && d.stage !== "rights"), ...selectionDiagnostics(s)];

  return h(
    "section",
    { class: "card", "aria-labelledby": "check-h" },
    h("h2", { id: "check-h" }, t("tab.check")),
    h("p", null, h("strong", null, title)),
    h(
      "ul",
      { class: "counts" },
      h("li", null, t("summary.items", { n: c.items })),
      h("li", null, t("summary.modules", { n: c.modules })),
      h("li", null, t("summary.mandatory", { n: c.mandatory })),
    ),
    h("h3", null, t("diagnostics.title")),
    diagnosticsList(findings),
    overviewSection(s),
    metaForm(s, store),
    filesSection(s, store),
    rightsSection(s),
    exportSection(s, store),
  );
}

// --- selection by scale ---------------------------------------------------------------------------------

function overviewSection(s: AppState): HTMLElement {
  const c = s.loaded!.catalog;
  const rows = scaleOverview(c, s.selection);
  const dur = documentedDuration(c, s.selection);
  const scores = scoreAvailability(c, s.selection);
  const titleOf = (id: string) => resolveText(c.scales.find((x) => x.id === id)?.title, s.language, c.catalog.defaultLanguage)?.text ?? id;
  return h(
    "section",
    { class: "out-block", id: "scale-overview", "aria-labelledby": "overview-h" },
    h("h3", { id: "overview-h" }, t("overview.title")),
    h("p", { class: "muted" }, t("overview.hint")),
    h(
      "ul",
      { class: "scale-list" },
      ...rows.map((r) =>
        h(
          "li",
          { class: `scale-row is-${r.state}`, "data-scale": r.id },
          h("strong", null, titleOf(r.id)),
          ": ",
          t("summary.scaleCount", { n: r.selected, total: r.total }),
          " ",
          h("span", { class: `badge ${r.state === "partial" ? "sev-warning" : "sev-info"}` }, t(`overview.${r.state}` as TextKey)),
          " ",
          h("span", { class: "muted" }, "(" + t(r.policy === "wholeScale" ? "overview.whole" : "overview.warn") + ")"),
        ),
      ),
    ),
    h("p", { class: "muted", id: "duration" }, dur.instruments.length > 0 ? t("overview.duration", { min: dur.minMinutes, max: dur.maxMinutes, n: dur.instruments.length, unknown: dur.unknownItems }) : t("overview.durationNone")),
    scores.length > 0 ? h("p", { class: "muted", id: "score-availability" }, t("overview.scores", { n: scores.filter((x) => x.available).length, m: scores.length })) : null,
  );
}

// --- project details ------------------------------------------------------------------------------------

function metaForm(s: AppState, store: Store): HTMLElement {
  return h(
    "section",
    { class: "out-block", "aria-labelledby": "meta-h" },
    h("h3", { id: "meta-h" }, t("out.meta")),
    h(
      "div",
      { class: "filters" },
      h("div", { class: "field" }, h("label", { for: "meta-school" }, t("out.school")), h("input", { id: "meta-school", type: "text", value: s.schoolLabel, "data-focus": "meta-school", autocomplete: "off", on: { input: (ev) => setMeta(store, { schoolLabel: (ev.target as HTMLInputElement).value }) } })),
      h(
        "div",
        { class: "field" },
        h("label", { for: "meta-platform" }, t("out.platform")),
        h(
          "select",
          { id: "meta-platform", "data-focus": "meta-platform", on: { change: (ev) => setMeta(store, { targetPlatform: (ev.target as HTMLSelectElement).value }) } },
          h("option", { value: "", selected: s.targetPlatform === "" }, t("out.platformNone")),
          ...PLATFORMS.map(([id, name]) => h("option", { value: id, selected: s.targetPlatform === id }, name)),
        ),
      ),
    ),
    h("div", { class: "field" }, h("label", { for: "meta-notes" }, t("out.notes")), h("textarea", { id: "meta-notes", rows: 3, "data-focus": "meta-notes", on: { input: (ev) => setMeta(store, { internalNotes: (ev.target as HTMLTextAreaElement).value }) } }, s.internalNotes)),
    h("p", { class: "muted" }, t("out.localNote")),
  );
}

// --- the three files ------------------------------------------------------------------------------------

function metaOptions(s: AppState) {
  return {
    language: s.language,
    ...(s.targetPlatform ? { targetPlatform: s.targetPlatform } : {}),
    ...(s.schoolLabel ? { schoolLabel: s.schoolLabel } : {}),
    ...(s.internalNotes ? { internalNotes: s.internalNotes } : {}),
  };
}

function saveProject(s: AppState, store: Store): void {
  const c = s.loaded!.catalog;
  const { project, diagnostics } = createProject(c, s.selection, metaOptions(s));
  if (!project) return;
  const file = projectFileName(c);
  downloadText(file, serializeProject(project), "application/json");
  markSaved(store);
  const conflicts = diagnostics.some((d) => d.severity === "error");
  store.set({ notice: { kind: conflicts ? "warning" : "info", text: t(conflicts ? "out.savedConflicts" : "out.saved", { file }) } });
}

function saveReport(s: AppState, store: Store): void {
  const loaded = s.loaded!;
  const c = loaded.catalog;
  const report = buildCheckReport({ catalog: c, loadDiagnostics: loaded.loadDiagnostics, selection: s.selection, language: s.language, ...(s.targetPlatform ? { targetPlatform: s.targetPlatform } : {}) });
  const file = reportFileName(c);
  downloadText(file, serializeReport(report), "application/json");
  rememberReport(store, report.stateFingerprint, report.generatedAt);
  store.set({ notice: { kind: report.validity === "valid" ? "info" : "warning", text: t("out.saved", { file }) } });
}

function saveCodebook(s: AppState, store: Store): void {
  const c = s.loaded!.catalog;
  const notes = s.codebookNotes && (s.schoolLabel || s.internalNotes) ? { schoolNotes: { ...(s.schoolLabel ? { schoolLabel: s.schoolLabel } : {}), ...(s.internalNotes ? { internalNotes: s.internalNotes } : {}) } } : {};
  const result = buildCodebook(c, s.selection, { language: s.language, ...notes });
  const file = `${c.catalog.id}_${c.catalog.version}_codebook.${s.language}.md`;
  downloadText(file, result.markdown, "text/markdown");
  store.set({ notice: { kind: "info", text: t("out.saved", { file }) } });
}

function savePackage(s: AppState, store: Store): void {
  const loaded = s.loaded!;
  const r = buildPackage({
    catalog: loaded.catalog,
    loadDiagnostics: loaded.loadDiagnostics,
    selection: s.selection,
    language: s.language,
    ...(s.targetPlatform ? { targetPlatform: s.targetPlatform } : {}),
    ...(s.schoolLabel ? { schoolLabel: s.schoolLabel } : {}),
    ...(s.internalNotes ? { internalNotes: s.internalNotes } : {}),
    codebookNotes: s.codebookNotes,
  });
  downloadBytes(r.fileName, r.bytes, "application/zip");
  markSaved(store);
  store.set({ notice: { kind: "info", text: t("out.packageDone", { file: r.fileName, n: r.included.length, m: r.skipped.length }) } });
}

function filesSection(s: AppState, store: Store): HTMLElement {
  const c = s.loaded!.catalog;
  const codebook = evaluateAction(c, "codebookWithTexts", { selection: s.selection });
  const conflicts = selectionDiagnostics(s).some((d) => d.severity === "error");
  const reportState = !s.lastReport
    ? t("out.reportNone")
    : isReportStale({ stateFingerprint: s.lastReport.fingerprint }, c, s.selection, s.language, s.targetPlatform || undefined)
      ? t("out.reportStale")
      : t("out.reportFresh");
  const stale = !!s.lastReport && s.lastReport.fingerprint !== stateFingerprint(c, s.selection, s.language, s.targetPlatform || undefined);

  const block = (heading: string, hint: string, button: HTMLElement, extra: Array<Node | null> = []) =>
    h("div", { class: "out-file" }, h("h4", null, heading), h("p", { class: "muted" }, hint), ...extra, button);

  return h(
    "section",
    { class: "out-block", "aria-labelledby": "files-h" },
    h("h3", { id: "files-h" }, t("out.files")),
    block(t("out.package"), t("out.packageHint"), h("button", { type: "button", class: "btn btn-primary", id: "save-package", "data-focus": "save-package", on: { click: () => savePackage(s, store) } }, t("out.package"))),
    block(t("out.project"), t("out.projectHint"), h("button", { type: "button", class: "btn btn-primary", id: "save-project", "data-focus": "save-project", on: { click: () => saveProject(s, store) } }, t("out.project"))),
    block(
      t("out.report"),
      t("out.reportHint"),
      h("button", { type: "button", class: "btn", id: "save-report", "data-focus": "save-report", on: { click: () => saveReport(s, store) } }, t("out.report")),
      [
        h("p", { id: "report-state", class: stale ? "badge sev-warning" : "muted", role: "status" }, reportState),
        conflicts ? h("p", { class: "badge sev-warning" }, t("out.reportConflict")) : null,
      ],
    ),
    block(
      t("out.codebook"),
      t("out.codebookHint"),
      h("button", { type: "button", class: "btn", id: "save-codebook", "data-focus": "save-codebook", on: { click: () => saveCodebook(s, store) } }, t("out.codebook")),
      [
        h("label", { class: "pv-opt" }, h("input", { type: "checkbox", id: "codebook-notes", "data-focus": "codebook-notes", checked: s.codebookNotes, on: { change: (ev) => setCodebookNotes(store, (ev.target as HTMLInputElement).checked) } }), " ", t("out.codebookNotes")),
        codebook.blockedItems.length > 0 ? h("p", { class: "badge sev-warning" }, t("out.codebookWithheld", { n: codebook.blockedItems.length })) : null,
        codebook.flags.draftWatermark ? h("p", { class: "muted" }, t("out.codebookDraft")) : null,
        codebook.flags.withdrawnNotice ? h("p", { class: "muted" }, t("out.codebookWithdrawn")) : null,
      ],
    ),
  );
}

// --- rights per action and export overview --------------------------------------------------------------

const ACTIONS: Action[] = ["displayItems", "codebookWithTexts", "nativeExport", "devTestExport"];

function decisionLine(d: ActionDecision): HTMLElement {
  return h(
    "li",
    { class: `rights-row ${d.allowed ? "is-ok" : "is-blocked"}`, "data-action": d.action },
    h("strong", null, t(`out.act.${d.action}` as TextKey)),
    ": ",
    h("span", { class: `badge ${d.allowed ? "sev-info" : "sev-error"}` }, (d.allowed ? "✓ " : "✕ ") + (d.allowed ? t("out.allowed") : t("out.blocked"))),
    d.blockedItems.length > 0 ? h("span", { class: "muted" }, " " + t("out.blockedItems", { n: d.blockedItems.length })) : null,
    d.diagnostics.length > 0 ? diagnosticsList(d.diagnostics) : null,
  );
}

function rightsSection(s: AppState): HTMLElement {
  const c = s.loaded!.catalog;
  return h(
    "section",
    { class: "out-block", "aria-labelledby": "rights-h" },
    h("h3", { id: "rights-h" }, t("out.rightsTitle")),
    h("ul", { class: "rights-list" }, ...ACTIONS.map((a) => decisionLine(evaluateAction(c, a, { selection: s.selection })))),
  );
}

function runExport(s: AppState, store: Store, platform: string, name: string, mode: "native" | "test"): void {
  const adapter = ADAPTERS[platform]?.build;
  if (!adapter) return;
  const r = adapter(s.loaded!.catalog, s.selection, { language: s.language, mode });
  if (!r.ok || r.content === undefined) return;
  downloadText(r.fileName, r.content, r.mimeType);
  store.set({ notice: { kind: "info", text: t("out.exportDone", { file: r.fileName, name }) } });
}

function adapterBlock(s: AppState, store: Store, platform: string, name: string): HTMLElement {
  const c = s.loaded!.catalog;
  const adapter = (ADAPTERS[platform] as NonNullable<(typeof ADAPTERS)[string]>).build;
  const native = adapter(c, s.selection, { language: s.language, mode: "native" });
  const test = adapter(c, s.selection, { language: s.language, mode: "test" });
  const blockedDiagnostics = (r: AdapterResult) => r.diagnostics.filter((d) => d.severity !== "info");
  // The regular export explains itself first; if the test export fails too, its additional findings follow.
  const seen = new Set<string>();
  const reasons = [...(native.ok ? [] : blockedDiagnostics(native)), ...(test.ok ? [] : blockedDiagnostics(test))].filter((d) => {
    const key = `${d.code}|${d.itemRef ?? ""}|${d.message}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  const source = test.ok ? test : native;
  const levelOrder = { manual: 0, unsupported: 1, transformed: 2, exact: 3 } as const;
  const mapping = [...source.mapping].sort((a, b) => levelOrder[a.level] - levelOrder[b.level]);
  return h(
    "div",
    { class: "adapter-block", "data-platform": platform },
    h("h4", null, name),
    h(
      "div",
      { class: "toolbar" },
      h("button", { type: "button", class: "btn btn-primary", id: `native-export-${platform}`, disabled: !native.ok, "aria-describedby": `native-reason-${platform}`, "data-focus": `native-export-${platform}`, on: { click: () => runExport(s, store, platform, name, "native") } }, t("out.exportFor", { name })),
      h("button", { type: "button", class: "btn", id: `test-export-${platform}`, disabled: !test.ok, "aria-describedby": `native-reason-${platform}`, "data-focus": `test-export-${platform}`, on: { click: () => runExport(s, store, platform, name, "test") } }, t("out.testExportFor", { name })),
    ),
    h("p", { id: `native-reason-${platform}`, class: "muted" }, t("out.responsibility")),
    reasons.length > 0 ? h("div", { id: `export-why-${platform}` }, h("h5", null, t("out.exportWhy")), diagnosticsList(reasons)) : null,
    source.mapping.length > 0
      ? h(
          "details",
          { class: "mapping", id: `mapping-report-${platform}` },
          h("summary", null, t("out.mapping")),
          h("p", { class: "muted" }, t("out.mappingHint")),
          h(
            "table",
            { class: "mapping-table" },
            h(
              "tbody",
              null,
              ...mapping.map((m) =>
                h(
                  "tr",
                  { class: `level-${m.level}` },
                  h("td", null, h("span", { class: `badge lvl-${m.level}` }, t(`out.level.${m.level}` as TextKey))),
                  h("td", null, h("code", null, m.feature)),
                  h("td", null, m.message, m.itemRefs.length > 0 ? h("span", { class: "muted" }, " (" + t("out.mappingItems", { n: m.itemRefs.length }) + ")") : null),
                ),
              ),
            ),
          ),
          h("h5", null, t("out.assumptions")),
          h("ul", null, ...source.assumptions.map((a) => h("li", null, a))),
        )
      : null,
  );
}

/** Platforms and the neutral table, with the name shown to the school. */
function exportList(): Array<[string, string]> {
  return Object.entries(ADAPTERS).map(([id, e]): [string, string] => [id, e.label]);
}

function tierKey(id: string): TextKey {
  const tier = ADAPTERS[id]?.tier;
  return tier === "adapter" ? "out.adapterReady" : tier === "prototype" ? "out.adapterPrototype" : tier === "table" ? "out.adapterTable" : "out.adapterPlanned";
}

function exportSection(s: AppState, store: Store): HTMLElement {
  return h(
    "section",
    { class: "out-block", "aria-labelledby": "export-h" },
    h("h3", { id: "export-h" }, t("out.exportTitle")),
    h("p", { class: "banner banner-info", role: "note" }, h("strong", null, t("out.exportStatus"))),
    h("ul", { class: "adapters" }, ...exportList().map(([id, name]) => h("li", { "data-platform": id, class: id === s.targetPlatform ? "is-target" : "" }, t(tierKey(id), { name })))),
    ...exportList().map(([id, name]) => adapterBlock(s, store, id, name)),
  );
}
