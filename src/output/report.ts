import { CheckStatus, Diagnostic, statusOf } from "../core/diagnostics";
import type { Catalog } from "../core/types";
import { Action, evaluateAction } from "../model/rights";
import { checkSelection, mandatorySet, orderedSelection, Selection } from "../model/selection";
import { APP_VERSION } from "../version";

/**
 * Technical check report (spec C02, C03, C08).
 *
 * - Contains only technical IDs, paths, codes and findings: NO item or option
 *   wording, so it can be saved for any catalog (rights matrix row "Prüfbericht").
 * - A selection with conflicts can still be reported, but the report says so and
 *   must never be mistaken for a valid questionnaire (`validity`, `notice`).
 * - `stateFingerprint` identifies the exact state the report was made for.
 *   After any change of selection, language, platform or catalog the report is
 *   stale (`isReportStale`).
 */

export interface CheckReport {
  reportType: "questionnaireCheckReport";
  reportVersion: "1.0.0";
  generatedAt: string;
  tool: { name: "MindMatters"; version: string };
  catalogRef: { id: string; version: string; status: string };
  questionnaireRef: string;
  language: string;
  targetPlatform?: string;
  stateFingerprint: string;
  validity: "valid" | "hasConflicts";
  notice?: string;
  selection: { itemIds: string[]; count: number; mandatoryCount: number };
  status: { technical: CheckStatus; selection: CheckStatus; rights: CheckStatus; export: CheckStatus };
  counts: { errors: number; warnings: number; infos: number };
  diagnostics: Diagnostic[];
  rights: Array<{
    action: Action;
    allowed: boolean;
    blockedItemIds: string[];
    flags: { draftWatermark: boolean; withdrawnNotice: boolean; testArtifact: boolean };
    diagnostics: Diagnostic[];
  }>;
}

export interface ReportInput {
  catalog: Catalog;
  /** Diagnostics of loading the catalog (file, structure, reference, content, rights). */
  loadDiagnostics: readonly Diagnostic[];
  selection: Selection;
  language: string;
  targetPlatform?: string;
  now?: Date;
}

const REPORT_ACTIONS: Action[] = ["displayItems", "codebookWithTexts", "nativeExport", "devTestExport"];

/** cyrb53: small, fast, non-cryptographic 53-bit hash. Only identifies a state, never secures anything. */
function hash53(s: string): string {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  for (let i = 0; i < s.length; i++) {
    const ch = s.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(16).padStart(14, "0");
}

export function stateFingerprint(c: Catalog, selection: Selection, language: string, targetPlatform?: string): string {
  return hash53(
    JSON.stringify([c.catalog.id, c.catalog.version, c.questionnaire.id, language, targetPlatform ?? "", orderedSelection(c, selection)]),
  );
}

export function isReportStale(report: Pick<CheckReport, "stateFingerprint">, c: Catalog, selection: Selection, language: string, targetPlatform?: string): boolean {
  return report.stateFingerprint !== stateFingerprint(c, selection, language, targetPlatform);
}

export function buildCheckReport(input: ReportInput): CheckReport {
  const { catalog: c, selection, language } = input;
  const selectionDiagnostics = checkSelection(c, selection, "project");
  const diagnostics = [...input.loadDiagnostics.filter((d) => d.stage !== "selection"), ...selectionDiagnostics];

  const rights = REPORT_ACTIONS.map((action) => {
    const d = evaluateAction(c, action, { selection });
    return {
      action,
      allowed: d.allowed,
      blockedItemIds: d.blockedItems.map((b) => b.itemId),
      flags: d.flags,
      diagnostics: d.diagnostics,
    };
  });

  const all = [...diagnostics, ...rights.flatMap((r) => (r.action === "displayItems" ? r.diagnostics : []))];
  const hasConflicts = selectionDiagnostics.some((d) => d.severity === "error");

  return {
    reportType: "questionnaireCheckReport",
    reportVersion: "1.0.0",
    generatedAt: (input.now ?? new Date()).toISOString(),
    tool: { name: "MindMatters", version: APP_VERSION },
    catalogRef: { id: c.catalog.id, version: c.catalog.version, status: c.catalog.status },
    questionnaireRef: c.questionnaire.id,
    language,
    ...(input.targetPlatform ? { targetPlatform: input.targetPlatform } : {}),
    stateFingerprint: stateFingerprint(c, selection, language, input.targetPlatform),
    validity: hasConflicts ? "hasConflicts" : "valid",
    ...(hasConflicts
      ? { notice: "This selection has unresolved conflicts. This report is a technical protocol, not a valid questionnaire." }
      : {}),
    selection: {
      itemIds: orderedSelection(c, selection),
      count: orderedSelection(c, selection).length,
      mandatoryCount: [...mandatorySet(c)].filter((id) => selection.has(id)).length,
    },
    status: {
      technical: statusOf(diagnostics, ["file", "structure", "reference", "content"]),
      selection: statusOf(selectionDiagnostics, ["selection"]),
      rights: statusOf(all, ["rights"]),
      export: "notRun",
    },
    counts: {
      errors: all.filter((d) => d.severity === "error").length,
      warnings: all.filter((d) => d.severity === "warning").length,
      infos: all.filter((d) => d.severity === "info").length,
    },
    diagnostics,
    rights,
  };
}

export function serializeReport(r: CheckReport): string {
  return JSON.stringify(r, null, 2) + "\n";
}

/** Suggested download name: catalog id and version only, never notes (C10). */
export function reportFileName(c: Catalog): string {
  return `${c.catalog.id}_${c.catalog.version}_check-report.json`;
}
