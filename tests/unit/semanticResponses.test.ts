import { describe, expect, it } from "vitest";
import { checkOptionSets, checkResponses } from "../../src/core/responses";
import { validateCatalogSemantics } from "../../src/core/semantic";
import type { Catalog } from "../../src/core/types";
import { clone, example040, fixture040, POSITIVE_PAIRS } from "./helpers";

const resp = (c: unknown) => checkResponses(c as Catalog);
const opts = (c: unknown) => checkOptionSets(c as Catalog);
const codes = (ds: { code: string }[]) => ds.map((d) => d.code);

/** Catalog 40 has all core answer types; its areas_test is the multiple-choice case. */
const cat40 = (): any => fixture040("40_Katalog_Antworttypen_Logik.json");
const item = (c: any, id: string) => c.items.find((i: any) => i.id === id);

describe("positive data", () => {
  it.each(POSITIVE_PAIRS.map((p) => p[0]))("%s: no response or option errors", (name) => {
    const c = fixture040(name);
    expect([...opts(c), ...resp(c)].filter((d) => d.severity === "error")).toEqual([]);
  });
  it("the rich example is fine", () => {
    const c = clone(example040());
    expect([...opts(c), ...resp(c)]).toEqual([]);
  });
});

describe("ordinal option sets (B10)", () => {
  it("accepts the IPIP 5-point scale", () => {
    expect(opts(fixture040("10_Katalog_Klein_Gemischt.json"))).toEqual([]);
  });
  it("rejects a missing position", () => {
    const c = cat40();
    delete c.optionSets[0].options[2].ordinalPosition;
    expect(codes(opts(c))).toEqual(["ORDINAL_POSITIONS_INVALID"]);
  });
  it("rejects duplicate positions", () => {
    const c = cat40();
    c.optionSets[0].options[2].ordinalPosition = 2;
    expect(opts(c)[0]!.message).toMatch(/more than once/);
  });
  it("rejects options not listed in ascending order", () => {
    const c = cat40();
    const o = c.optionSets[0].options;
    [o[0], o[1]] = [o[1], o[0]];
    expect(opts(c)[0]!.message).toMatch(/ascending/);
  });
  it("ignores missing-role options and nominal sets", () => {
    const c = cat40();
    expect(opts(c)).toEqual([]); // missing_demo / areas are nominal or unlabeled
  });
});

describe("numeric, text and date ranges (T21)", () => {
  it("minimum greater than maximum", () => {
    const c = cat40();
    item(c, "age_test").response.minimum = 30;
    const d = resp(c)[0]!;
    expect(d.code).toBe("RANGE_INVALID");
    expect(d.itemRef).toBe("age_test");
    expect(d.jsonPath).toBe("/items/12/response");
  });
  it("equal bounds are allowed and zero is a legal value inside the range", () => {
    const c = cat40();
    item(c, "age_test").response.minimum = 0;
    item(c, "age_test").response.maximum = 0;
    expect(resp(c)).toEqual([]);
  });
  it("minLength greater than maxLength", () => {
    const c = cat40();
    Object.assign(item(c, "comment_test").response, { minLength: 10, maxLength: 5 });
    expect(codes(resp(c))).toEqual(["RANGE_INVALID"]);
  });
  it("required text with maxLength 0 is unsatisfiable, optional is not", () => {
    const c = cat40();
    item(c, "other_test").response.maxLength = 0;
    expect(codes(resp(c))).toEqual([]);
    item(c, "other_test").answerRequired = true;
    expect(codes(resp(c))).toEqual(["ANSWER_UNSATISFIABLE"]);
  });
  it("date minimum after maximum", () => {
    const c = cat40();
    Object.assign(item(c, "date_test").response, { minimum: "2026-12-31", maximum: "2026-01-01" });
    expect(codes(resp(c))).toEqual(["RANGE_INVALID"]);
  });
});

describe("multiple choice satisfiability (T22)", () => {
  const areas = (c: any) => item(c, "areas_test");
  it("catalog 40 areas_test (min 1, max 2, exclusive none) is satisfiable", () => {
    expect(resp(cat40())).toEqual([]);
  });
  it("exclusive code with minSelections >= 2 is a catalog error (audit correction)", () => {
    const c = cat40();
    areas(c).response.minSelections = 2;
    expect(codes(resp(c))).toContain("EXCLUSIVE_CODE_UNSELECTABLE");
  });
  it("required question with maxSelections 0 is unsatisfiable", () => {
    const c = cat40();
    Object.assign(areas(c), { answerRequired: true });
    Object.assign(areas(c).response, { minSelections: 0, maxSelections: 0, exclusiveCodes: [] });
    expect(codes(resp(c))).toEqual(["ANSWER_UNSATISFIABLE"]);
    expect(resp(c)[0]!.severity).toBe("error");
  });
  it("optional question with maxSelections 0 is only a warning", () => {
    const c = cat40();
    Object.assign(areas(c).response, { minSelections: 0, maxSelections: 0, exclusiveCodes: [] });
    const d = resp(c);
    expect(codes(d)).toEqual(["ANSWER_UNSATISFIABLE"]);
    expect(d[0]!.severity).toBe("warning");
  });
  it("min greater than max", () => {
    const c = cat40();
    Object.assign(areas(c).response, { minSelections: 3, maxSelections: 2 });
    expect(codes(resp(c))).toEqual(["RANGE_INVALID"]);
  });
  it("minimum above the number of options cannot be met", () => {
    const c = cat40(); // areas has 4 options
    Object.assign(areas(c), { answerRequired: true });
    Object.assign(areas(c).response, { minSelections: 5, maxSelections: 5, exclusiveCodes: [] });
    expect(codes(resp(c))).toContain("ANSWER_UNSATISFIABLE");
  });
  it("min equal to the number of options is satisfiable", () => {
    const c = cat40();
    Object.assign(areas(c).response, { minSelections: 4, maxSelections: 4, exclusiveCodes: [] });
    expect(resp(c)).toEqual([]);
  });
  it("min 2 is fine when there are no exclusive codes", () => {
    const c = cat40();
    Object.assign(areas(c).response, { minSelections: 2, maxSelections: 3, exclusiveCodes: [] });
    expect(resp(c)).toEqual([]);
  });
  it("exclusive code must exist in the option set", () => {
    const c = cat40();
    areas(c).response.exclusiveCodes = ["nothing"];
    expect(codes(resp(c))).toContain("EXCLUSIVE_CODE_UNKNOWN");
  });
  it("maxSelections above the option count is a warning", () => {
    const c = cat40();
    areas(c).response.maxSelections = 9;
    const d = resp(c);
    expect(codes(d)).toEqual(["SELECTION_LIMIT_EXCEEDS_OPTIONS"]);
    expect(d[0]!.severity).toBe("warning");
  });
  it("an unknown option set is left to the reference check (no crash, no duplicate finding)", () => {
    const c = cat40();
    areas(c).response.optionSetRef = "gone";
    expect(resp(c)).toEqual([]);
    expect(codes(validateCatalogSemantics(c))).toContain("MISSING_OPTION_SET");
  });
});

describe("slider and ranking", () => {
  const rich = (): any => clone(example040());
  it("slider minimum must be below maximum", () => {
    const c = rich();
    item(c, "mood_slider").response.minimum = 100;
    expect(codes(resp(c))).toEqual(["SLIDER_RANGE_INVALID"]);
  });
  it("slider step larger than the range", () => {
    const c = rich();
    item(c, "mood_slider").response.step = 500;
    expect(codes(resp(c))).toEqual(["SLIDER_RANGE_INVALID"]);
  });
  it("ranking maxRanks above the number of substantive options", () => {
    const c = rich();
    item(c, "rank_topics").response.maxRanks = 4;
    expect(codes(resp(c))).toEqual(["RANKING_MAX_EXCEEDS_OPTIONS"]);
  });
  it("ranking with maxRanks equal to the options is fine", () => {
    const c = rich();
    item(c, "rank_topics").response.maxRanks = 3;
    expect(resp(c)).toEqual([]);
  });
});

describe("presentation compatibility (B13)", () => {
  const rich = (): any => clone(example040());
  it("slider widget on a slider is fine; on a text item it is not", () => {
    const c = rich();
    expect(resp(c)).toEqual([]);
    item(c, "contact_email").presentation = { widget: "slider" };
    expect(codes(resp(c))).toEqual(["PRESENTATION_INCOMPATIBLE"]);
  });
  it.each([
    ["radio", "demo_01", true],
    ["dropdown", "demo_01", true],
    ["checkbox", "demo_01", false],
    ["number", "demo_01", false],
    ["text", "contact_email", true],
    ["textarea", "contact_email", false],
  ])("widget %s on %s is compatible: %s", (widget, id, ok) => {
    const c = rich();
    item(c, id).presentation = { widget };
    expect(resp(c).length === 0).toBe(ok);
  });
  it("orientation alone never conflicts", () => {
    const c = rich();
    item(c, "contact_email").presentation = { orientation: "horizontal" };
    expect(resp(c)).toEqual([]);
  });
  it("notes and rankings accept no widget", () => {
    const c = rich();
    item(c, "intro_note").presentation = { widget: "text" };
    item(c, "rank_topics").presentation = { widget: "radio" };
    expect(resp(c).map((d) => d.itemRef).sort()).toEqual(["intro_note", "rank_topics"]);
  });
});
