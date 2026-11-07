import { describe, expect, it } from "vitest";
import { buildQualtrics, qText } from "../../src/output/qualtrics";
import type { Catalog } from "../../src/core/types";
import { clone, example040 } from "./helpers";

/** The rich example minus what the Qualtrics TXT format cannot carry (slider, display logic). */
function exportable(): any {
  const c = clone(example040());
  c.questionnaire.sections = c.questionnaire.sections.map((s: any) => ({ ...s, itemRefs: s.itemRefs.filter((x: string) => x !== "mood_slider") }));
  c.items = c.items.filter((i: any) => i.id !== "mood_slider");
  for (const i of c.items) delete i.visibleWhen;
  for (const m of c.modules) m.itemRefs = m.itemRefs.filter((x: string) => x !== "mood_slider");
  return c;
}
const everything = (c: Catalog): Set<string> => new Set(c.items.map((i) => i.id));
const run = (c: Catalog, mode: "native" | "test" = "test", language = "en", sel: Set<string> = everything(c)) => buildQualtrics(c, sel, { language, mode });
const lines = (r: { content?: string }): string[] => (r.content as string).split("\n");

describe("Qualtrics adapter: gates", () => {
  it("native export of a draft is blocked, the test export works and is labelled", () => {
    const c = exportable();
    expect(run(c, "native").ok).toBe(false);
    const r = run(c, "test");
    expect(r.ok, JSON.stringify(r.diagnostics.filter((d) => d.severity === "error"))).toBe(true);
    expect(r.fileName).toMatch(/_qualtrics_TEST\.txt$/);
    expect(r.content).toContain("[TEST");
  });

  it("a released catalog exports regularly", () => {
    const c = exportable();
    c.catalog.status = "released";
    const r = run(c, "native");
    expect(r.ok).toBe(true);
    expect(r.content).not.toContain("[TEST");
    expect(r.fileName).toMatch(/_qualtrics\.txt$/);
  });

  it("a prohibited right blocks the export", () => {
    const c = exportable();
    c.rights[0].permissions.export = "prohibited";
    expect(run(c).ok).toBe(false);
  });
});

describe("Qualtrics adapter: structure", () => {
  const r = run(exportable());
  const l = lines(r);

  it("starts with the format tag and has no byte order mark", () => {
    expect(l[0]).toBe("[[AdvancedFormat]]");
    expect((r.content as string).charCodeAt(0)).not.toBe(0xfeff);
  });

  it("declares hidden fields as embedded data", () => {
    expect(l.filter((x) => x.startsWith("[[ED:")).length).toBeGreaterThan(0);
  });

  it("every question has a type tag, an ID tag and text on the next lines", () => {
    l.forEach((x, i) => {
      if (x.startsWith("[[Question:")) {
        expect(l[i + 1]).toMatch(/^\[\[ID:[A-Za-z][A-Za-z0-9_]*\]\]$/);
        expect(l[i + 2]).not.toMatch(/^\[\[/);
        expect(l[i + 2]).not.toBe("");
      }
    });
  });

  it("writes single choice with integer recodes in catalog order", () => {
    const i = l.indexOf("[[ID:demo_02]]");
    expect(l[i - 1]).toBe("[[Question:MC:SingleAnswer]]");
    expect(l[i + 2]).toBe("[[AdvancedChoices]]");
    const tags: string[] = [];
    for (let k = i + 3; k < l.length && l[k]!.startsWith("[[Choice:"); k += 2) tags.push(l[k] as string);
    expect(tags.length).toBeGreaterThan(1);
    for (const x of tags) expect(x).toMatch(/^\[\[Choice:\d+\]\]$/);
  });

  it("writes ranking, text entry and text blocks", () => {
    const type = (id: string) => l[l.indexOf(`[[ID:${id}]]`) - 1];
    expect(type("rank_topics")).toBe("[[Question:RO]]");
    expect(type("contact_email")).toBe("[[Question:TE:SingleLine]]");
    expect(type("intro_note")).toBe("[[Question:DB]]");
  });

  it("makes one block per section", () => {
    expect(l.filter((x) => x.startsWith("[[Block:")).length).toBeGreaterThanOrEqual(3);
  });

  it("reports manual work and the single language", () => {
    expect(r.mapping.some((m) => m.feature === "answerRequired" && m.level === "manual")).toBe(true);
    expect(r.mapping.some((m) => m.feature === "languages" && m.level === "unsupported")).toBe(true);
    expect(r.assumptions.length).toBeGreaterThan(3);
  });
});

describe("Qualtrics adapter: no silent change", () => {
  it("a condition is an error because the format cannot carry display logic", () => {
    const c = exportable();
    c.items.find((i: any) => i.id === "contact_email").visibleWhen = { itemRef: "wants_help", operator: "equals", value: "yes" };
    const r = run(c);
    expect(r.ok).toBe(false);
    const d = r.diagnostics.find((x) => x.code === "EXPORT_CONDITION_UNSUPPORTED");
    expect(d?.itemRef).toBe("contact_email");
    expect(r.content).toBeUndefined();
  });

  it("a slider is an error, never replaced by another type", () => {
    const r = run(clone(example040()));
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "EXPORT_RESPONSE_UNSUPPORTED" && d.itemRef === "mood_slider")).toBe(true);
  });

  it("an answer code that is not an integer needs a hint", () => {
    const c = exportable();
    delete c.optionSets.find((o: any) => o.id === "yes_no").options[0].exportHints.qualtrics;
    const r = run(c);
    expect(r.ok).toBe(false);
    const d = r.diagnostics.find((x) => x.code === "EXPORT_OPTION_CODE_INVALID");
    expect(d?.remediation).toContain("exportHints.qualtrics.code");
  });

  it("two recodes that collide are an error", () => {
    const c = exportable();
    c.optionSets.find((o: any) => o.id === "yes_no").options[1].exportHints.qualtrics.code = "1";
    expect(run(c).diagnostics.some((d) => d.code === "EXPORT_OPTION_CODE_DUPLICATE")).toBe(true);
  });

  it("text missing in the export language is an error", () => {
    const c = exportable();
    delete c.items.find((i: any) => i.id === "demo_01").text["de-CH"];
    const r = run(c, "test", "de-CH");
    expect(r.ok).toBe(false);
    expect(r.diagnostics.some((d) => d.code === "EXPORT_TEXT_MISSING" && d.itemRef === "demo_01")).toBe(true);
  });

  it("text that looks like a tag is an error", () => {
    const c = exportable();
    c.items.find((i: any) => i.id === "demo_01").text.en = "Hello [[Block]] world";
    expect(run(c).diagnostics.some((d) => d.code === "EXPORT_TEXT_RESERVED")).toBe(true);
  });

  it("hostile markup stays inert text", () => {
    const c = exportable();
    c.items.find((i: any) => i.id === "demo_01").text.en = '<script>alert(1)</script>\nline "two"';
    const r = run(c);
    expect(r.ok).toBe(true);
    expect(r.content).not.toContain("<script>");
    expect(r.content).toContain("&lt;script&gt;");
    expect(r.content).toContain("<br>");
  });
});

describe("qText", () => {
  it("escapes markup and keeps one line", () => {
    expect(qText('a <b> & "c"\nd')).toBe("a &lt;b&gt; &amp; &quot;c&quot;<br>d");
  });
});
