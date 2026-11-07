import { describe, expect, it } from "vitest";
import { checkConditions, checkModules, checkTemplate, templateOrder } from "../../src/core/structure";
import { checkScoring } from "../../src/core/scoring";
import { validateCatalogSemantics } from "../../src/core/semantic";
import type { Catalog } from "../../src/core/types";
import { clone, example040, fixture040, POSITIVE_PAIRS } from "./helpers";

const tpl = (c: unknown) => checkTemplate(c as Catalog);
const cond = (c: unknown) => checkConditions(c as Catalog);
const mods = (c: unknown) => checkModules(c as Catalog);
const score = (c: unknown) => checkScoring(c as Catalog);
const codes = (ds: { code: string }[]) => ds.map((d) => d.code);
const item = (c: any, id: string) => c.items.find((i: any) => i.id === id);

const cat20 = (): any => fixture040("20_Katalog_Vollstaendige_Skalen.json");
const cat40 = (): any => fixture040("40_Katalog_Antworttypen_Logik.json");
const rich = (): any => clone(example040());

describe("positive data", () => {
  it.each(POSITIVE_PAIRS.map((p) => p[0]))("%s: no template, condition, module or scoring errors", (name) => {
    const c = fixture040(name);
    const all = [...tpl(c), ...cond(c), ...mods(c), ...score(c)];
    expect(all).toEqual([]);
  });
  it("rich example is clean", () => {
    const c = rich();
    expect([...tpl(c), ...cond(c), ...mods(c), ...score(c)]).toEqual([]);
  });
  it("the whole semantic validator reports no error on any positive input", () => {
    for (const [name] of POSITIVE_PAIRS) {
      const errs = validateCatalogSemantics(fixture040(name)).filter((d) => d.severity === "error");
      expect(errs, name).toEqual([]);
    }
    expect(validateCatalogSemantics(rich()).filter((d) => d.severity === "error")).toEqual([]);
  });
});

describe("questionnaire template (B15, T43)", () => {
  it("template order follows sections then items", () => {
    const o = templateOrder(cat40());
    expect(o.get("extraversion_01")).toBe(0);
    expect(o.get("age_test")! > o.get("self_efficacy_08")!).toBe(true);
  });
  it("an item missing from the template is an error", () => {
    const c = cat40();
    c.questionnaire.sections[1].itemRefs = c.questionnaire.sections[1].itemRefs.filter((x: string) => x !== "date_test");
    const d = tpl(c);
    expect(codes(d)).toEqual(["TEMPLATE_ITEM_MISSING"]);
    expect(d[0]!.itemRef).toBe("date_test");
  });
  it("an item used twice (same or other section) is a profile error, not a duplicate variable", () => {
    const c = cat40();
    c.questionnaire.sections[1].itemRefs.push("extraversion_01");
    const d = tpl(c);
    expect(codes(d)).toEqual(["TEMPLATE_ITEM_DUPLICATE"]);
    expect(d[0]!.itemRef).toBe("extraversion_01");
    c.questionnaire.sections[0].itemRefs.push("extraversion_01");
    expect(tpl(c).length).toBe(2);
  });
  it("an unknown template item is left to the reference check", () => {
    const c = cat40();
    c.questionnaire.sections[0].itemRefs.push("ghost");
    expect(tpl(c)).toEqual([]);
    expect(codes(validateCatalogSemantics(c))).toContain("MISSING_ITEM");
  });
});

describe("conditions (B16, T33)", () => {
  const other = (c: any) => item(c, "other_test");
  it("catalog 40: contains 'other' on areas_test is valid", () => {
    expect(cond(cat40())).toEqual([]);
  });
  it("self reference", () => {
    const c = cat40();
    other(c).visibleWhen.itemRef = "other_test";
    expect(codes(cond(c))).toEqual(["CONDITION_SELF_REFERENCE"]);
  });
  it("trigger must stand before the dependent item", () => {
    const c = cat40();
    const own = c.questionnaire.sections[1].itemRefs;
    own.splice(own.indexOf("other_test"), 1);
    own.splice(own.indexOf("areas_test"), 0, "other_test"); // other_test now before areas_test
    expect(codes(cond(c))).toEqual(["CONDITION_TRIGGER_NOT_BEFORE"]);
  });
  it.each([
    ["equals on multipleChoice", "equals", "other"],
    ["notEquals on multipleChoice", "notEquals", "other"],
    ["greaterThan on multipleChoice", "greaterThan", "1"],
  ])("operator/type mismatch: %s", (_n, operator, value) => {
    const c = cat40();
    Object.assign(other(c).visibleWhen, { operator, value });
    expect(codes(cond(c))).toEqual(["CONDITION_OPERATOR_TYPE"]);
  });
  it("contains on a single choice is a mismatch", () => {
    const c = cat40();
    Object.assign(other(c).visibleWhen, { itemRef: "yes_no_test", operator: "contains", value: "yes" });
    // yes_no_test stands after other_test; operator mismatch is reported first
    expect(cond(c).map((d) => d.code)).toContain("CONDITION_OPERATOR_TYPE");
  });
  it("value must be an option code of the trigger", () => {
    const c = cat40();
    other(c).visibleWhen.value = "nothing";
    expect(codes(cond(c))).toEqual(["CONDITION_VALUE_INVALID"]);
  });
  it("a missing-role option code is a valid trigger value", () => {
    const c = cat40();
    const own = c.questionnaire.sections[1].itemRefs;
    own.splice(own.indexOf("other_test"), 1);
    own.push("other_test"); // after missing_test
    Object.assign(other(c).visibleWhen, { itemRef: "missing_test", operator: "equals", value: "refused" });
    expect(cond(c)).toEqual([]);
  });
  it("numeric operators need a numeric trigger and a numeric value", () => {
    const c = cat40();
    const ageIdx = c.questionnaire.sections[1].itemRefs.indexOf("age_test");
    expect(ageIdx).toBe(0);
    Object.assign(other(c).visibleWhen, { itemRef: "age_test", operator: "greaterThanOrEqual", value: "14" });
    expect(cond(c)).toEqual([]);
    other(c).visibleWhen.value = "fourteen";
    expect(codes(cond(c))).toEqual(["CONDITION_VALUE_INVALID"]);
    other(c).visibleWhen.value = " ";
    expect(codes(cond(c))).toEqual(["CONDITION_VALUE_INVALID"]);
  });
  it("numeric comparison on a single choice is not allowed (open decision)", () => {
    const c = cat40();
    Object.assign(other(c).visibleWhen, { itemRef: "extraversion_01", operator: "greaterThanOrEqual", value: "4" });
    expect(codes(cond(c))).toEqual(["CONDITION_OPERATOR_TYPE"]);
  });
  it("groups: every leaf is checked", () => {
    const c = rich();
    const mail = item(c, "contact_email");
    mail.visibleWhen.all[0].value = "maybe";
    mail.visibleWhen.all[1].itemRef = "contact_email";
    expect(codes(cond(c)).sort()).toEqual(["CONDITION_SELF_REFERENCE", "CONDITION_VALUE_INVALID"]);
  });
  it("any-groups are checked like all-groups", () => {
    const c = rich();
    const mail = item(c, "contact_email");
    mail.visibleWhen = { any: mail.visibleWhen.all };
    expect(cond(c)).toEqual([]);
    mail.visibleWhen.any[0].operator = "contains";
    expect(codes(cond(c))).toEqual(["CONDITION_OPERATOR_TYPE"]);
  });
  it("detects a cycle of triggers", () => {
    // two items that depend on each other; the order rule fires too, the cycle is reported once
    const c = cat40();
    item(c, "areas_test").visibleWhen = { itemRef: "other_test", operator: "contains", value: "x" };
    const ds = cond(c);
    expect(codes(ds).filter((x) => x === "CONDITION_CYCLE")).toHaveLength(1);
  });
  it("an unknown trigger is left to the reference check", () => {
    const c = cat40();
    other(c).visibleWhen.itemRef = "ghost";
    expect(cond(c)).toEqual([]);
  });
});

describe("modules (B14, T13, T16)", () => {
  it("catalog 20: required module with item flags false is valid", () => {
    expect(mods(cat20())).toEqual([]);
  });
  it("optional allOrNothing module with a mandatory item (T13)", () => {
    const c = cat20();
    const m = c.modules.find((x: any) => x.id === "module_conscientiousness");
    item(c, m.itemRefs[0]).inclusionRequired = true;
    const d = mods(c);
    expect(codes(d)).toEqual(["MODULE_OPTIONAL_HAS_REQUIRED_ITEM"]);
    expect(d[0]!.moduleRef).toBe("module_conscientiousness");
  });
  it("item defaultSelected must equal the module default", () => {
    const c = cat20();
    item(c, "self_efficacy_03").defaultSelected = false;
    expect(codes(mods(c))).toEqual(["MODULE_DEFAULT_MISMATCH"]);
  });
  it("an item may belong to one module only", () => {
    const c = cat20();
    c.modules[1].itemRefs.push("extraversion_01");
    const d = mods(c);
    expect(codes(d)).toContain("ITEM_IN_MULTIPLE_MODULES");
    expect(d.find((x) => x.code === "ITEM_IN_MULTIPLE_MODULES")!.itemRef).toBe("extraversion_01");
  });
  it("scaleRefs must lie completely inside the module", () => {
    const c = cat20();
    c.modules[0].itemRefs = c.modules[0].itemRefs.slice(1);
    expect(codes(mods(c))).toContain("MODULE_SCALE_NOT_CONTAINED");
  });
  it("independent modules do not trigger allOrNothing rules", () => {
    const c = fixture040("10_Katalog_Klein_Gemischt.json");
    expect(mods(c)).toEqual([]);
  });
});

describe("scoring definitions (B17, T44)", () => {
  const def = (c: any) => c.scoringDefinitions[0];
  it("catalog 20 definitions are complete", () => {
    expect(score(cat20())).toEqual([]);
  });
  it("minimumAnswered cannot exceed the item count", () => {
    const c = cat20();
    def(c).minimumAnswered = 11;
    expect(codes(score(c))).toEqual(["SCORE_MINIMUM_EXCEEDS_ITEMS"]);
  });
  it("exactly one mapping per item: missing, duplicate and extra", () => {
    const c = cat20();
    const removed = def(c).itemMappings.pop();
    expect(codes(score(c))).toEqual(["SCORE_MAPPING_MISSING"]);
    def(c).itemMappings.push(removed, clone(removed));
    expect(codes(score(c))).toEqual(["SCORE_MAPPING_DUPLICATE"]);
    def(c).itemMappings.pop();
    def(c).itemMappings.push({ ...clone(removed), itemRef: "conscientiousness_01" });
    expect(codes(score(c))).toContain("SCORE_MAPPING_EXTRA");
  });
  it("every option code exactly once: uncovered, unknown, duplicate", () => {
    const c = cat20();
    const m = def(c).itemMappings[0];
    const last = m.rawToScore.pop();
    expect(codes(score(c))).toEqual(["SCORE_CODE_UNCOVERED"]);
    m.rawToScore.push(last, { code: "5", score: 5 });
    expect(codes(score(c))).toContain("SCORE_CODE_DUPLICATE");
    m.rawToScore.pop();
    m.rawToScore.push({ code: "9", score: 9 });
    expect(codes(score(c))).toContain("SCORE_CODE_UNKNOWN");
  });
  it("roles: missing codes belong to missingCodes, substantive to rawToScore", () => {
    const c = rich();
    c.scoringDefinitions = [
      {
        id: "s1",
        title: { en: "s" },
        itemRefs: ["demo_01"],
        method: "mean",
        minimumAnswered: 1,
        interpretationDirection: "notSpecified",
        itemMappings: [
          {
            itemRef: "demo_01",
            rawToScore: [1, 2, 3, 4, 5].map((n) => ({ code: String(n), score: n })),
            missingCodes: ["refused"],
          },
        ],
      },
    ];
    expect(score(c)).toEqual([]);
    c.scoringDefinitions[0].itemMappings[0].rawToScore.push({ code: "refused", score: 0 });
    c.scoringDefinitions[0].itemMappings[0].missingCodes = [];
    expect(codes(score(c))).toContain("SCORE_ROLE_MISMATCH");
    c.scoringDefinitions[0].itemMappings[0].rawToScore.pop();
    c.scoringDefinitions[0].itemMappings[0].missingCodes = ["refused", "3"];
    c.scoringDefinitions[0].itemMappings[0].rawToScore = c.scoringDefinitions[0].itemMappings[0].rawToScore.filter((r: any) => r.code !== "3");
    expect(codes(score(c))).toEqual(["SCORE_ROLE_MISMATCH"]);
  });
  it("only single choice items can be scored", () => {
    const c = cat40();
    c.scoringDefinitions = [
      {
        id: "s2",
        title: { en: "s" },
        itemRefs: ["age_test"],
        method: "sum",
        minimumAnswered: 1,
        interpretationDirection: "notSpecified",
        itemMappings: [{ itemRef: "age_test", rawToScore: [{ code: "1", score: 1 }], missingCodes: [] }],
      },
    ];
    expect(codes(score(c))).toEqual(["SCORE_ITEM_NOT_SINGLE_CHOICE"]);
  });
});
