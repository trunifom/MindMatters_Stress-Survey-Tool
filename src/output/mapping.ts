import type { Diagnostic } from "../core/diagnostics";
import type { ActionDecision } from "../model/rights";

/**
 * Mapping report shared by all export adapters (docs/RECHERCHE_Zielsysteme.md, section 1).
 *
 * Every catalog feature an adapter touches is reported with one of four levels:
 *  - exact:       the target system expresses it as is
 *  - transformed: expressed, but not identically (explained in `message`)
 *  - manual:      the file cannot carry it, the organizer must set it in the target system
 *  - unsupported: the target system cannot do it at all
 */
export type MappingLevel = "exact" | "transformed" | "manual" | "unsupported";

export interface MappingEntry {
  /** Stable feature key, e.g. "response.slider". */
  feature: string;
  level: MappingLevel;
  /** English default text; the UI shows it as is. */
  message: string;
  /** Items the entry applies to (empty = whole questionnaire). */
  itemRefs: string[];
}

export interface AdapterResult {
  platform: string;
  /** True only if a file was produced. */
  ok: boolean;
  /** File content (with BOM where the platform expects it). Absent when not ok. */
  content?: string;
  fileName: string;
  mimeType: string;
  diagnostics: Diagnostic[];
  mapping: MappingEntry[];
  /** Statements about the target system that were not verified against a real instance. */
  assumptions: string[];
  decision: ActionDecision;
  /** True for a development test export (labelled as such inside the file). */
  testArtifact: boolean;
}

/** Collects mapping entries, merging the item references of identical (feature, level, message) entries. */
export class MappingCollector {
  private readonly map = new Map<string, MappingEntry>();

  add(feature: string, level: MappingLevel, message: string, itemRef?: string): void {
    const key = `${feature}|${level}|${message}`;
    const e = this.map.get(key);
    if (e) {
      if (itemRef !== undefined && !e.itemRefs.includes(itemRef)) e.itemRefs.push(itemRef);
      return;
    }
    this.map.set(key, { feature, level, message, itemRefs: itemRef === undefined ? [] : [itemRef] });
  }

  entries(): MappingEntry[] {
    return [...this.map.values()];
  }
}
