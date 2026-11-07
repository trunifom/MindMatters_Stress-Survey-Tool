import { describe, expect, it } from "vitest";
import { validateCatalogSemantics } from "../../src/core/semantic";
import { checkRegisters } from "../../src/core/registers";
import { checkLanguages } from "../../src/core/languages";
import { checkFeatures } from "../../src/core/features";
import type { Catalog } from "../../src/core/types";
import { clone, example040, fixture040, POSITIVE_PAIRS } from "./helpers";

const sem = (c: unknown) => validateCatalogSemantics(c as Catalog);
const codes = (ds: { code: string }[]) => ds.map((d) => d.code);
const rich = (): any => clone(example040());

describe("positive fixtures and example", () => {
  it.each(POSITIVE_PAIRS.map((p) => p[0]))("%s has no errors", (name) => {
    const errors = sem(fixture040(name)).filter((d) => d.severity === "error");
    expect(errors).toEqual([]);
  });
  it("the rich example has no errors", () => {
    expect(sem(example040()).filter((d) => d.severity === "error")).toEqual([]);
  });
  it("the bilingual fixture is fully translated for participants", () => {
    expect(checkLanguages(fixture040("30_Katalog_Zweisprachig.json"))).toEqual([]);
  });
});

describe("duplicate ids and names", () => {
  it("DUPLICATE_ID for items with the item reference", () => {
    const c = rich();
    c.items[2].id = c.items[1].id;
    const d = checkRegisters(c).find((x) => x.code === "DUPLICATE_ID")!;
    expect(d.jsonPath).toBe("/items/2/id");
    expect(d.itemRef).toBe("demo_01");
  });
  it("DUPLICATE_ID in every register (sections, option sets)", () => {
    const c = rich();
    c.questionnaire.sections[1].id = c.questionnaire.sections[0].id;
    c.optionSets[1].id = c.optionSets[0].id;
    const ds = checkRegisters(c).filter((x) => x.code === "DUPLICATE_ID");
    expect(ds.map((d) => d.jsonPath).sort()).toEqual(["/optionSets/1/id", "/questionnaire/sections/1/id"]);
  });
  it("DUPLICATE_VARIABLE_NAME across items and hidden fields", () => {
    const c = rich();
    c.questionnaire.hiddenFields[0].variableName = c.items[1].variableName;
    const d = checkRegisters(c).find((x) => x.code === "DUPLICATE_VARIABLE_NAME")!;
    expect(d.message).toMatch(/demo_01/);
    expect(d.jsonPath).toBe("/questionnaire/hiddenFields/0/variableName");
  });
  it("DUPLICATE_OPTION_CODE", () => {
    const c = rich();
    c.optionSets[0].options[1].code = "1";
    expect(codes(checkRegisters(c))).toContain("DUPLICATE_OPTION_CODE");
  });
});

describe("references (T05)", () => {
  it("fixture 91: unknown optionSetRef gives exactly MISSING_OPTION_SET", () => {
    const ds = checkRegisters(fixture040("91_Fehler_Fehlende_Antwortliste.json"));
    expect(codes(ds)).toEqual(["MISSING_OPTION_SET"]);
    expect(ds[0]!.stage).toBe("reference");
    expect(ds[0]!.message).toMatch(/nonexistent/);
  });
  it("bundles repeated missing targets into one finding", () => {
    const c = rich();
    c.items[1].response.optionSetRef = "gone";
    c.items[2].response.optionSetRef = "gone";
    c.items[3].constructRefs = ["gone"];
    const ds = checkRegisters(c).filter((d) => d.code === "MISSING_OPTION_SET");
    expect(ds).toHaveLength(1);
    expect(ds[0]!.message).toMatch(/2 occurrences/);
  });
  it.each([
    ["rights profile", (c: any) => (c.items[1].rightsRef = "x"), "MISSING_RIGHTS_PROFILE"],
    ["instrument", (c: any) => (c.items[1].instrumentRef = "x"), "MISSING_INSTRUMENT"],
    ["construct", (c: any) => (c.items[1].constructRefs = ["x"]), "MISSING_CONSTRUCT"],
    ["source link", (c: any) => (c.instruments[0].administrationTime.sourceLinks[0].sourceRef = "x"), "MISSING_SOURCE"],
    ["template item", (c: any) => c.questionnaire.sections[0].itemRefs.push("x"), "MISSING_ITEM"],
    ["condition trigger", (c: any) => (c.items[6].visibleWhen.all[0].itemRef = "x"), "MISSING_ITEM"],
    [
      "score scale",
      (c: any) =>
        (c.scoringDefinitions = [
          { id: "s", itemRefs: ["demo_01"], scaleRef: "x", itemMappings: [], method: "sum", minimumAnswered: 1 },
        ]),
      "MISSING_SCALE",
    ],
    [
      "evidence target",
      (c: any) =>
        (c.evidence = [{ id: "e", type: "other", status: "unknown", targetType: "instrument", targetRef: "x" }]),
      "MISSING_INSTRUMENT",
    ],
  ])("MISSING reference for %s", (_n, mutate, code) => {
    const c = rich();
    mutate(c);
    expect(codes(checkRegisters(c))).toContain(code);
  });
});

describe("construct hierarchy", () => {
  const add = (c: any, id: string, parentRef?: string) =>
    c.constructs.push({ id, label: { en: id }, description: { en: id }, ...(parentRef ? { parentRef } : {}) });
  it("detects a cycle once", () => {
    const c = rich();
    add(c, "a", "b");
    add(c, "b", "c");
    add(c, "c", "a");
    const ds = checkRegisters(c).filter((d) => d.code === "CONSTRUCT_CYCLE");
    expect(ds).toHaveLength(1);
  });
  it("detects a self reference", () => {
    const c = rich();
    add(c, "a", "a");
    expect(codes(checkRegisters(c))).toContain("CONSTRUCT_CYCLE");
  });
  it("accepts a proper hierarchy", () => {
    const c = rich();
    add(c, "root");
    add(c, "child", "root");
    add(c, "grandchild", "child");
    expect(codes(checkRegisters(c))).not.toContain("CONSTRUCT_CYCLE");
  });
});

describe("dates", () => {
  it("updatedAt before createdAt", () => {
    const c = rich();
    c.catalog.createdAt = "2026-05-02T10:00:00Z";
    c.catalog.updatedAt = "2026-05-01T10:00:00Z";
    expect(codes(checkRegisters(c))).toContain("DATE_ORDER_INVALID");
  });
  it("compares instants across time zones", () => {
    const c = rich();
    c.catalog.createdAt = "2026-05-02T00:30:00+02:00"; // = 05-01T22:30Z
    c.catalog.updatedAt = "2026-05-01T23:00:00Z";
    expect(codes(checkRegisters(c))).not.toContain("DATE_ORDER_INVALID");
  });
});

describe("languages (T26)", () => {
  it("default language must be listed", () => {
    const c = rich();
    c.catalog.defaultLanguage = "fr";
    expect(codes(checkLanguages(c))).toContain("DEFAULT_LANGUAGE_NOT_LISTED");
  });
  it("undeclared language keys in any localized text", () => {
    const c = rich();
    c.items[1].text.fr = "Bonjour";
    c.optionSets[0].options[0].label.it = "x";
    const ds = checkLanguages(c);
    const d = ds.find((x) => x.code === "LANGUAGE_NOT_DECLARED" && x.message.includes('"fr"'))!;
    expect(d.jsonPath).toBe("/items/1/text/fr");
    expect(ds.some((x) => x.message.includes('"it"'))).toBe(true);
  });
  it("missing participant translation is a per-language warning, never auto-filled", () => {
    const c = rich();
    const baseline = checkLanguages(c).filter((x) => x.code === "MISSING_TRANSLATION").length;
    delete c.items[1].text["de-CH"];
    const ds = checkLanguages(c).filter((x) => x.code === "MISSING_TRANSLATION");
    expect(ds.length).toBeGreaterThanOrEqual(1);
    expect(ds.length).toBeGreaterThanOrEqual(baseline);
    expect(ds.every((d) => d.severity === "warning")).toBe(true);
    expect(ds.some((d) => d.message.includes("de-CH"))).toBe(true);
  });
  it("administrative texts may fall back and are not reported", () => {
    const base = rich();
    const before = checkLanguages(base).length;
    const c = rich();
    c.items[1].organizerHelp = { en: "only english" };
    c.items[1].documentation = { summary: { en: "only english" } };
    expect(checkLanguages(c).length).toBe(before);
  });
  it("does not mistake extension data or plain strings for localized texts", () => {
    const c = rich();
    c.items[1].extensions = {
      "org_x.thing": { kind: "metadata", version: "1", data: { text: { xx: "not a language" }, title: { yy: "z" } } },
    };
    c.sources[0].title = "Plain string title";
    expect(checkLanguages(c).some((x) => x.code === "LANGUAGE_NOT_DECLARED")).toBe(false);
  });
});

describe("features (T07, T08)", () => {
  it("always-required features must be declared", () => {
    const c = rich();
    c.requiredFeatures = c.requiredFeatures.filter((f: string) => f !== "requiredAnswer");
    expect(codes(checkFeatures(c))).toContain("REQUIRED_FEATURE_MISSING");
  });
  it("unknown required feature blocks normal processing", () => {
    const c = rich();
    c.requiredFeatures.push("quantumBranching");
    const d = checkFeatures(c).find((x) => x.code === "UNKNOWN_FEATURE")!;
    expect(d.severity).toBe("error");
    expect(d.jsonPath).toBe("/requiredFeatures/" + (c.requiredFeatures.length - 1));
  });
  it.each([
    ["sliderResponse"],
    ["rankingResponse"],
    ["noteItems"],
    ["randomization"],
    ["compoundVisibility"],
    ["simpleVisibility"],
    ["selectionModules"],
  ])("used feature %s must be declared", (feature) => {
    const c = rich();
    if (feature === "selectionModules") {
      c.modules = [
        {
          id: "m",
          title: { en: "m" },
          description: { en: "m" },
          itemRefs: ["demo_01"],
          selectionMode: "independent",
          inclusionRequired: false,
          defaultSelected: false,
        },
      ];
    }
    c.requiredFeatures = c.requiredFeatures.filter((f: string) => f !== feature);
    const ds = checkFeatures(c).filter((x) => x.code === "FEATURE_NOT_DECLARED");
    expect(ds.length).toBeGreaterThan(0);
    expect(ds[0]!.message).toContain(feature);
  });
  it("wholeScaleSelection is required when a wholeScale exists", () => {
    const c = fixture040("20_Katalog_Vollstaendige_Skalen.json");
    expect(checkFeatures(c)).toEqual([]);
    c.requiredFeatures = c.requiredFeatures.filter((f: string) => f !== "wholeScaleSelection");
    expect(checkFeatures(c)[0]!.code).toBe("FEATURE_NOT_DECLARED");
  });
  it("extended operators alone require compoundVisibility", () => {
    const c = fixture040("40_Katalog_Antworttypen_Logik.json");
    expect(checkFeatures(c)).toEqual([]);
    c.items.find((i: any) => i.id === "other_test").visibleWhen.operator = "notContains";
    expect(checkFeatures(c).some((d) => d.message.includes("compoundVisibility"))).toBe(true);
  });
  it("behavior extensions need a declared feature", () => {
    const c = rich();
    c.items[1].extensions = { "org_x.run": { kind: "behavior", version: "1", featureId: "orgRun", data: {} } };
    expect(codes(checkFeatures(c))).toContain("FEATURE_NOT_DECLARED");
    c.requiredFeatures.push("orgRun");
    expect(codes(checkFeatures(c))).toEqual(["UNKNOWN_FEATURE"]); // declared but unsupported -> blocked
  });
  it("metadata extensions need no feature and are preserved (T08)", () => {
    const c = fixture040("10_Katalog_Klein_Gemischt.json");
    expect(c.items[0].extensions["org_example.sourceKey"].kind).toBe("metadata");
    expect(checkFeatures(c)).toEqual([]);
  });
});
