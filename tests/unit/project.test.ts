import { describe, expect, it } from "vitest";
import { createProject, projectFileName, serializeProject } from "../../src/model/project";
import { initialSelection, setItem, setModule } from "../../src/model/selection";
import { loadProject } from "../../src/core/loader";
import { validateStructure } from "../../src/core/schemaCheck";
import type { Catalog } from "../../src/core/types";
import { example040, fixture040 } from "./helpers";

const NOW = new Date("2026-11-07T12:00:00Z");
const cat10 = (): Catalog => fixture040("10_Katalog_Klein_Gemischt.json");
const cat20 = (): Catalog => fixture040("20_Katalog_Vollstaendige_Skalen.json");
const cat30 = (): Catalog => fixture040("30_Katalog_Zweisprachig.json");
const codes = (ds: { code: string }[]) => ds.map((d) => d.code);

describe("createProject", () => {
  it("builds a schema-valid project from references only", () => {
    const c = cat10();
    const { project } = createProject(c, initialSelection(c), { now: NOW });
    expect(validateStructure(project, "project")).toEqual([]);
    expect(project).toEqual({
      schemaVersion: "0.4.0",
      documentType: "questionnaireProject",
      catalogRef: { id: "school_test_small", version: "1.0.0" },
      questionnaireRef: "test_template",
      selectedItemIds: ["extraversion_01", "extraversion_02"],
      language: "en",
      savedAt: "2026-11-07T12:00:00.000Z",
    });
    expect(JSON.stringify(project)).not.toMatch(/Am the life of the party/); // no item texts
  });

  it("stores the selection in questionnaire order, not click order", () => {
    const c = cat10();
    let sel: Set<string> = initialSelection(c);
    sel = setItem(c, sel, "self_efficacy_08", true);
    sel = setItem(c, sel, "conscientiousness_01", true);
    const { project } = createProject(c, sel, { now: NOW });
    // template order of catalog 10 is interleaved: extraversion, conscientiousness, self_efficacy, ...
    expect(project!.selectedItemIds).toEqual(["extraversion_01", "conscientiousness_01", "extraversion_02", "self_efficacy_08"]);
  });

  it("defaults to the catalog's default language and accepts any catalog language", () => {
    const c = cat30();
    expect(createProject(c, initialSelection(c), { now: NOW }).project!.language).toBe("de-CH");
    expect(createProject(c, initialSelection(c), { now: NOW, language: "en" }).project!.language).toBe("en");
  });

  it("refuses an unknown language and creates no project", () => {
    const c = cat10();
    const r = createProject(c, initialSelection(c), { language: "fr" });
    expect(r.project).toBeUndefined();
    expect(codes(r.diagnostics)).toEqual(["PROJECT_LANGUAGE_UNKNOWN"]);
  });

  it("omits empty optional fields (schema forbids empty strings) and trims the rest", () => {
    const c = cat10();
    const { project } = createProject(c, initialSelection(c), { now: NOW, schoolLabel: "   ", internalNotes: "", targetPlatform: " limesurvey " });
    expect(project).not.toHaveProperty("schoolLabel");
    expect(project).not.toHaveProperty("internalNotes");
    expect(project!.targetPlatform).toBe("limesurvey");
    expect(validateStructure(project, "project")).toEqual([]);
  });

  it("saving is allowed despite conflicts, which are documented (C03)", () => {
    const c = cat20();
    const sel = new Set(initialSelection(c));
    sel.delete("conscientiousness_01"); // partial wholeScale and partial module
    const r = createProject(c, sel, { now: NOW });
    expect(r.project).toBeDefined();
    expect(r.project!.selectedItemIds).not.toContain("conscientiousness_01");
    expect(codes(r.diagnostics).sort()).toEqual(["MODULE_PARTIAL", "SCALE_PARTIAL_NOT_ALLOWED"]);
    expect(r.diagnostics.every((d) => d.context === "project")).toBe(true);
  });

  it("does not repair a selection that misses mandatory items (reported, saved as is)", () => {
    const c = cat10();
    const r = createProject(c, new Set(["conscientiousness_01"]), { now: NOW });
    expect(r.project!.selectedItemIds).toEqual(["conscientiousness_01"]);
    expect(codes(r.diagnostics)).toContain("MANDATORY_ITEM_MISSING");
  });

  it("uses the current time when none is injected", () => {
    const c = cat10();
    const before = Date.now();
    const t = Date.parse(createProject(c, initialSelection(c)).project!.savedAt!);
    expect(t).toBeGreaterThanOrEqual(before - 1);
    expect(t).toBeLessThanOrEqual(Date.now() + 1);
  });
});

describe("serialization and round trip (T27)", () => {
  it("is deterministic with a trailing newline", () => {
    const c = cat10();
    const { project } = createProject(c, initialSelection(c), { now: NOW });
    const a = serializeProject(project!);
    expect(a).toBe(serializeProject(project!));
    expect(a.endsWith("}\n")).toBe(true);
    expect(a.indexOf('"schemaVersion"')).toBeLessThan(a.indexOf('"catalogRef"'));
  });

  it.each([
    ["10_Katalog_Klein_Gemischt.json", ["conscientiousness_02"]],
    ["20_Katalog_Vollstaendige_Skalen.json", []],
    ["40_Katalog_Antworttypen_Logik.json", ["conscientiousness_01", "conscientiousness_02"]],
  ])("%s: save then load gives the same effective selection", (name, extra) => {
    const c = fixture040(name) as Catalog;
    let sel: Set<string> = initialSelection(c);
    for (const id of extra) sel = setItem(c, sel, id, true);
    const { project } = createProject(c, sel, { now: NOW, schoolLabel: "Schule A", internalNotes: "intern" });
    const loaded = loadProject(serializeProject(project!), c);
    expect(loaded.result!.selection).toEqual(project!.selectedItemIds);
    expect(new Set(loaded.result!.selection)).toEqual(sel);
    expect(loaded.result!.addedMandatory).toEqual([]);
  });

  it("a module selection survives a round trip", () => {
    const c = cat20();
    const sel = setModule(c, initialSelection(c), "module_self_efficacy", false);
    const { project } = createProject(c, sel, { now: NOW });
    const loaded = loadProject(serializeProject(project!), c);
    expect(loaded.ok).toBe(true);
    expect(loaded.result!.selection).toHaveLength(20);
  });

  it("the rich 0.4.0 example round trips as well", () => {
    const c: Catalog = example040();
    const sel = initialSelection(c);
    const { project } = createProject(c, sel, { now: NOW });
    const loaded = loadProject(serializeProject(project!), c);
    expect(loaded.ok).toBe(true);
    expect(new Set(loaded.result!.selection)).toEqual(sel);
  });
});

describe("file name (C10)", () => {
  it("is built from catalog id and version only", () => {
    const c = cat10();
    expect(projectFileName(c)).toBe("school_test_small_1.0.0_project.json");
  });
  it("never contains school label or notes", () => {
    const c = cat10();
    const { project } = createProject(c, initialSelection(c), { now: NOW, schoolLabel: "Geheime Schule", internalNotes: "vertraulich" });
    expect(project!.schoolLabel).toBe("Geheime Schule");
    expect(projectFileName(c)).not.toMatch(/Geheime|vertraulich/);
  });
});
