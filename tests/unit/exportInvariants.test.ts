import { readdirSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { loadCatalog } from "../../src/core/loader";
import type { Catalog } from "../../src/core/types";
import { ADAPTERS } from "../../src/output/registry";
import { clone, example040 } from "./helpers";
import { join } from "node:path";

/**
 * Invariants every export must keep, on every catalog we have (the rich example and all fixtures), in every
 * language, regular and test mode. They do not prove that a target system accepts the file; they catch the
 * mistakes that make a file wrong on any system: control characters, stray "undefined", unstable output,
 * unsafe file names, a result without content or without a reason.
 */

const here = new URL(".", import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, "$1");
const fixtureNames = readdirSync(join(here, "..", "fixtures", "v0.3.0")).filter((f) => f.endsWith(".json") && f.includes("Katalog"));

function catalogs(): Array<[string, Catalog]> {
  const out: Array<[string, Catalog]> = [["example", releasedCopy(clone(example040()) as Catalog)]];
  for (const f of fixtureNames) {
    const r = loadCatalog(readFileSync(join(here, "..", "fixtures", "v0.3.0", f), "utf-8"), { migrate: true });
    if (r.ok && r.catalog) out.push([f, releasedCopy(clone(r.catalog))]);
  }
  return out;
}

function releasedCopy(c: Catalog): Catalog {
  (c.catalog as { status: string }).status = "released";
  return c;
}

describe("export invariants", () => {
  const cats = catalogs();

  it("covers the example and the fixtures", () => {
    expect(cats.length).toBeGreaterThanOrEqual(5);
  });

  for (const [platform, entry] of Object.entries(ADAPTERS)) {
    describe(platform, () => {
      for (const [name, c] of cats) {
        it(`${name}: a successful export is clean, deterministic and well named; a failed one says why`, () => {
          const selection = new Set(c.items.map((i) => i.id));
          for (const language of c.languages) {
            for (const mode of ["native", "test"] as const) {
              const a = entry.build(c, selection, { language, mode });
              const label = `${platform}/${name}/${language}/${mode}`;
              expect(a.platform, label).toBe(platform);
              expect(a.fileName, label).toMatch(/^[A-Za-z0-9._-]+$/);
              expect(a.mapping.length, label).toBeGreaterThan(0);
              if (a.ok) {
                expect(typeof a.content, label).toBe("string");
                expect(a.content!.length, label).toBeGreaterThan(20);
                expect(a.content, label).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/);
                expect(a.content, label).not.toContain("�");
                expect(a.content, label).not.toMatch(/\bundefined\b|\[object Object\]|\bNaN\b/);
                expect(entry.build(c, selection, { language, mode }).content, `${label} deterministic`).toBe(a.content);
                expect(a.diagnostics.some((d) => d.severity === "error"), label).toBe(false);
                if (mode === "test") expect(a.testArtifact, label).toBe(true);
              } else {
                expect(a.content, label).toBeUndefined();
                expect(a.diagnostics.some((d) => d.severity === "error"), `${label}: a failed export must name an error`).toBe(true);
              }
            }
          }
        });
      }
    });
  }

  it("an unsupported language is a clean refusal for every export", () => {
    const [, c] = cats[0]!;
    for (const [platform, entry] of Object.entries(ADAPTERS)) {
      const r = entry.build(c, new Set(c.items.map((i) => i.id)), { language: "xx", mode: "test" });
      expect(r.ok, platform).toBe(false);
      expect(r.diagnostics.some((d) => d.code === "EXPORT_LANGUAGE_UNKNOWN"), platform).toBe(true);
    }
  });

  it("an empty selection never produces a file that looks like a questionnaire without a reason", () => {
    const [, c] = cats[0]!;
    for (const [platform, entry] of Object.entries(ADAPTERS)) {
      const r = entry.build(c, new Set(), { language: "en", mode: "test" });
      // either refused with an error, or a valid (empty) file; never ok with errors, never silent
      if (r.ok) expect(r.diagnostics.some((d) => d.severity === "error"), platform).toBe(false);
      else expect(r.diagnostics.some((d) => d.severity === "error"), platform).toBe(true);
    }
  });
});
