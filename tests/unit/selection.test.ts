import { describe, expect, it } from "vitest";
import {
  applyProject,
  checkInitialSelection,
  checkSelection,
  clearOptional,
  initialSelection,
  mandatoryReasons,
  mandatorySet,
  orderedSelection,
  scoreAvailability,
  setItem,
  setModule,
} from "../../src/model/selection";
import type { Catalog, Project } from "../../src/core/types";
import { clone, example040, fixture040, POSITIVE_PAIRS } from "./helpers";

const codes = (ds: { code: string }[]) => ds.map((d) => d.code);
const cat = (n: string): Catalog => fixture040(n);
const cat10 = () => cat("10_Katalog_Klein_Gemischt.json");
const cat20 = () => cat("20_Katalog_Vollstaendige_Skalen.json");
const cat40 = () => cat("40_Katalog_Antworttypen_Logik.json");

describe("effective mandatory set (A06, T09, T11)", () => {
  it("catalog 10: the two inclusionRequired items", () => {
    expect([...mandatorySet(cat10())].sort()).toEqual(["extraversion_01", "extraversion_02"]);
  });
  it("catalog 20: all ten items of the mandatory module although the item flags are false", () => {
    const c = cat20();
    expect(c.items.some((i) => i.inclusionRequired)).toBe(false);
    const m = mandatorySet(c);
    expect(m.size).toBe(10);
    expect([...m].every((id) => id.startsWith("extraversion_"))).toBe(true);
  });
  it("records why an item is mandatory", () => {
    const r = mandatoryReasons(cat20()).get("extraversion_05")!;
    expect(r).toEqual({ item: false, moduleId: "module_extraversion" });
    expect(mandatoryReasons(cat10()).get("extraversion_01")).toEqual({ item: true });
  });
  it("an optional module adds nothing", () => {
    expect(mandatorySet(cat20()).has("conscientiousness_01")).toBe(false);
  });
});

describe("initial selection (A08, T14)", () => {
  it("catalog 10 and 30: only the mandatory items", () => {
    expect([...initialSelection(cat10())].sort()).toEqual(["extraversion_01", "extraversion_02"]);
    expect(initialSelection(cat("30_Katalog_Zweisprachig.json")).size).toBe(2);
  });
  it("catalog 20: all thirty items (default modules complete)", () => {
    expect(initialSelection(cat20()).size).toBe(30);
  });
  it("catalog 40: two mandatory items plus the eight own questions", () => {
    expect(initialSelection(cat40()).size).toBe(10);
  });
  it("includes mandatory items even when not defaultSelected", () => {
    const c: any = cat20();
    for (const it of c.items) it.defaultSelected = false;
    for (const m of c.modules) m.defaultSelected = false;
    expect(initialSelection(c).size).toBe(10);
  });
  it.each(POSITIVE_PAIRS.map((p) => p[0]))("%s: initial selection has no errors", (name) => {
    expect(checkInitialSelection(cat(name)).filter((d) => d.severity === "error")).toEqual([]);
  });
  it("the partial default scales are only warnings (as in the delivery report)", () => {
    const ds = checkInitialSelection(cat10());
    expect(codes(ds)).toEqual(["PARTIAL_SCALE"]);
    expect(ds[0]!.severity).toBe("warning");
    expect(ds[0]!.context).toBe("initial");
    expect(checkInitialSelection(cat20())).toEqual([]);
    expect(codes(checkInitialSelection(cat40()))).toEqual(["PARTIAL_SCALE"]);
  });
  it("an inconsistent initial selection is a catalog configuration error", () => {
    const c: any = cat20();
    c.items.find((i: any) => i.id === "conscientiousness_03").defaultSelected = false; // inside an allOrNothing default module
    // module default stays true, so the module rule still completes it ...
    expect(checkInitialSelection(c)).toEqual([]);
    // ... but a wholeScale violation appears when the module does not complete it
    c.modules.find((m: any) => m.id === "module_conscientiousness").selectionMode = "independent";
    c.modules.find((m: any) => m.id === "module_conscientiousness").defaultSelected = false;
    expect(codes(checkInitialSelection(c))).toEqual(["SCALE_PARTIAL_NOT_ALLOWED"]);
  });
  it("dependent default item without its trigger is an initial error", () => {
    const c: any = cat40();
    c.items.find((i: any) => i.id === "areas_test").defaultSelected = false;
    const ds = checkInitialSelection(c);
    expect(codes(ds)).toContain("DEPENDENCY_NOT_SELECTED");
    expect(ds.find((d) => d.code === "DEPENDENCY_NOT_SELECTED")!.itemRef).toBe("other_test");
  });
});

describe("actions (T10, T16, T20)", () => {
  it("clearOptional keeps the whole mandatory set, also for module members", () => {
    expect(clearOptional(cat20()).size).toBe(10);
    expect(clearOptional(cat10()).size).toBe(2);
  });
  it("mandatory items cannot be deselected", () => {
    const c = cat10();
    const sel = initialSelection(c);
    expect(setItem(c, sel, "extraversion_01", false).has("extraversion_01")).toBe(true);
  });
  it("independent items switch one by one", () => {
    const c = cat10();
    let sel: Set<string> = initialSelection(c);
    sel = setItem(c, sel, "conscientiousness_01", true);
    expect(sel.has("conscientiousness_01")).toBe(true);
    expect(sel.has("conscientiousness_02")).toBe(false);
    sel = setItem(c, sel, "conscientiousness_01", false);
    expect(sel.has("conscientiousness_01")).toBe(false);
  });
  it("members of an optional allOrNothing module switch together", () => {
    const c = cat20();
    let sel: Set<string> = initialSelection(c);
    sel = setItem(c, sel, "conscientiousness_04", false);
    expect([...sel].filter((id) => id.startsWith("conscientiousness_"))).toEqual([]);
    sel = setItem(c, sel, "conscientiousness_04", true);
    expect([...sel].filter((id) => id.startsWith("conscientiousness_")).length).toBe(10);
  });
  it("members of a mandatory module cannot be switched off", () => {
    const c = cat20();
    const sel = setItem(c, initialSelection(c), "extraversion_03", false);
    expect([...sel].filter((id) => id.startsWith("extraversion_")).length).toBe(10);
  });
  it("module action adds/removes all members and keeps mandatory ones", () => {
    const c = cat10();
    let sel: Set<string> = initialSelection(c);
    sel = setModule(c, sel, "module_extraversion", true);
    expect([...sel].filter((id) => id.startsWith("extraversion_")).length).toBe(4);
    sel = setModule(c, sel, "module_extraversion", false);
    expect([...sel].sort()).toEqual(["extraversion_01", "extraversion_02"]);
    expect(setModule(c, sel, "unknown_module", true).size).toBe(sel.size);
  });
  it("actions never mutate their input", () => {
    const c = cat10();
    const sel = initialSelection(c);
    const before = [...sel];
    setItem(c, sel, "conscientiousness_01", true);
    setModule(c, sel, "module_self_efficacy", true);
    expect([...sel]).toEqual(before);
  });
  it("selection output follows questionnaire order, not click order", () => {
    const c = cat10();
    let sel: Set<string> = new Set();
    sel = setItem(c, sel, "self_efficacy_08", true);
    sel = setItem(c, sel, "extraversion_01", true);
    sel = setItem(c, sel, "conscientiousness_01", true);
    expect(orderedSelection(c, sel)).toEqual(["extraversion_01", "conscientiousness_01", "self_efficacy_08"]);
  });
});

describe("selection rules (T17, T18, T19)", () => {
  it("wholeScale: partial selection is an error, empty and complete are fine", () => {
    const c = cat20();
    const sel = setModule(c, initialSelection(c), "module_conscientiousness", false);
    expect(checkSelection(c, sel, "project")).toEqual([]);
    sel.add("conscientiousness_01");
    const ds = checkSelection(c, sel, "project");
    expect(codes(ds).sort()).toEqual(["MODULE_PARTIAL", "SCALE_PARTIAL_NOT_ALLOWED"]);
    expect(ds.every((d) => d.context === "project")).toBe(true);
  });
  it("partialWithWarning: warning only, with the scoring caveat", () => {
    const c = cat10();
    const sel = setItem(c, initialSelection(c), "conscientiousness_01", true);
    const ds = checkSelection(c, sel, "project").filter((d) => d.code === "PARTIAL_SCALE");
    expect(ds.map((d) => d.scaleRef).sort()).toEqual(["scale_conscientiousness", "scale_extraversion"]);
    expect(ds[0]!.message).toMatch(/original scoring/);
  });
  it("overlapping scales are each evaluated on their own", () => {
    const c: any = clone(cat10());
    c.scales.push({
      id: "scale_overlap",
      title: { en: "o" },
      description: { en: "o" },
      itemRefs: ["extraversion_01", "conscientiousness_01"],
      constructRefs: [],
      selectionPolicy: "wholeScale",
    });
    const ds = checkSelection(c, initialSelection(c), "project");
    expect(ds.some((d) => d.code === "SCALE_PARTIAL_NOT_ALLOWED" && d.scaleRef === "scale_overlap")).toBe(true);
    expect(ds.some((d) => d.code === "PARTIAL_SCALE" && d.scaleRef === "scale_extraversion")).toBe(true);
  });
  it("a missing mandatory item is an error when checked directly", () => {
    const c = cat20();
    const sel = new Set<string>();
    const ds = checkSelection(c, sel, "project").filter((d) => d.code === "MANDATORY_ITEM_MISSING");
    expect(ds).toHaveLength(10);
    expect(ds[0]!.message).toMatch(/module_extraversion/);
  });
});

describe("scores (T44)", () => {
  it("available only if every item of the definition is selected", () => {
    const c = cat20();
    const all = scoreAvailability(c, initialSelection(c));
    expect(all.every((s) => s.available)).toBe(true);
    const sel = setModule(c, initialSelection(c), "module_self_efficacy", false);
    const r = scoreAvailability(c, sel);
    const se = r.find((s) => s.id === "score_self_efficacy")!;
    expect(se.available).toBe(false);
    expect(se.missingItems).toHaveLength(10);
    expect(r.find((s) => s.id === "score_extraversion")!.available).toBe(true);
  });
  it("catalogs without definitions have none", () => {
    expect(scoreAvailability(cat10(), initialSelection(cat10()))).toEqual([]);
  });
});

describe("projects (A11, B18, T12, T27, T28)", () => {
  const project = (n: string): Project => fixture040(n);

  it.each([
    ["10_Katalog_Klein_Gemischt.json", "11_Projekt_Klein_Gemischt.json"],
    ["20_Katalog_Vollstaendige_Skalen.json", "21_Projekt_Vollstaendige_Skalen.json"],
    ["30_Katalog_Zweisprachig.json", "31_Projekt_Zweisprachig.json"],
    ["40_Katalog_Antworttypen_Logik.json", "41_Projekt_Antworttypen_Logik.json"],
  ])("%s with %s: loads without errors and nothing is added", (c, p) => {
    const r = applyProject(cat(c), project(p));
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.addedMandatory).toEqual([]);
  });

  it("round trip: saving the effective selection and loading it gives the same selection (T27)", () => {
    const c = cat40();
    const first = applyProject(c, project("41_Projekt_Antworttypen_Logik.json"));
    const saved: Project = { ...project("41_Projekt_Antworttypen_Logik.json"), selectedItemIds: first.selection };
    expect(applyProject(c, saved).selection).toEqual(first.selection);
  });

  it("T12: a project that omits a mandatory module gets all members added and reported", () => {
    const c = cat20();
    const p: Project = { ...project("21_Projekt_Vollstaendige_Skalen.json"), selectedItemIds: ["conscientiousness_01", ...c.items.filter((i) => i.id.startsWith("conscientiousness_")).map((i) => i.id)].filter((v, i, a) => a.indexOf(v) === i) };
    const r = applyProject(c, p);
    expect(r.addedMandatory).toHaveLength(10);
    expect(r.addedMandatory.every((id) => id.startsWith("extraversion_"))).toBe(true);
    const infos = r.diagnostics.filter((d) => d.code === "MANDATORY_ITEM_ADDED");
    expect(infos).toHaveLength(10);
    expect(infos.every((d) => d.severity === "info" && d.context === "project")).toBe(true);
    expect(infos[0]!.message).toMatch(/module_extraversion/);
    expect(r.selection).toHaveLength(20);
    // repair is no licence to rewrite other things: the result is still fully checked
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
  });

  it("does not repair other conflicts: a partial wholeScale stays an error", () => {
    const c = cat20();
    const p: Project = { ...project("21_Projekt_Vollstaendige_Skalen.json"), selectedItemIds: ["extraversion_01", "conscientiousness_01"] };
    const r = applyProject(c, p);
    expect(codes(r.diagnostics)).toContain("SCALE_PARTIAL_NOT_ALLOWED");
    expect(r.selection).toContain("conscientiousness_01");
    expect(r.selection).not.toContain("conscientiousness_02");
  });

  it("fixture 92: dependent question without its trigger -> DEPENDENCY_NOT_SELECTED", () => {
    const r = applyProject(cat40(), project("92_Fehler_Projekt_Ohne_Ausloeser.json"));
    const errs = r.diagnostics.filter((d) => d.severity === "error");
    expect(codes(errs)).toEqual(["DEPENDENCY_NOT_SELECTED"]);
    expect(errs[0]!.itemRef).toBe("other_test");
    expect(errs[0]!.stage).toBe("selection");
    expect(r.selection).toContain("other_test"); // not silently removed
  });

  it("T28: wrong catalog id or version is clarified, not guessed", () => {
    const c = cat10();
    const wrongId = { ...project("11_Projekt_Klein_Gemischt.json"), catalogRef: { id: "other", version: "1.0.0" } };
    const wrongVersion = { ...project("11_Projekt_Klein_Gemischt.json"), catalogRef: { id: "school_test_small", version: "1.0.1" } };
    for (const p of [wrongId, wrongVersion]) {
      const r = applyProject(c, p);
      expect(codes(r.diagnostics)).toEqual(["PROJECT_CATALOG_MISMATCH"]);
      expect(r.selection).toEqual([]);
    }
  });

  it("unknown ids are reported and ignored, never repaired", () => {
    const c = cat10();
    const p = { ...project("11_Projekt_Klein_Gemischt.json"), selectedItemIds: ["extraversion_01", "extraversion_02", "ghost_item"] };
    const r = applyProject(c, p);
    const d = r.diagnostics.find((x) => x.code === "UNKNOWN_ITEM_ID")!;
    expect(d.jsonPath).toBe("/selectedItemIds/2");
    expect(r.selection).toEqual(["extraversion_01", "extraversion_02"]);
  });

  it("questionnaire and language must match the catalog", () => {
    const c = cat10();
    const p = { ...project("11_Projekt_Klein_Gemischt.json"), questionnaireRef: "other_template", language: "fr" };
    const errors = applyProject(c, p).diagnostics.filter((d) => d.severity === "error");
    expect(codes(errors)).toEqual(["PROJECT_QUESTIONNAIRE_MISMATCH", "PROJECT_LANGUAGE_UNKNOWN"]);
  });

  it("the rich example loads with its own defaults", () => {
    const c: Catalog = example040();
    const p: Project = {
      schemaVersion: "0.4.0",
      documentType: "questionnaireProject",
      catalogRef: { id: c.catalog.id, version: c.catalog.version },
      questionnaireRef: c.questionnaire.id,
      selectedItemIds: [...initialSelection(c)],
      language: "en",
    };
    const r = applyProject(c, p);
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.selection).toContain("mood_slider");
  });
});
