import { describe, expect, it } from "vitest";
import { buildRedcap } from "../../src/output/redcap";
import { buildGoogleForms } from "../../src/output/googleforms";
import { buildBauplan, codeSpan } from "../../src/output/bauplan";
import { buildNeutralCsv } from "../../src/output/csvtable";
import { buildQualtrics } from "../../src/output/qualtrics";
import { buildLimeSurvey } from "../../src/output/limesurvey";
import { clone, example040 } from "./helpers";

function without(c: any, drop: string[]): void {
  c.items = c.items.filter((i: any) => !drop.includes(i.id));
  for (const s of c.questionnaire.sections) s.itemRefs = s.itemRefs.filter((x: string) => !drop.includes(x));
  for (const m of c.modules) m.itemRefs = m.itemRefs.filter((x: string) => !drop.includes(x));
}
/** The rich example without the slider and the display condition (valid for every adapter that cannot do them). */
function base(): any {
  const c = clone(example040());
  without(c, ["mood_slider"]);
  for (const i of c.items) delete i.visibleWhen;
  return c;
}
const sel = (c: any): Set<string> => new Set(c.items.map((i: any) => i.id));
const go = (fn: any, c: any): any => fn(c, sel(c), { language: "en", mode: "test" });
const plan = (c: any, p: "unipark" | "surveymonkey" = "unipark"): any => buildBauplan(p, c, sel(c), { language: "en", mode: "test" });
const errors = (r: any): string[] => r.diagnostics.filter((d: any) => d.severity === "error").map((d: any) => d.code);
const item = (c: any, id: string): any => c.items.find((i: any) => i.id === id);

describe("audit: Qualtrics", () => {
  it("an item cannot take an export tag the adapter writes itself (mm_intro, mm_closing, mm_s_<section>)", () => {
    expect(errors(go(buildQualtrics, base()))).toEqual([]);
    for (const tag of ["mm_intro", "mm_closing"]) {
      const c = base();
      item(c, "demo_01").variableName = tag;
      expect(errors(go(buildQualtrics, c)), tag).toContain("EXPORT_VARIABLE_NAME_DUPLICATE");
    }
    const c = base();
    c.questionnaire.sections[1].instruction = { en: "Hello", "de-CH": "Hallo" };
    item(c, "demo_01").variableName = "mm_s_battery";
    expect(errors(go(buildQualtrics, c))).toContain("EXPORT_VARIABLE_NAME_DUPLICATE");
  });

  it("recode values with leading zeros are the same integer: 01 and 1 are duplicates", () => {
    const c = base();
    const os = c.optionSets.find((o: any) => o.id === "yes_no");
    os.options[0].exportHints = { qualtrics: { code: "01" } };
    os.options[1].exportHints = { qualtrics: { code: "1" } };
    expect(errors(go(buildQualtrics, c))).toContain("EXPORT_OPTION_CODE_DUPLICATE");
  });

  it("square brackets in a block name cannot end the block tag and are reported", () => {
    const c = base();
    c.questionnaire.sections[1].title.en = "Stress [1]";
    const r = go(buildQualtrics, c);
    expect(r.ok, JSON.stringify(errors(r))).toBe(true);
    expect(r.content).toContain("[[Block:Stress (1)]]");
    expect(r.mapping.some((m: any) => m.feature === "block.name")).toBe(true);
  });

  it("a NUL character or a lone surrogate in a text is an error, never written; emoji and RTL are fine", () => {
    for (const bad of ["a\u0000b", "x\ud800y", "x\udc00y", "x\u001by"]) {
      const c = base();
      item(c, "demo_01").text.en = bad;
      const r = go(buildQualtrics, c);
      expect(r.ok).toBe(false);
      expect(errors(r)).toContain("EXPORT_TEXT_CHARACTER_INVALID");
    }
    const c = base();
    item(c, "demo_01").text.en = "Emoji \u{1F600}, RTL א,   line separator";
    expect(go(buildQualtrics, c).ok).toBe(true);
  });
});

describe("audit: control characters in every adapter", () => {
  const adapters: Array<[string, (c: any) => any]> = [
    ["limesurvey", (c) => go(buildLimeSurvey, c)],
    ["redcap", (c) => go(buildRedcap, c)],
    ["googleforms", (c) => go(buildGoogleForms, c)],
    ["csv", (c) => go(buildNeutralCsv, c)],
    ["bauplan", (c) => plan(c)],
  ];
  for (const [name, run] of adapters) {
    it(`${name}: NUL in a text is an error`, () => {
      const c = base();
      item(c, "demo_01").text.en = "a\u0000b";
      const r = run(c);
      expect(r.ok).toBe(false);
      expect(errors(r)).toContain("EXPORT_TEXT_CHARACTER_INVALID");
    });
  }
});

describe("audit: sensitive items in the newer adapters", () => {
  it("an explicitly selected item that is excluded by default is reported as info", () => {
    const c = base();
    item(c, "demo_02").sensitivity = { ...(item(c, "demo_02").sensitivity ?? { level: "high" }), excludeFromExportByDefault: true };
    const runs: Array<[string, any]> = [
      ["redcap", go(buildRedcap, c)],
      ["googleforms", go(buildGoogleForms, c)],
      ["csv", go(buildNeutralCsv, c)],
      ["bauplan", plan(c)],
    ];
    for (const [name, r] of runs) {
      expect(r.diagnostics.some((d: any) => d.code === "EXPORT_SENSITIVE_INCLUDED" && d.itemRef === "demo_02"), name).toBe(true);
    }
  });
});

describe("audit: REDCap", () => {
  it("an item cannot take a field name the adapter writes itself (mm_*, record_id)", () => {
    for (const n of ["mm_intro", "mm_closing", "record_id"]) {
      const c = base();
      without(c, ["rank_topics"]);
      item(c, "demo_01").variableName = n;
      delete item(c, "demo_01").exportHints;
      expect(errors(go(buildRedcap, c)), n).toContain("EXPORT_VARIABLE_NAME_DUPLICATE");
    }
  });

  it("a section instruction is not dropped: it is appended to the section header and reported", () => {
    const c = base();
    without(c, ["rank_topics"]);
    c.questionnaire.sections[1].instruction = { en: "Tick one per row", "de-CH": "Eine pro Zeile" };
    const r = go(buildRedcap, c);
    expect(r.ok, JSON.stringify(errors(r))).toBe(true);
    expect(r.content).toContain("<br>Tick one per row");
    expect(r.mapping.some((m: any) => m.feature === "section.instruction")).toBe(true);
  });

  it("checkbox codes that differ only by case collide (REDCap lowercases them in the variable name)", () => {
    const c = base();
    const os = c.optionSets.find((o: any) => o.id === "support_topics");
    os.options[0].code = "A";
    os.options[1].code = "a";
    item(c, "demo_04").response = { kind: "multipleChoice", optionSetRef: "support_topics" };
    without(c, ["wants_help"]);
    expect(errors(go(buildRedcap, c))).toContain("EXPORT_OPTION_CODE_DUPLICATE");
  });
});

describe("audit: Google Forms", () => {
  it("a slider with a step other than 1 is an error instead of a silent step 1", () => {
    const c = clone(example040());
    without(c, ["rank_topics"]);
    for (const i of c.items) delete i.visibleWhen;
    const s = item(c, "mood_slider");
    s.response = { ...s.response, minimum: 1, maximum: 5, step: 0.5 };
    expect(errors(go(buildGoogleForms, c))).toContain("EXPORT_RESPONSE_UNSUPPORTED");
    s.response.step = 1;
    expect(errors(go(buildGoogleForms, c))).not.toContain("EXPORT_RESPONSE_UNSUPPORTED");
  });
});

describe("audit: build plan Markdown", () => {
  it("option codes, hidden-field values and variable names can never leave their code span", () => {
    expect(codeSpan("a`b")).toBe("``a`b``");
    expect(codeSpan("`x`")).toBe("`` `x` ``");
    expect(codeSpan("a\nb")).toBe("`a b`");
    const c = base();
    c.optionSets.find((o: any) => o.id === "yes_no").options[0].code = "y`<script>|x";
    const r = plan(c, "surveymonkey");
    expect(r.ok, JSON.stringify(errors(r))).toBe(true);
    expect(r.content).toContain("``y`<script>\\|x``");
  });
});
