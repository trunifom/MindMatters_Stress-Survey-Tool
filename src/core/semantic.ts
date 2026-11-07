import type { Diagnostic } from "./diagnostics";
import { checkFeatures } from "./features";
import { checkLanguages } from "./languages";
import { checkRegisters } from "./registers";
import { checkOptionSets, checkResponses } from "./responses";
import { checkScoring } from "./scoring";
import { checkConditions, checkModules, checkTemplate } from "./structure";
import type { Catalog } from "./types";

/**
 * Semantic validation of a structurally valid catalog: everything JSON Schema
 * cannot express. Each check group lives in its own module and returns
 * diagnostics; this function only concatenates them.
 */
export function validateCatalogSemantics(c: Catalog): Diagnostic[] {
  return [
    ...checkRegisters(c),
    ...checkLanguages(c),
    ...checkFeatures(c),
    ...checkOptionSets(c),
    ...checkResponses(c),
    ...checkTemplate(c),
    ...checkConditions(c),
    ...checkModules(c),
    ...checkScoring(c),
  ];
}
