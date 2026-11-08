/**
 * Semantic validation of a structurally valid catalog: everything JSON Schema cannot express.
 *
 * Each check group lives in its own module of src/core and returns diagnostics; this file only concatenates them
 * in a fixed order. Add a new check group here. Input must have passed schemaCheck first, otherwise the checks
 * may rely on fields that are not there.
 */

import type { Diagnostic } from "./diagnostics";
import { checkFeatures } from "./features";
import { checkLanguages } from "./languages";
import { checkRegisters } from "./registers";
import { checkOptionSets, checkResponses } from "./responses";
import { checkScoring } from "./scoring";
import { checkConditions, checkModules, checkTemplate } from "./structure";
import type { Catalog } from "./types";

/**
 * Run all semantic check groups and return their findings in order (registers, languages, features, option sets, responses, template,
 * conditions, modules, scoring).
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
