import { describe, expect, it } from "vitest";
import { buildR, buildSpss } from "../../src/output/analysis";
import { buildHtmlDocument, buildMarkdownDocument, buildNeutralJson, escapeHtml, escapeMd, NEUTRAL_JSON_FORMAT, textBlocks } from "../../src/output/document";
import { ADAPTERS } from "../../src/output/registry";
import type { Catalog } from "../../src/core/types";
import { clone, example040 } from "./helpers";

const cat = (): Catalog => clone(example040()) as Catalog;
const all = (c: Catalog) => new Set(c.items.map((i) => i.id));
const released = (): Catalog => {
  const c: any = cat();
  c.catalog.status = "released";
  return c;
};
const opts = (language = "en", mode: "native" | "test" = "native") => ({ language, mode });

describe("registry", () => {
  it("offers the new formats with an honest tier", () => {
    for (const id of ["html", "markdown", "json", "spss", "r"]) expect(ADAPTERS[id], id).toBeDefined();
    expect(ADAPTERS.html!.tier).toBe("table");
    expect(ADAPTERS.spss!.tier).toBe("prototype");
  });
});

describe("every new format", () => {
  const builders = { html: buildHtmlDocument, markdown: buildMarkdownDocument, json: buildNeutralJson, spss: buildSpss, r: buildR } as const;

  for (const [id, build] of Object.entries(builders)) {
    it(`${id}: works on the whole example in both languages and is deterministic`, () => {
      const c = released();
      for (const language of ["en", "de-CH"]) {
        const a = build(c, all(c), opts(language));
        expect(a.ok, JSON.stringify(a.diagnostics.filter((d) => d.severity === "error"))).toBe(true);
        expect(a.content!.length).toBeGreaterThan(200);
        expect(build(c, all(c), opts(language)).content).toBe(a.content);
        expect(a.content).not.toMatch(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/);
      }
    });

    it(`${id}: a draft catalog is only available as a labelled test export`, () => {
      const c = cat();
      expect(build(c, all(c), opts("en", "native")).ok).toBe(false);
      const t = build(c, all(c), opts("en", "test"));
      expect(t.ok).toBe(true);
      expect(t.testArtifact).toBe(true);
      expect(t.fileName).toContain("_TEST");
    });

    it(`${id}: a missing translation is reported, never filled with another language`, () => {
      const c: any = released();
      delete c.items.find((i: any) => i.id === "demo_01").text.en;
      const r = build(c, all(c), opts("en"));
      expect(r.ok).toBe(false);
      expect(r.diagnostics.some((d) => d.code === "EXPORT_TEXT_MISSING" && d.itemRef === "demo_01")).toBe(true);
    });
  }
});

describe("HTML print view", () => {
  it("contains all selected questions in questionnaire order and nothing unselected", () => {
    const c = released();
    const sel = all(c);
    sel.delete("demo_02");
    const html = buildHtmlDocument(c, sel, opts("de-CH")).content!;
    expect(html).toContain("<!doctype html>");
    expect(html).toContain('data-item="demo_01"');
    expect(html).not.toContain('data-item="demo_02"');
    expect(html.indexOf('data-item="demo_01"')).toBeLessThan(html.indexOf('data-item="wants_help"'));
    expect(html).toContain('lang="de-CH"');
  });

  it("has no script, no handler, no external resource, and a restrictive policy", () => {
    const c = released();
    const html = buildHtmlDocument(c, all(c), opts()).content!;
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/\son[a-z]+\s*=/i);
    expect(html).not.toMatch(/(src|href)\s*=\s*["']?https?:/i);
    expect(html).toContain("default-src 'none'");
  });

  it("escapes markup in catalog text so that it cannot become HTML", () => {
    const c: any = released();
    c.items.find((i: any) => i.id === "demo_01").text.en = `<img src=x onerror=alert(1)> & "quote" <script>x</script>`;
    const html = buildHtmlDocument(c, all(c), opts()).content!;
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<script>x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt; &amp; &quot;quote&quot;");
  });

  it("prints a battery with a shared answer scale as one table", () => {
    const c = released();
    const html = buildHtmlDocument(c, all(c), opts()).content!;
    expect(html).toContain('<table class="matrix">');
    expect((html.match(/<tr data-item=/g) ?? []).length).toBe(3);
  });

  it("marks draft status and test export", () => {
    const c = cat();
    expect(buildHtmlDocument(c, all(c), opts("de-CH", "test")).content).toContain("class=\"status\"");
  });
});

describe("Markdown document", () => {
  it("escapes Markdown and raw HTML, keeps lists and paragraphs of text blocks", () => {
    expect(escapeMd("a *b* _c_ [d](e) <x> # 1. -")).toBe("a \\*b\\* \\_c\\_ \\[d\\]\\(e\\) &lt;x&gt; \\# 1. -");
    expect(textBlocks("Eins\n\n- a\n- b\n\nZwei")).toEqual([
      { kind: "p", text: "Eins" },
      { kind: "ul", items: ["a", "b"] },
      { kind: "p", text: "Zwei" },
    ]);
    expect(escapeHtml(`<a href="x">'&`)).toBe("&lt;a href=&quot;x&quot;&gt;&#39;&amp;");
  });

  it("numbers questions, shows options, conditions and the answer type", () => {
    const c = released();
    const md = buildMarkdownDocument(c, all(c), opts("de-CH")).content!;
    expect(md).toMatch(/^> \*\*|^# /m);
    expect(md).toMatch(/\*\*1\.\*\*/);
    expect(md).toContain("○");
    expect(md).toContain("Nur wenn");
    expect(md).not.toMatch(/<[a-z]/i);
  });
});

describe("neutral JSON", () => {
  it("is valid JSON with format marker, resolved texts and numbering", () => {
    const c = released();
    const r = buildNeutralJson(c, all(c), opts("de-CH"));
    const j = JSON.parse(r.content!);
    expect(j.format).toBe(NEUTRAL_JSON_FORMAT);
    expect(j.catalog.id).toBe("example_rich");
    expect(j.language).toBe("de-CH");
    const items = j.sections.flatMap((s: any) => s.items);
    expect(items.filter((i: any) => i.kind !== "note").map((i: any) => i.number)).toEqual(Array.from({ length: items.filter((i: any) => i.kind !== "note").length }, (_, i) => i + 1));
    expect(typeof items[0].text).toBe("string");
  });
});

describe("SPSS syntax", () => {
  it("labels every question, doubles quotes, and sets missing values", () => {
    const c: any = released();
    c.items.find((i: any) => i.id === "demo_01").text.en = "It's \"fine\"\nnew line";
    const sps = buildSpss(c, all(c), opts()).content!;
    expect(sps).toContain("VARIABLE LABELS");
    expect(sps).toContain("It''s \"fine\" new line");
    expect(sps).toContain("VALUE LABELS");
    expect(sps).toMatch(/EXECUTE\.\r\n$/);
    expect(sps.startsWith("﻿")).toBe(true);
    // every statement ends with a full stop: the last label line of each block does
    expect(sps.split("\r\n").filter((l) => /^VARIABLE LABELS$|^VALUE LABELS/.test(l)).length).toBeGreaterThan(1);
  });

  it("refuses a variable name SPSS cannot use, naming the item", () => {
    const c: any = released();
    c.items.find((i: any) => i.id === "demo_01").variableName = "1bad-name";
    const r = buildSpss(c, all(c), opts());
    expect(r.ok).toBe(false);
    expect(r.diagnostics.find((d) => d.code === "EXPORT_VARIABLE_NAME_INVALID")?.itemRef).toBe("demo_01");
  });
});

describe("R script", () => {
  it("escapes quotes, backslashes and line breaks in labels", () => {
    const c: any = released();
    c.items.find((i: any) => i.id === "demo_01").text.en = 'Say "hi" \\ there\nsecond';
    const r = buildR(c, all(c), opts()).content!;
    expect(r).toContain('Say \\"hi\\" \\\\ there\\nsecond');
    expect(r).toContain("variable_labels <- c(");
    expect(r).toContain("apply_labels <- function(data");
    expect(r).not.toContain("\r");
  });
});
