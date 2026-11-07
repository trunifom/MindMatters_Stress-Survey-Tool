import { Script } from "node:vm";
import { describe, expect, it } from "vitest";
import { buildRedcap } from "../../src/output/redcap";
import { buildGoogleForms, jsStr } from "../../src/output/googleforms";
import { buildBauplan } from "../../src/output/bauplan";
import { buildNeutralCsv, guardCell } from "../../src/output/csvtable";
import type { Catalog } from "../../src/core/types";
import { clone, example040 } from "./helpers";

const everything = (c: Catalog): Set<string> => new Set(c.items.map((i) => i.id));
/** The rich example without the given items (and without display conditions if asked). */
function variant(drop: string[], noConditions = false): any {
  const c = clone(example040());
  c.items = c.items.filter((i: any) => !drop.includes(i.id));
  for (const s of c.questionnaire.sections) s.itemRefs = s.itemRefs.filter((x: string) => !drop.includes(x));
  for (const m of c.modules) m.itemRefs = m.itemRefs.filter((x: string) => !drop.includes(x));
  if (noConditions) for (const i of c.items) delete i.visibleWhen;
  return c;
}
const run = (fn: (c: any, s: Set<string>, o: any) => any, c: any, mode: "native" | "test" = "test", language = "en") => fn(c, everything(c), { language, mode });

/** Minimal CSV reader (every cell quoted). */
function csv(text: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [];
  let cur = "";
  let q = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i] as string;
    if (q) {
      if (ch === '"' && text[i + 1] === '"') { cur += '"'; i++; } else if (ch === '"') q = false; else cur += ch;
    } else if (ch === '"') q = true;
    else if (ch === ",") { row.push(cur); cur = ""; }
    else if (ch === "\n") { row.push(cur); rows.push(row); row = []; cur = ""; }
    else cur += ch;
  }
  return rows;
}

describe("REDCap adapter (prototype)", () => {
  const ok = () => run(buildRedcap, variant(["rank_topics"]));

  it("a draft is only exported as test, a prohibited right blocks it", () => {
    const c = variant(["rank_topics"]);
    expect(run(buildRedcap, c, "native").ok).toBe(false);
    expect(ok().ok, JSON.stringify(ok().diagnostics.filter((d: any) => d.severity === "error"))).toBe(true);
    c.rights[0].permissions.export = "prohibited";
    expect(run(buildRedcap, c).ok).toBe(false);
  });

  it("writes 18 quoted columns, record_id first, and the test label as annotation", () => {
    const rows = csv(ok().content);
    expect(rows[0]).toHaveLength(18);
    expect(rows[0]![0]).toBe("Variable / Field Name");
    for (const r of rows) expect(r).toHaveLength(18);
    expect(rows[1]![0]).toBe("record_id");
    expect(rows[1]![3]).toBe("text");
    expect(rows[1]![17]).toContain("TEST");
  });

  it("maps types, choices, branching, slider and matrix group", () => {
    const rows = csv(ok().content);
    const by = (v: string) => rows.find((r) => r[0] === v) as string[];
    expect(by("demo_01")[3]).toBe("radio");
    expect(by("demo_01")[5]).toMatch(/^1, .* \| 2, /);
    expect(by("demo_01")[15]).toBe("battery"); // matrix group
    expect(by("mood_slider")[3]).toBe("slider");
    expect(by("contact_email")[3]).toBe("text");
    expect(by("contact_email")[11]).toBe("([wants_help] = 'yes') and ([mood_slider] < '30')");
    expect(by("intro_note")[3]).toBe("descriptive");
    expect(rows.filter((r) => r[2] !== "" && r[0] !== "Variable / Field Name").length).toBeGreaterThan(0);
  });

  it("keeps rows of one form contiguous and uses a single form name", () => {
    const rows = csv(ok().content).slice(1);
    expect(new Set(rows.map((r) => r[1])).size).toBe(1);
  });

  it("a ranking is an error, a slider outside 0 to 100 is an error, nothing is rescaled", () => {
    const r = run(buildRedcap, variant([]));
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d: any) => d.code === "EXPORT_RESPONSE_UNSUPPORTED" && d.itemRef === "rank_topics")).toBe(true);
    const c = variant(["rank_topics"]);
    c.items.find((i: any) => i.id === "mood_slider").response.maximum = 10;
    const s = run(buildRedcap, c);
    expect(s.diagnostics.some((d: any) => d.code === "EXPORT_RESPONSE_UNSUPPORTED" && d.itemRef === "mood_slider")).toBe(true);
  });

  it("an uppercase variable name is an error instead of a silent change", () => {
    const c = variant(["rank_topics"]);
    c.items.find((i: any) => i.id === "demo_02").exportHints = { redcap: { variableName: "Demo_02" } };
    const r = run(buildRedcap, c);
    expect(r.ok).toBe(false);
    expect(r.diagnostics.find((d: any) => d.code === "EXPORT_VARIABLE_NAME_INVALID")?.remediation).toContain("exportHints.redcap.variableName");
  });

  it("a choice label with the separator is an error", () => {
    const c = variant(["rank_topics"]);
    c.optionSets.find((o: any) => o.id === "yes_no").options[0].label.en = "a | b";
    expect(run(buildRedcap, c).diagnostics.some((d: any) => d.code === "EXPORT_TEXT_RESERVED")).toBe(true);
  });

  it("markup in text stays escaped", () => {
    const c = variant(["rank_topics"]);
    c.items.find((i: any) => i.id === "demo_01").text.en = "<img src=x onerror=1> \"q\"";
    const r = run(buildRedcap, c);
    expect(r.ok).toBe(true);
    expect(r.content).not.toContain("<img");
    expect(r.content).toContain("&lt;img");
  });

  it("declares itself a prototype with the header as an unverified assumption", () => {
    const r = ok();
    expect(r.mapping.some((m: any) => m.feature === "prototype")).toBe(true);
    expect(r.assumptions[0]).toContain("PROTOTYPE");
  });
});

describe("Google Forms adapter (prototype)", () => {
  const build = (c = variant(["rank_topics", "mood_slider"], true)) => run(buildGoogleForms, c);

  it("produces a script that parses, creates a form and logs its URLs", () => {
    const r = build();
    expect(r.ok, JSON.stringify(r.diagnostics.filter((d: any) => d.severity === "error"))).toBe(true);
    expect(() => new Script(r.content as string)).not.toThrow();
    expect(r.content).toContain("function createQuestionnaire()");
    expect(r.content).toContain("FormApp.create(");
    expect(r.content).toContain("getEditUrl()");
    expect(r.content).toContain("[TEST");
  });

  it("maps choice, text and required to the Forms calls", () => {
    const s = build().content as string;
    expect(s).toContain("addMultipleChoiceItem()");
    expect(s).toContain("addTextItem()");
    expect(s).toMatch(/setRequired\(true\)/);
  });

  it("hostile text can never become code", () => {
    const c = variant(["rank_topics", "mood_slider"], true);
    c.items.find((i: any) => i.id === "demo_01").text.en = '"); DANGER(); (" \n</script>';
    const r = build(c);
    expect(r.ok).toBe(true);
    const content = r.content as string;
    expect(() => new Script(content)).not.toThrow();
    // the dangerous call exists only inside a string literal: run the script with a stub and see it is never called
    let called = false;
    const ctx: any = { DANGER: () => (called = true), Logger: { log() {} }, FormApp: new Proxy({}, { get: () => () => new Proxy(function () {}, { get: () => () => new Proxy(function () {}, { get: () => () => ({}) }) , apply: () => ({}) }) }) };
    try { new Script(content + "\ncreateQuestionnaire();").runInNewContext(ctx); } catch { /* stub may not model every call */ }
    expect(called).toBe(false);
  });

  it("conditions, rankings and unusable sliders are errors", () => {
    expect(run(buildGoogleForms, variant([])).diagnostics.some((d: any) => d.code === "EXPORT_CONDITION_UNSUPPORTED")).toBe(true);
    const r = run(buildGoogleForms, variant(["rank_topics"], true));
    expect(r.diagnostics.some((d: any) => d.code === "EXPORT_RESPONSE_UNSUPPORTED" && d.itemRef === "mood_slider")).toBe(true);
    expect(run(buildGoogleForms, variant(["mood_slider"], true)).diagnostics.some((d: any) => d.itemRef === "rank_topics" && d.code === "EXPORT_RESPONSE_UNSUPPORTED")).toBe(true);
  });

  it("a 1 to 5 scale works", () => {
    const c = variant(["rank_topics"], true);
    const sl = c.items.find((i: any) => i.id === "mood_slider");
    sl.response.minimum = 1;
    sl.response.maximum = 5;
    const r = run(buildGoogleForms, c);
    expect(r.ok).toBe(true);
    expect(r.content).toContain("addScaleItem()");
    expect(r.content).toContain("setBounds(1, 5)");
  });

  it("duplicate option labels are an error because Google stores labels", () => {
    const c = variant(["rank_topics", "mood_slider"], true);
    const os = c.optionSets.find((o: any) => o.id === "yes_no");
    os.options[1].label.en = os.options[0].label.en;
    expect(run(buildGoogleForms, c).ok).toBe(false);
  });

  it("states that answer codes are lost", () => {
    expect(build().mapping.some((m: any) => m.feature === "option.codes" && m.level === "unsupported")).toBe(true);
  });
});

describe("jsStr", () => {
  it("is a valid literal for any text", () => {
    for (const s of ['a"b', "a\nb", " ", "</script>", "\\", "'"]) expect(new Script(`(${jsStr(s)})`).runInNewContext({})).toBe(s);
  });
});

describe("Build plans for Unipark and SurveyMonkey (prototype)", () => {
  for (const p of ["unipark", "surveymonkey"] as const) {
    it(`${p}: lists every item with type, wording, codes and the condition as a sentence`, () => {
      const r = buildBauplan(p, variant([]), everything(variant([])), { language: "en", mode: "test" });
      expect(r.ok, JSON.stringify(r.diagnostics.filter((d) => d.severity === "error"))).toBe(true);
      const md = r.content as string;
      expect(md).toMatch(/^# Bauplan für /);
      expect(md).toContain("kein Import");
      expect(md).toContain("[TEST");
      expect(md).toContain("`mood_slider`");
      expect(md).toContain("`rank_topics`"); // nothing is dropped
      expect(md).toMatch(/Nur anzeigen, wenn:\*\* contact|wants\\_help|wants_help/);
      expect(md).toContain("| `1` |");
      expect(r.fileName).toMatch(new RegExp(`_${p}_TEST_bauplan\\.md$`));
      expect(r.mapping.some((m) => m.feature === "prototype")).toBe(true);
    });
  }

  it("SurveyMonkey adds paste text for choice questions only", () => {
    const c = variant([]);
    const md = buildBauplan("surveymonkey", c, everything(c), { language: "en", mode: "test" }).content as string;
    expect(md).toContain("## Zum Einfügen");
    expect(buildBauplan("unipark", c, everything(c), { language: "en", mode: "test" }).content).not.toContain("Zum Einfügen");
  });

  it("is blocked by rights like every export and never falls back to another language", () => {
    const c = variant([]);
    expect(buildBauplan("unipark", c, everything(c), { language: "en", mode: "native" }).ok).toBe(false);
    delete c.items.find((i: any) => i.id === "demo_01").text["de-CH"];
    const r = buildBauplan("unipark", c, everything(c), { language: "de-CH", mode: "test" });
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "EXPORT_TEXT_MISSING")).toBe(true);
  });

  it("escapes Markdown from catalog text", () => {
    const c = variant([]);
    c.items.find((i: any) => i.id === "demo_01").text.en = "# H <b>x</b> [l](http://e)";
    const md = buildBauplan("unipark", c, everything(c), { language: "en", mode: "test" }).content as string;
    expect(md).not.toContain("<b>");
    expect(md).not.toContain("[l](http");
  });
});

describe("neutral CSV table", () => {
  const c = variant([]);
  const r = buildNeutralCsv(c, everything(c), { language: "en", mode: "test" });

  it("has one row per selected item with 13 quoted columns and a byte order mark", () => {
    expect(r.ok).toBe(true);
    expect((r.content as string).charCodeAt(0)).toBe(0xfeff);
    const rows = csv((r.content as string).slice(1));
    expect(rows).toHaveLength(c.items.length + 1);
    for (const x of rows) expect(x).toHaveLength(13);
    expect(rows[0]![2]).toBe("id");
  });

  it("carries options, limits, required flag and conditions", () => {
    const rows = csv((r.content as string).slice(1));
    const by = (id: string) => rows.find((x) => x[2] === id) as string[];
    expect(by("demo_01")[9]).toContain("1 = ");
    expect(by("contact_email")[8]).toContain("wants_help");
    expect(by("mood_slider")[10]).toMatch(/min 0/);
  });

  it("guards spreadsheet formulas", () => {
    expect(guardCell("=1+1")).toBe("'=1+1");
    expect(guardCell("+x")).toBe("'+x");
    expect(guardCell("-x")).toBe("'-x");
    expect(guardCell("@SUM")).toBe("'@SUM");
    expect(guardCell("normal")).toBe("normal");
    const d = variant([]);
    d.items.find((i: any) => i.id === "demo_01").text.en = '=HYPERLINK("http://e")';
    const out = buildNeutralCsv(d, everything(d), { language: "en", mode: "test" }).content as string;
    expect(out).toContain("\"'=HYPERLINK(");
  });

  it("is blocked for a draft in regular mode", () => {
    expect(buildNeutralCsv(c, everything(c), { language: "en", mode: "native" }).ok).toBe(false);
  });
});
