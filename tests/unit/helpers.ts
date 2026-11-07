import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { parseStrictJson } from "../../src/core/strictJson";
import { migrateToCurrent } from "../../src/core/migrate";

const here = (rel: string): string => fileURLToPath(new URL(rel, import.meta.url));

/** Load a JSON file with the strict reader (fails the test on syntax errors/duplicates). */
export function loadJson(path: string): any {
  const r = parseStrictJson(readFileSync(path, "utf-8"));
  if (!r.ok) throw new Error(`${path}: ${JSON.stringify(r.diagnostics)}`);
  return r.value;
}

/** A delivered 0.3.0 fixture exactly as stored. */
export const fixture030 = (name: string): any => loadJson(here(`../fixtures/v0.3.0/${name}`));

/** A 0.3.0 fixture after the explicit, additive migration to 0.4.0. */
export function fixture040(name: string): any {
  const m = migrateToCurrent(fixture030(name));
  if (!m.ok) throw new Error("migration failed for " + name);
  return m.doc;
}

export const example040 = (): any => loadJson(here("../../examples/catalog_rich_0_4_0.json"));

export const clone = <T>(v: T): T => structuredClone(v);

export const POSITIVE_PAIRS: Array<[catalog: string, project: string]> = [
  ["10_Katalog_Klein_Gemischt.json", "11_Projekt_Klein_Gemischt.json"],
  ["20_Katalog_Vollstaendige_Skalen.json", "21_Projekt_Vollstaendige_Skalen.json"],
  ["30_Katalog_Zweisprachig.json", "31_Projekt_Zweisprachig.json"],
  ["40_Katalog_Antworttypen_Logik.json", "41_Projekt_Antworttypen_Logik.json"],
];
