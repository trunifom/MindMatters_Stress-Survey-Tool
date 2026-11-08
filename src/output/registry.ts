import { diag } from "../core/diagnostics";
import type { Catalog } from "../core/types";
import { evaluateAction } from "../model/rights";
import type { Selection } from "../model/selection";
import { buildR, buildSpss } from "./analysis";
import { buildBauplan } from "./bauplan";
import { buildNeutralCsv } from "./csvtable";
import { buildHtmlDocument, buildMarkdownDocument, buildNeutralJson } from "./document";
import { buildGoogleForms } from "./googleforms";
import { buildLimeSurvey } from "./limesurvey";
import type { AdapterResult } from "./mapping";
import { buildQualtrics } from "./qualtrics";
import { buildRedcap } from "./redcap";

export type Build = (c: Catalog, selection: Selection, opts: { language: string; mode: "native" | "test" }) => AdapterResult;

/** How far a school may trust an output (ADR-008). */
export type Tier = "adapter" | "prototype" | "table";

export interface AdapterEntry {
  build: Build;
  tier: Tier;
  /** Name shown to the school. */
  label: string;
}

/**
 * Everything the tool can write, in display order. `tier`:
 *  adapter   = writes a file the system imports, not yet tested on a real instance
 *  prototype = written from documentation or general knowledge, never run (REDCap, Google Forms),
 *              or a build plan for a person because the system imports nothing (Unipark, SurveyMonkey)
 *  table     = a neutral table for people, not for any system
 */
const RAW_ADAPTERS: Record<string, AdapterEntry> = {
  limesurvey: { build: buildLimeSurvey, tier: "adapter", label: "LimeSurvey" },
  redcap: { build: buildRedcap, tier: "prototype", label: "REDCap" },
  qualtrics: { build: buildQualtrics, tier: "adapter", label: "Qualtrics" },
  surveymonkey: { build: (c, s, o) => buildBauplan("surveymonkey", c, s, o), tier: "prototype", label: "SurveyMonkey (Bauplan)" },
  googleForms: { build: buildGoogleForms, tier: "prototype", label: "Google Forms (Apps Script)" },
  unipark: { build: (c, s, o) => buildBauplan("unipark", c, s, o), tier: "prototype", label: "Unipark (Bauplan)" },
  csv: { build: buildNeutralCsv, tier: "table", label: "Neutrale Tabelle (CSV)" },
  html: { build: buildHtmlDocument, tier: "table", label: "Druckansicht (HTML, als PDF speicherbar)" },
  markdown: { build: buildMarkdownDocument, tier: "table", label: "Fragebogen als Textdokument (Markdown)" },
  json: { build: buildNeutralJson, tier: "table", label: "Neutrales JSON (für eigene Skripte)" },
  spss: { build: buildSpss, tier: "prototype", label: "SPSS-Syntax (Variablen- und Wertelabels)" },
  r: { build: buildR, tier: "prototype", label: "R-Skript (Variablen- und Wertelabels)" },
};

/** A short, readable description of anything that was thrown. */
export function describeThrown(e: unknown): string {
  if (e instanceof Error) return `${e.name}: ${e.message}`;
  try {
    return String(e);
  } catch {
    return "unknown error";
  }
}

/**
 * No adapter may take the page down. An unexpected exception (a bug, not a problem of the selection) becomes
 * a failed result with the diagnostic EXPORT_INTERNAL_ERROR that names the target and the cause, so the
 * school sees which export failed and why, and every other export keeps working.
 */
export function guardBuild(platform: string, build: Build): Build {
  return (c, selection, opts) => {
    try {
      return build(c, selection, opts);
    } catch (e) {
      const detail = describeThrown(e);
      return {
        platform,
        ok: false,
        fileName: `${c.catalog.id}_${c.catalog.version}_${platform}.txt`,
        mimeType: "text/plain",
        diagnostics: [
          diag("export", "error", "EXPORT_INTERNAL_ERROR", `The ${platform} export failed unexpectedly (${detail}). This is a fault in the tool, not in your selection.`, {
            targetPlatform: platform,
            remediation: "Try the other outputs. Report the problem with the catalog file, the selection and this message.",
          }),
        ],
        mapping: [],
        assumptions: [],
        decision: evaluateAction(c, opts.mode === "test" ? "devTestExport" : "nativeExport", { selection }),
        testArtifact: opts.mode === "test",
      };
    }
  };
}

export const ADAPTERS: Record<string, AdapterEntry> = Object.fromEntries(
  Object.entries(RAW_ADAPTERS).map(([id, e]) => [id, { ...e, build: guardBuild(id, e.build) }]),
);

export const ADAPTER_IDS: string[] = Object.keys(ADAPTERS);
