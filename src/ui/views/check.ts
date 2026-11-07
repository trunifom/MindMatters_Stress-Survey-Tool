import { resolveText } from "../../core/localized";
import { createProject, projectFileName, serializeProject } from "../../model/project";
import { Action, ActionDecision, evaluateAction } from "../../model/rights";
import { buildCodebook } from "../../output/codebook";
import { buildCheckReport, isReportStale, reportFileName, serializeReport, stateFingerprint } from "../../output/report";
import { diagnosticsList } from "../components";
import { downloadText, h } from "../dom";
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
    metaForm(s, store),
    filesSection(s, store),
    rightsSection(s),
    exportSection(s),
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

function exportSection(s: AppState): HTMLElement {
  return h(
    "section",
    { class: "out-block", "aria-labelledby": "export-h" },
    h("h3", { id: "export-h" }, t("out.exportTitle")),
    h("p", { class: "banner banner-info", role: "note" }, h("strong", null, t("out.exportPlanned"))),
    h("ul", { class: "adapters" }, ...PLATFORMS.map(([id, name]) => h("li", { "data-platform": id, class: id === s.targetPlatform ? "is-target" : "" }, t("out.adapterPlanned", { name })))),
    h(
      "div",
      { class: "toolbar" },
      // Adapters are not implemented: the buttons are present so that the reason is visible, but never enabled.
      h("button", { type: "button", class: "btn", id: "native-export", disabled: true, "aria-describedby": "native-reason" }, t("out.nativeExport")),
      h("button", { type: "button", class: "btn", id: "test-export", disabled: true, "aria-describedby": "native-reason" }, t("out.testExport")),
    ),
    h("p", { id: "native-reason", class: "muted" }, t("out.notAvailable") + ". ", t("out.responsibility")),
  );
}
