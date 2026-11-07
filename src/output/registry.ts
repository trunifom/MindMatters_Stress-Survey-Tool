import type { Catalog } from "../core/types";
import type { Selection } from "../model/selection";
import { buildBauplan } from "./bauplan";
import { buildNeutralCsv } from "./csvtable";
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
export const ADAPTERS: Record<string, AdapterEntry> = {
  limesurvey: { build: buildLimeSurvey, tier: "adapter", label: "LimeSurvey" },
  redcap: { build: buildRedcap, tier: "prototype", label: "REDCap" },
  qualtrics: { build: buildQualtrics, tier: "adapter", label: "Qualtrics" },
  surveymonkey: { build: (c, s, o) => buildBauplan("surveymonkey", c, s, o), tier: "prototype", label: "SurveyMonkey (Bauplan)" },
  googleForms: { build: buildGoogleForms, tier: "prototype", label: "Google Forms (Apps Script)" },
  unipark: { build: (c, s, o) => buildBauplan("unipark", c, s, o), tier: "prototype", label: "Unipark (Bauplan)" },
  csv: { build: buildNeutralCsv, tier: "table", label: "Neutrale Tabelle (CSV)" },
};

export const ADAPTER_IDS: string[] = Object.keys(ADAPTERS);
