import type { ValidateFunction } from "ajv/dist/2020.js";
import * as generated from "mm-generated-validators";

/**
 * Browser build replacement of ./schemas.ts (swapped in by tools/build.mjs).
 *
 * The validators are generated as plain JavaScript at build time (tools/gen-validators.mjs), so the page
 * runs without `new Function` and its Content-Security-Policy needs no 'unsafe-eval'. Same API as schemas.ts.
 */

export type DocKind = "catalog" | "project";

const table = generated as unknown as Record<string, ValidateFunction | undefined>;

export function getValidator(kind: DocKind): ValidateFunction {
  const v = table[kind];
  if (!v) throw new Error(`Validator not generated: ${kind}`);
  return v;
}

export function getDefValidator(kind: DocKind, defName: string): ValidateFunction {
  const v = table[`${kind}#${defName}`];
  if (!v) throw new Error(`Schema definition not generated: ${kind}#${defName}`);
  return v;
}
