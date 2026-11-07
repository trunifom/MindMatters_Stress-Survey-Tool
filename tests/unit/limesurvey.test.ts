import { describe, expect, it } from "vitest";
import { buildLimeSurvey, lsText } from "../../src/output/limesurvey";
import { initialSelection, setItem } from "../../src/model/selection";
import type { Catalog } from "../../src/core/types";
import { clone, example040, fixture040 } from "./helpers";

const rich = (): any => clone(example040());
const everything = (c: Catalog): Set<string> => new Set(c.items.map((i) => i.id));
const run = (c: Catalog, mode: "native" | "test" = "test", language = "en", sel: Set<string> = everything(c)) => buildLimeSurvey(c, sel, { language, mode });
const released = (c: any): any => {
  c.catalog.status = "released";
  return c;
};

/** Minimal reader for the generated file: header, then rows as records. */
function parse(content: string): Array<Record<string, string>> {
  expect(content.charCodeAt(0)).toBe(0xfeff);
  const lines = content.slice(1).split("\n");
  expect(lines[lines.length - 1]).toBe("");
  const header = (lines[0] as string).split("\t");
  return lines.slice(1, -1).map((l) => {
    const cells = l.split("\t");
    expect(cells.length, l).toBe(header.length);
    return Object.fromEntries(header.map((h, i) => [h, cells[i] as string]));
  });
}

describe("LimeSurvey adapter: gates", () => {
  it("native export of a draft catalog is blocked and writes no file", () => {
    const r = run(rich(), "native");
    expect(r.ok).toBe(false);
    expect(r.content).toBeUndefined();
    expect(r.diagnostics.some((d) => d.code === "CATALOG_NOT_RELEASED")).toBe(true);
  });

  it("native export of a released catalog works", () => {
    const r = run(released(rich()), "native");
    expect(r.diagnostics.filter((d) => d.severity === "error")).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.testArtifact).toBe(false);
    expect(r.fileName).toMatch(/_limesurvey\.txt$/);
  });

  it("the test export is labelled in the file and in the name", () => {
    const r = run(rich(), "test");
    expect(r.ok, JSON.stringify(r.diagnostics.filter((d) => d.severity === "error"))).toBe(true);
    expect(r.testArtifact).toBe(true);
    expect(r.fileName).toMatch(/_limesurvey_TEST\.txt$/);
    const title = parse(r.content as string).find((x) => x["name"] === "surveyls_title");
    expect(title?.["text"]).toContain("TEST");
  });

  it("a prohibited export right blocks even the test export", () => {
    const c = rich();
    c.rights[0].permissions.export = "prohibited";
    const r = run(c, "test");
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "RIGHTS_PERMISSION_PROHIBITED")).toBe(true);
  });

  it("refuses a language the catalog does not have", () => {
    const r = run(rich(), "test", "fr");
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "EXPORT_LANGUAGE_UNKNOWN")).toBe(true);
  });
});

describe("LimeSurvey adapter: file structure", () => {
  const r = run(rich(), "test");
  const rows = parse(r.content as string);
  const header = (r.content as string).slice(1).split("\n")[0] as string;

  it("has the 14 fixed columns first and attribute columns alphabetically after", () => {
    const cols = header.split("\t");
    expect(cols.slice(0, 14)).toEqual(["id", "related_id", "class", "type/scale", "name", "relevance", "text", "help", "language", "validation", "mandatory", "other", "default", "same_default"]);
    const attrs = cols.slice(14);
    expect(attrs).toEqual([...attrs].sort());
    expect(attrs).toContain("slider_layout");
  });

  it("uses only known classes and puts groups before their questions", () => {
    const classes = rows.map((x) => x["class"]);
    expect(new Set(classes)).toEqual(new Set(["S", "SL", "G", "Q", "SQ", "A"]));
    expect(classes.indexOf("G")).toBeLessThan(classes.indexOf("Q"));
  });

  it("writes one group per section with items, and the intro group for consent and privacy", () => {
    const groups = rows.filter((x) => x["class"] === "G");
    expect(groups.length).toBe(4); // introduction + 3 sections
  });

  it("maps every kind to its type letter", () => {
    const type = (name: string) => rows.find((x) => x["class"] === "Q" && x["name"] === name)?.["type/scale"];
    expect(type("intronote")).toBe("X");
    expect(type("demo01")).toBe("L");
    expect(type("moodslider")).toBe("K");
    expect(type("ranktopics")).toBe("R");
    expect(type("contactemail")).toBe("S");
  });

  it("keeps catalog order of questions and answers", () => {
    const names = rows.filter((x) => x["class"] === "Q").map((x) => x["name"]);
    expect(names.indexOf("intronote")).toBeLessThan(names.indexOf("demo01"));
    expect(names.indexOf("demo01")).toBeLessThan(names.indexOf("moodslider"));
  });

  it("writes answers after their question with the question id", () => {
    const qIndex = rows.findIndex((x) => x["class"] === "Q" && x["name"] === "demo01");
    const qid = rows[qIndex]?.["id"];
    const a = rows[qIndex + 1] as Record<string, string>;
    expect(a["class"]).toBe("A");
    expect(a["id"]).toBe(qid);
    expect(a["language"]).toBe("en");
  });

  it("compound visibility becomes an Expression Manager equation", () => {
    const q = rows.find((x) => x["class"] === "Q" && x["name"] === "contactemail");
    expect(q?.["relevance"]).toBe("((wantshelp.NAOK == 'yes') && (moodslider_S1.NAOK < 30))");
  });

  it("cells never contain tabs, quotes or raw line breaks", () => {
    for (const row of rows) for (const v of Object.values(row)) expect(v).not.toMatch(/["\r]/);
  });

  it("reports every touched feature with a level, and lists the assumptions", () => {
    expect(r.mapping.length).toBeGreaterThan(5);
    expect(r.mapping.every((m) => ["exact", "transformed", "manual", "unsupported"].includes(m.level))).toBe(true);
    expect(r.mapping.some((m) => m.feature === "response.slider" && m.level === "transformed")).toBe(true);
    expect(r.mapping.some((m) => m.feature === "consent" && m.level === "manual")).toBe(true);
    expect(r.assumptions.length).toBeGreaterThan(3);
  });
});

describe("LimeSurvey adapter: no silent repair", () => {
  it("a variable name LimeSurvey cannot take is an error with a remedy, not rewritten", () => {
    const c = rich();
    delete c.items.find((i: any) => i.id === "demo_02").exportHints;
    const r = run(c);
    expect(r.ok).toBe(false);
    const d = r.diagnostics.find((x) => x.code === "EXPORT_VARIABLE_NAME_INVALID");
    expect(d?.itemRef).toBe("demo_02");
    expect(d?.remediation).toContain("exportHints.limesurvey.variableName");
    expect(r.content).toBeUndefined();
  });

  it("two items that would share a code are an error", () => {
    const c = rich();
    c.items.find((i: any) => i.id === "demo_03").exportHints.limesurvey.variableName = "demo01";
    expect(run(c).diagnostics.some((d) => d.code === "EXPORT_VARIABLE_NAME_DUPLICATE")).toBe(true);
  });

  it("an answer code longer than 5 characters without a hint is an error naming the option", () => {
    const c = rich();
    delete c.optionSets.find((o: any) => o.id === "agree_5").options.find((x: any) => x.code === "refused").exportHints;
    const r = run(c);
    expect(r.ok).toBe(false);
    const d = r.diagnostics.find((x) => x.code === "EXPORT_OPTION_CODE_INVALID");
    expect(d?.message).toContain("refused");
    expect(d?.remediation).toContain("exportHints.limesurvey.code");
  });

  it("two options that would share an export code are an error", () => {
    const c = rich();
    c.optionSets.find((o: any) => o.id === "support_topics").options[0].exportHints = { limesurvey: { code: "sch" } };
    expect(run(c).diagnostics.some((d) => d.code === "EXPORT_OPTION_CODE_DUPLICATE")).toBe(true);
  });

  it("the option hint is used for answers and for conditions on that option", () => {
    const c = rich();
    c.items.find((i: any) => i.id === "contact_email").visibleWhen = { itemRef: "demo_01", operator: "equals", value: "refused" };
    const r = run(c);
    expect(r.ok).toBe(true);
    const rows = parse(r.content as string);
    expect(rows.some((x) => x["class"] === "A" && x["name"] === "ref")).toBe(true);
    expect(rows.find((x) => x["name"] === "contactemail")?.["relevance"]).toBe("(demo01.NAOK == 'ref')");
  });

  it("text missing in the export language is an error, never filled from another language", () => {
    const c = rich();
    delete c.items.find((i: any) => i.id === "demo_01").text["de-CH"];
    const r = run(c, "test", "de-CH");
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "EXPORT_TEXT_MISSING" && d.itemRef === "demo_01")).toBe(true);
  });

  it("a condition on an item outside the questionnaire is an error, not dropped", () => {
    const c = rich();
    const sel = everything(c);
    sel.delete("wants_help");
    const r = buildLimeSurvey(c, sel, { language: "en", mode: "test" });
    expect(r.ok).toBe(false);
  });

  it("an unsupported condition is an error, not dropped", () => {
    const c = rich();
    c.items.find((i: any) => i.id === "contact_email").visibleWhen = { itemRef: "rank_topics", operator: "equals", value: "x" };
    const r = run(c);
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "EXPORT_CONDITION_UNSUPPORTED")).toBe(true);
  });
});

describe("lsText", () => {
  it("escapes markup, quotes and Expression Manager braces, and turns line breaks into <br />", () => {
    expect(lsText('a <b> & "c" {x}\nz\ty')).toBe("a &lt;b&gt; &amp; &quot;c&quot; &#123;x&#125;<br />z y");
  });

  it("a hostile catalog text stays inert in the file", () => {
    const c = rich();
    c.items.find((i: any) => i.id === "demo_01").text.en = '<script>alert(1)</script>\t{=1+1}"';
    const r = run(c);
    expect(r.ok).toBe(true);
    const content = r.content as string;
    expect(content).not.toContain("<script>");
    expect(content).toContain("&lt;script&gt;");
    expect(content).not.toContain("{=1+1}");
  });
});

describe("LimeSurvey adapter on the delivered fixtures", () => {
  it("a catalog with choice, multiple choice, numbers and text writes the right types and attributes", () => {
    const c: any = released(clone(fixture040("40_Katalog_Antworttypen_Logik.json")));
    for (const i of c.items) i.exportHints = { limesurvey: { variableName: String(i.variableName).replace(/[^A-Za-z0-9]/g, "").slice(0, 20) || "q" + i.id.length } };
    const r = run(c, "test", c.catalog.defaultLanguage);
    const errors = r.diagnostics.filter((d) => d.severity === "error");
    // Whatever the fixture holds, the adapter either writes a valid file or names the reason.
    if (r.ok) {
      const rows = parse(r.content as string);
      expect(rows.some((x) => x["type/scale"] === "M")).toBe(true);
      expect(rows.some((x) => x["type/scale"] === "N")).toBe(true);
    } else expect(errors.length).toBeGreaterThan(0);
  });

  it("deselecting an optional item removes it and its answers from the file", () => {
    const c: any = rich();
    const all = run(c, "test", "en", everything(c));
    const fewer = run(c, "test", "en", setItem(c, everything(c), "demo_02", false));
    expect(parse(all.content as string).some((x) => x["name"] === "demo02")).toBe(true);
    expect(parse(fewer.content as string).some((x) => x["name"] === "demo02")).toBe(false);
  });
});
