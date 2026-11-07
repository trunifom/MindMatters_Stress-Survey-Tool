import { describe, expect, it } from "vitest";
import { buildCodebook, md } from "../../src/output/codebook";
import { buildCheckReport, isReportStale, reportFileName, serializeReport, stateFingerprint } from "../../src/output/report";
import { resolveText, exactText } from "../../src/core/localized";
import { initialSelection, setItem, setModule } from "../../src/model/selection";
import { loadCatalog } from "../../src/core/loader";
import type { Catalog } from "../../src/core/types";
import { clone, example040, fixture040 } from "./helpers";

const NOW = new Date("2026-11-07T12:00:00Z");
const cat = (n: string): any => clone(fixture040(n));
const cat10 = () => cat("10_Katalog_Klein_Gemischt.json");
const cat40 = () => cat("40_Katalog_Antworttypen_Logik.json");
const cat30 = () => cat("30_Katalog_Zweisprachig.json");
const rich = (): any => clone(example040());
const book = (c: Catalog, lang = "en", extra = {}) => buildCodebook(c, initialSelection(c), { language: lang, now: NOW, ...extra });

describe("resolveText", () => {
  it("returns the requested language without fallback", () => {
    expect(resolveText({ en: "a", de: "b" }, "de", "en")).toEqual({ text: "b", language: "de", fallback: false });
  });
  it("falls back to the default language and says so", () => {
    expect(resolveText({ en: "a" }, "de", "en")).toEqual({ text: "a", language: "en", fallback: true });
  });
  it("falls back to any language as a last resort, and to nothing for empty input", () => {
    expect(resolveText({ fr: "x" }, "de", "en")).toEqual({ text: "x", language: "fr", fallback: true });
    expect(resolveText(undefined, "de", "en")).toBeUndefined();
    expect(resolveText({}, "de", "en")).toBeUndefined();
  });
  it("exactText never falls back", () => {
    expect(exactText({ en: "a" }, "de")).toBeUndefined();
  });
});

describe("codebook: content (C08)", () => {
  it("describes catalog 40 with all answer types, codes and constraints", () => {
    const { markdown: m } = book(cat40());
    expect(m).toMatch(/^# Codebook: /);
    expect(m).toContain("not an import file");
    expect(m).toContain("`school_test_formats`");
    for (const kind of ["singleChoice", "multipleChoice", "integer", "decimal", "shortText", "longText", "date"]) {
      expect(m, kind).toContain("`" + kind + "`");
    }
    expect(m).toContain("| `01` |"); // leading zero preserved
    expect(m).toContain("`dk`");
    expect(m).toMatch(/missing \(dontKnow\)/);
    expect(m).toMatch(/min 10 years/);
    expect(m).toMatch(/max 20 years/);
    expect(m).toMatch(/max decimals 1/);
    expect(m).toMatch(/min selections 1, max selections 2, exclusive `none`/);
    expect(m).toMatch(/max length 250/);
    expect(m).toMatch(/Shown when: `areas_test` contains `other`/);
    expect(m).toMatch(/ordinal/); // measurement level of the 5-point scale
  });

  it("lists items in questionnaire order, not in catalog order", () => {
    const c = cat10();
    const { markdown: m } = buildCodebook(c, new Set(["self_efficacy_08", "extraversion_01", "conscientiousness_01"]), { language: "en", now: NOW });
    const a = m.indexOf("extraversion_01");
    const b = m.indexOf("conscientiousness_01");
    const d = m.indexOf("self_efficacy_08");
    expect(a).toBeGreaterThan(0);
    expect(a).toBeLessThan(b);
    expect(b).toBeLessThan(d);
  });

  it("omits sections without selected items, with their instruction", () => {
    const c = cat40();
    c.questionnaire.sections[1].instruction = { en: "UNIQUE-OWN-SECTION-INSTRUCTION" };
    const only = new Set(["extraversion_01"]);
    expect(buildCodebook(c, only, { language: "en", now: NOW }).markdown).not.toContain("UNIQUE-OWN-SECTION-INSTRUCTION");
    expect(buildCodebook(c, initialSelection(c), { language: "en", now: NOW }).markdown).toContain("UNIQUE-OWN-SECTION-INSTRUCTION");
  });

  it("marks administrative information", () => {
    const { markdown: m } = book(cat10());
    expect(m).toMatch(/Administrative information, not for participants/);
    expect(m).toContain("Original English IPIP wording");
  });

  it("documents scoring without computing it and flags an incomplete selection", () => {
    const c = cat("20_Katalog_Vollstaendige_Skalen.json");
    const full = book(c).markdown;
    expect(full).toMatch(/Documented scoring/);
    expect(full).toMatch(/computes no scores/);
    expect(full).not.toMatch(/incomplete selection/);
    const partial = buildCodebook(c, setModule(c, initialSelection(c), "module_self_efficacy", false), { language: "en", now: NOW }).markdown;
    expect(partial).toMatch(/score_self_efficacy.*incomplete selection/);
  });

  it("is deterministic for the same input", () => {
    const c = cat40();
    expect(book(c).markdown).toBe(book(c).markdown);
  });

  it("uses German labels for German languages", () => {
    const c = cat30();
    const m = buildCodebook(c, initialSelection(c), { language: "de-CH", now: NOW }).markdown;
    expect(m).toMatch(/^# Codebuch: /);
    expect(m).toContain("Entwurf – nicht für produktive Durchführung freigegeben");
    expect(m).toContain("Ich bin der Mittelpunkt auf Partys.");
  });
});

describe("codebook: text blocks and questionnaire texts", () => {
  it("renders title, notice and text blocks with their style", () => {
    const { markdown: m } = book(rich());
    expect(m).toContain("How do you feel at school?");
    expect(m).toMatch(/Text block \(`title`\)/);
    expect(m).toMatch(/Text block \(`notice`\)/);
    expect(m).toContain("voluntary and all answers are anonymous");
  });
  it("includes introduction, consent, privacy, help resources and hidden fields", () => {
    const { markdown: m } = book(rich());
    for (const t of ["Software test only.", "Taking part is voluntary", "Parents or guardians were informed", "No names are stored", "school counselling service", "school_code", "Thank you."]) {
      expect(m, t).toContain(t);
    }
  });
});

describe("codebook: rights, status and leakage (T36, T37, T45)", () => {
  const SECRET = "Am the life of the party";
  it("includes wording when the rights cover the codebook", () => {
    expect(book(cat10()).markdown).toContain(SECRET);
  });
  it("withholds the wording of blocked items completely, keeps their ID", () => {
    const c = cat10();
    c.rights.find((r: any) => r.id === "rights_ipip").permissions.redistribution = "unknown";
    const r = book(c);
    expect(r.markdown).not.toContain(SECRET);
    expect(r.markdown).not.toContain("Feel comfortable around people");
    expect(r.markdown).toContain("extraversion_01");
    expect(r.markdown).toContain("Wording withheld");
    expect(r.withheldItemIds.sort()).toEqual(["extraversion_01", "extraversion_02"]);
    expect(r.diagnostics.some((d) => d.code === "RIGHTS_PERMISSION_UNKNOWN")).toBe(true);
  });
  it("withholds only items whose own profile is blocked; own items stay visible", () => {
    const c = cat40();
    c.rights.find((r: any) => r.id === "rights_ipip").permissions.export = "prohibited";
    const m = book(c).markdown;
    expect(m).not.toContain("Am the life of the party");
    expect(m).toContain("Age in completed years");
  });
  it("draft catalogs carry the draft notice, released ones do not", () => {
    const c = cat10();
    expect(book(c).markdown).toContain("Draft – not released for productive use");
    c.catalog.status = "released";
    expect(book(c).markdown).not.toContain("Draft – not released");
  });
  it("withdrawn catalogs carry a clear withdrawal notice", () => {
    const c = cat10();
    c.catalog.status = "withdrawn";
    expect(book(c).markdown).toMatch(/WITHDRAWN: The publisher has withdrawn this catalog/);
  });
  it("lists required attributions", () => {
    const c = cat10();
    c.rights.find((r: any) => r.id === "rights_ipip").attribution = { en: "IPIP public domain statement" };
    expect(book(c).markdown).toMatch(/Required attributions[\s\S]*IPIP public domain statement/);
  });
});

describe("codebook: safety of catalog text", () => {
  it("escapes markdown and neutralizes HTML", () => {
    const c = rich();
    c.items.find((i: any) => i.id === "demo_01").text.en = "<script>alert(1)</script> | **bold** [x](javascript:alert(1)) `code`";
    const m = book(c).markdown;
    expect(m).not.toContain("<script>");
    expect(m).toContain("\\<script\\>");
    expect(m).not.toMatch(/(^|[^\\])\*\*bold/);
    expect(m).not.toContain("[x](");
  });
  it("md() escapes the control characters and flattens line breaks", () => {
    expect(md("a|b")).toBe("a\\|b");
    expect(md("a\nb")).toBe("a b");
    expect(md("<img src=x onerror=1>")).toBe("\\<img src=x onerror=1\\>");
  });
  it("multi-line wording stays in one blockquote", () => {
    const m = book(rich()).markdown;
    const lines = m.split("\n");
    const first = lines.findIndex((l) => l.includes("voluntary and all answers are anonymous"));
    expect(first).toBeGreaterThan(0);
    // the paragraph and the list that follows stay inside the same blockquote
    expect(lines.slice(first, first + 5).every((l) => l.startsWith("> "))).toBe(true);
    expect(lines.slice(first, first + 5).join("\n")).toContain("Nobody will see your name");
  });
  it("school notes appear only on explicit choice", () => {
    const c = cat10();
    const notes = { schoolLabel: "Schule Geheim", internalNotes: "vertrauliche Notiz" };
    expect(book(c).markdown).not.toMatch(/Geheim|vertrauliche/);
    const m = book(c, "en", { schoolNotes: notes }).markdown;
    expect(m).toContain("Schule Geheim");
    expect(m).toContain("vertrauliche Notiz");
  });
});

describe("codebook: language (T26)", () => {
  it("marks participant text that is missing in the language instead of silently mixing", () => {
    const c = cat30();
    delete c.items.find((i: any) => i.id === "extraversion_01").text["de-CH"];
    const m = buildCodebook(c, initialSelection(c), { language: "de-CH", now: NOW }).markdown;
    expect(m).toMatch(/In dieser Sprache nicht vorhanden/);
    expect(m).toContain("Am the life of the party");
  });
});

describe("check report", () => {
  const load = (c: unknown) => loadCatalog(JSON.stringify(c));
  const report = (c: Catalog, sel: Set<string>, extra = {}) =>
    buildCheckReport({ catalog: c, loadDiagnostics: load(c).diagnostics, selection: sel, language: "en", now: NOW, ...extra });

  it("reports a valid state", () => {
    const c: Catalog = rich();
    const r = report(c, initialSelection(c));
    expect(r.reportType).toBe("questionnaireCheckReport");
    expect(r.validity).toBe("valid");
    expect(r.notice).toBeUndefined();
    expect(r.status).toEqual({ technical: "pass", selection: expect.stringMatching(/pass|warning/), rights: "pass", export: "notRun" });
    expect(r.selection.count).toBe(initialSelection(c).size);
    expect(r.rights.map((x) => x.action)).toEqual(["displayItems", "codebookWithTexts", "nativeExport", "devTestExport"]);
    expect(r.rights.find((x) => x.action === "nativeExport")!.allowed).toBe(false); // draft
  });

  it("contains no wording of items, options or sections", () => {
    const c: Catalog = cat40();
    const json = serializeReport(report(c, initialSelection(c)));
    for (const t of ["Am the life of the party", "Age in completed years", "Own test options", "Interleaved source items", "Rooms"]) {
      expect(json, t).not.toContain(t);
    }
    expect(json).toContain("extraversion_01");
  });

  it("a conflicting selection is reported but marked as not a valid questionnaire", () => {
    const c: Catalog = cat("20_Katalog_Vollstaendige_Skalen.json");
    const sel = new Set(initialSelection(c));
    sel.delete("conscientiousness_01");
    const r = report(c, sel);
    expect(r.validity).toBe("hasConflicts");
    expect(r.notice).toMatch(/not a valid questionnaire/);
    expect(r.status.selection).toBe("fail");
    expect(r.diagnostics.map((d) => d.code)).toEqual(expect.arrayContaining(["SCALE_PARTIAL_NOT_ALLOWED", "MODULE_PARTIAL"]));
    expect(r.counts.errors).toBeGreaterThanOrEqual(2);
  });

  it("includes blocked item IDs of the rights decisions", () => {
    const c: Catalog = cat10();
    (c.rights[0] as any).permissions.electronicDisplay = "unknown";
    const sel = initialSelection(c);
    const r = buildCheckReport({ catalog: c, loadDiagnostics: [], selection: sel, language: "en", now: NOW });
    expect(r.rights[0]!.blockedItemIds.sort()).toEqual(["extraversion_01", "extraversion_02"]);
    expect(r.status.rights).toBe("warning");
  });

  it("is stale after any change of selection, language, platform or catalog (C01)", () => {
    const c: Catalog = cat30();
    const sel = initialSelection(c);
    const r = buildCheckReport({ catalog: c, loadDiagnostics: [], selection: sel, language: "de-CH", now: NOW });
    expect(isReportStale(r, c, sel, "de-CH")).toBe(false);
    expect(isReportStale(r, c, setItem(c, sel, "conscientiousness_01", true), "de-CH")).toBe(true);
    expect(isReportStale(r, c, sel, "en")).toBe(true);
    expect(isReportStale(r, c, sel, "de-CH", "limesurvey")).toBe(true);
    const other: Catalog = clone(c);
    other.catalog.version = "1.0.1";
    expect(isReportStale(r, other, sel, "de-CH")).toBe(true);
  });

  it("the fingerprint ignores click order", () => {
    const c: Catalog = cat10();
    const a = new Set(["extraversion_01", "conscientiousness_01"]);
    const b = new Set(["conscientiousness_01", "extraversion_01"]);
    expect(stateFingerprint(c, a, "en")).toBe(stateFingerprint(c, b, "en"));
  });

  it("serializes deterministically and names the file without notes", () => {
    const c: Catalog = cat10();
    const r = report(c, initialSelection(c));
    expect(serializeReport(r)).toBe(serializeReport(r));
    expect(JSON.parse(serializeReport(r)).reportVersion).toBe("1.0.0");
    expect(reportFileName(c)).toBe("school_test_small_1.0.0_check-report.json");
  });

  it("works for withdrawn catalogs and reports the notice flags", () => {
    const c: Catalog = cat10();
    (c.catalog as any).status = "withdrawn";
    const r = buildCheckReport({ catalog: c, loadDiagnostics: [], selection: initialSelection(c), language: "en", now: NOW });
    expect(r.catalogRef.status).toBe("withdrawn");
    expect(r.rights.every((x) => x.flags.withdrawnNotice)).toBe(true);
  });
});
