import { mkdirSync, readdirSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { getDefValidator, getValidator } from "../../src/core/schemas";
import { migrateToCurrent } from "../../src/core/migrate";
import { clone, example040, fixture030, loadJson } from "./helpers";
// @ts-expect-error plain JavaScript build tool without types
import { generateValidatorSource } from "../../tools/gen-validators.mjs";

/**
 * The browser build ships validators generated at build time (no `new Function`, no 'unsafe-eval').
 * They must behave exactly like the runtime-compiled ones the unit tests use everywhere else.
 */

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const genDir = join(root, "dist", ".gen-test");
mkdirSync(genDir, { recursive: true });
const file = join(genDir, "validators.cjs");
writeFileSync(file, generateValidatorSource(), "utf8");
const generated: Record<string, any> = createRequire(file)(file);

const shape = (v: any, doc: unknown) => {
  const valid = v(doc) as boolean;
  const errors = valid ? [] : (v.errors as any[]).map((e) => `${e.instancePath}|${e.keyword}|${e.schemaPath}`).sort();
  return { valid, errors };
};

const documents = (): Array<[string, any]> => {
  const out: Array<[string, any]> = [["example", example040()]];
  const dir = join(root, "tests", "fixtures", "v0.3.0");
  for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
    const m = migrateToCurrent(fixture030(f));
    if (m.ok) out.push([f, m.doc]);
    else out.push([f + " (0.3.0 as is)", loadJson(join(dir, f))]);
  }
  return out;
};

describe("generated validators match the runtime validators", () => {
  it("exports the roots and the per-definition validators the checker uses", () => {
    expect(typeof generated["catalog"]).toBe("function");
    expect(typeof generated["project"]).toBe("function");
    for (const d of ["RespSingleChoice", "RespSlider", "RespNote", "Condition", "ConditionGroup"]) expect(typeof generated[`catalog#${d}`], d).toBe("function");
  });

  it("agree on valid and invalid documents, including the error paths", () => {
    let compared = 0;
    for (const [name, doc] of documents()) {
      const kind = doc?.documentType === "questionnaireProject" ? "project" : "catalog";
      const a = shape(getValidator(kind), clone(doc));
      const b = shape(generated[kind], clone(doc));
      expect(b, name).toEqual(a);
      compared++;
    }
    expect(compared).toBeGreaterThan(10);
  });

  it("agree on mutated documents", () => {
    const mutations: Array<(d: any) => void> = [
      (d) => delete d.catalog,
      (d) => (d.items[0].response.kind = "nope"),
      (d) => (d.items[1].inclusionRequired = "yes"),
      (d) => d.items[0].text && (d.items[0].text = 5),
      (d) => (d.optionSets[0].options[0].exportHints = { limesurvey: {} }),
      (d) => (d.catalog.status = "bogus"),
      (d) => (d.questionnaire.sections = []),
      (d) => d.items.push({ id: "x" }),
    ];
    for (const [i, m] of mutations.entries()) {
      const doc = clone(example040());
      m(doc);
      const a = shape(getValidator("catalog"), clone(doc));
      const b = shape(generated["catalog"], clone(doc));
      expect(b, `mutation ${i}`).toEqual(a);
    }
  });

  it("agree on single definitions", () => {
    const cases: Array<[string, unknown]> = [
      ["RespSlider", { kind: "slider", minimum: 0, maximum: 10 }],
      ["RespSlider", { kind: "slider" }],
      ["Condition", { itemRef: "a", operator: "equals", value: "x" }],
      ["Condition", { itemRef: "a", operator: "matches", value: "x" }],
      ["ConditionGroup", { all: [] }],
    ];
    for (const [def, value] of cases) {
      expect(shape(generated[`catalog#${def}`], clone(value)), def).toEqual(shape(getDefValidator("catalog", def), clone(value)));
    }
  });

  it("the generated code needs no eval", () => {
    const src = generateValidatorSource() as string;
    expect(src).not.toMatch(/new Function|\beval\s*\(/);
  });
});
