import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/core/loader";
import { applyProject } from "../../src/model/selection";
import { example040 } from "./helpers";

/**
 * T40: "1.000 Items / 5 MB in höchstens fünf Sekunden auf vorher festgelegtem
 * Referenzgerät". The reference device is not fixed yet, so this test only proves
 * the target on the development machine and prints the measured time. It guards
 * against accidental quadratic behaviour in the validator.
 */

const TARGET_MS = 5000;

function bigCatalog(items: number, padChars: number): string {
  const doc = example040();
  const template = doc.items.find((i: any) => i.id === "demo_01");
  const ids: string[] = [];
  for (let n = 1; n <= items; n++) {
    const id = `bulk_${String(n).padStart(4, "0")}`;
    ids.push(id);
    doc.items.push({
      ...structuredClone(template),
      id,
      variableName: id,
      inclusionRequired: false,
      defaultSelected: false,
      displayNumber: String(n),
      exportHints: undefined,
      documentation: { summary: { en: "x".repeat(padChars) } },
    });
  }
  doc.questionnaire.sections.push({ id: "bulk", title: { en: "Bulk" }, itemRefs: ids });
  return JSON.stringify(doc);
}

describe("performance (T40)", () => {
  it("loads 1000 items / ~4.5 MB within the target time and selects them all", () => {
    const text = bigCatalog(1000, 4400);
    const bytes = new TextEncoder().encode(text).length;
    expect(bytes).toBeGreaterThan(4_000_000);
    expect(bytes).toBeLessThan(10 * 1024 * 1024); // inside the provisional size limit

    const t0 = performance.now();
    const r = loadCatalog(text);
    const loadMs = performance.now() - t0;
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.catalog!.items.length).toBe(1007);

    const all = {
      schemaVersion: "0.4.0",
      documentType: "questionnaireProject" as const,
      catalogRef: { id: r.catalog!.catalog.id, version: r.catalog!.catalog.version },
      questionnaireRef: r.catalog!.questionnaire.id,
      selectedItemIds: r.catalog!.items.map((i) => i.id),
      language: "en",
    };
    const t1 = performance.now();
    const p = applyProject(r.catalog!, all);
    const projectMs = performance.now() - t1;
    expect(p.diagnostics.filter((d) => d.severity === "error")).toEqual([]);

    console.log(`T40: ${(bytes / 1e6).toFixed(2)} MB, ${r.catalog!.items.length} items: load+validate ${loadMs.toFixed(0)} ms, apply project ${projectMs.toFixed(0)} ms`);
    expect(loadMs).toBeLessThan(TARGET_MS);
    expect(projectMs).toBeLessThan(TARGET_MS);
  }, 30_000);

  it("rejects an oversized catalog before doing any work", () => {
    const text = "[" + "1,".repeat(6_000_000) + "1]"; // ~12 MB
    const t0 = performance.now();
    const r = loadCatalog(text);
    expect(r.diagnostics[0]!.code).toBe("LIMIT_EXCEEDED");
    expect(performance.now() - t0).toBeLessThan(1000);
  });

  it("does not hang on pathological nesting", () => {
    const t0 = performance.now();
    const r = loadCatalog("[".repeat(100_000));
    expect(r.diagnostics[0]!.code).toBe("LIMIT_EXCEEDED");
    expect(performance.now() - t0).toBeLessThan(1000);
  });
});
