import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadCatalog, loadProject, replaceCatalog, LoadedCatalog } from "../../src/core/loader";
import { DEFAULT_LIMITS } from "../../src/core/limits";

const raw = (name: string): string => readFileSync(fileURLToPath(new URL(`../fixtures/v0.3.0/${name}`, import.meta.url)), "utf-8");
const example = (): string => readFileSync(fileURLToPath(new URL("../../examples/catalog_rich_0_4_0.json", import.meta.url)), "utf-8");
const codes = (ds: { code: string }[]) => ds.map((d) => d.code);
const errorCodes = (ds: { code: string; severity: string }[]) => ds.filter((d) => d.severity === "error").map((d) => d.code);

const PAIRS: Array<[string, string, string[]]> = [
  // catalog, project, expected warning codes (matches the delivered report 06_Pruefbericht.json)
  ["10_Katalog_Klein_Gemischt.json", "11_Projekt_Klein_Gemischt.json", ["PARTIAL_SCALE"]],
  ["20_Katalog_Vollstaendige_Skalen.json", "21_Projekt_Vollstaendige_Skalen.json", []],
  ["30_Katalog_Zweisprachig.json", "31_Projekt_Zweisprachig.json", ["PARTIAL_SCALE"]],
  ["40_Katalog_Antworttypen_Logik.json", "41_Projekt_Antworttypen_Logik.json", ["PARTIAL_SCALE"]],
];

describe("loadCatalog: positive fixtures (migrated explicitly)", () => {
  it.each(PAIRS)("%s loads and yields the expected warnings", (cat, _proj, warnings) => {
    const r = loadCatalog(raw(cat), { migrate: true });
    expect(errorCodes(r.diagnostics)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.catalog?.catalog.status).toBe("draft");
    expect(r.initialSelection).toBeDefined();
    expect(r.diagnostics.filter((d) => d.severity === "warning").map((d) => d.code)).toEqual(warnings);
    expect(r.diagnostics.some((d) => d.code === "MIGRATED_SCHEMA_VERSION")).toBe(true);
    expect(r.status).toEqual({
      technical: "pass",
      selection: warnings.length ? "warning" : "pass",
      rights: "pass",
      export: "notRun",
    });
  });

  it.each(PAIRS)("%s project loads without errors and adds nothing", (cat, proj) => {
    const c = loadCatalog(raw(cat), { migrate: true });
    const r = loadProject(raw(proj), c.catalog!, { migrate: true });
    expect(errorCodes(r.diagnostics)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.result!.addedMandatory).toEqual([]);
  });

  it("the rich 0.4.0 example loads without migration and without any finding except translation gaps", () => {
    const r = loadCatalog(example());
    expect(errorCodes(r.diagnostics)).toEqual([]);
    expect(r.ok).toBe(true);
    expect(r.diagnostics.some((d) => d.code === "MIGRATED_SCHEMA_VERSION")).toBe(false);
  });
});

describe("loadCatalog: the version gate (T06)", () => {
  it("rejects a 0.3.0 file by default and points to the migration", () => {
    const r = loadCatalog(raw("10_Katalog_Klein_Gemischt.json"));
    expect(r.ok).toBe(false);
    expect(r.catalog).toBeUndefined();
    expect(codes(r.diagnostics)).toEqual(["SCHEMA_VERSION_MIGRATION_REQUIRED"]);
  });
  it("rejects an unknown version even with migrate=true", () => {
    const text = raw("10_Katalog_Klein_Gemischt.json").replace('"schemaVersion": "0.3.0"', '"schemaVersion": "9.0.0"');
    const r = loadCatalog(text, { migrate: true });
    expect(codes(r.diagnostics)).toEqual(["SCHEMA_VERSION_UNSUPPORTED"]);
  });
});

describe("loadCatalog: the negative fixtures", () => {
  it("90: boolean as text -> INVALID_BOOLEAN, nothing loaded", () => {
    const r = loadCatalog(raw("90_Fehler_Boolean_Als_Text.json"), { migrate: true });
    expect(errorCodes(r.diagnostics)).toEqual(["INVALID_BOOLEAN"]);
    expect(r.ok).toBe(false);
    expect(r.catalog).toBeUndefined();
    expect(r.status.technical).toBe("fail");
    expect(r.status.selection).toBe("notRun");
  });
  it("91: unknown option set -> MISSING_OPTION_SET, no follow-up noise", () => {
    const r = loadCatalog(raw("91_Fehler_Fehlende_Antwortliste.json"), { migrate: true });
    expect(errorCodes(r.diagnostics)).toEqual(["MISSING_OPTION_SET"]);
    expect(r.catalog).toBeUndefined();
    expect(r.status.selection).toBe("notRun"); // initial selection is not judged on an unsound catalog
  });
  it("92: project without trigger -> DEPENDENCY_NOT_SELECTED", () => {
    const c = loadCatalog(raw("40_Katalog_Antworttypen_Logik.json"), { migrate: true });
    const r = loadProject(raw("92_Fehler_Projekt_Ohne_Ausloeser.json"), c.catalog!, { migrate: true });
    expect(errorCodes(r.diagnostics)).toEqual(["DEPENDENCY_NOT_SELECTED"]);
    expect(r.ok).toBe(false);
    expect(r.result).toBeDefined(); // intermediate state stays editable
  });
});

describe("loadCatalog: file level (T04, T41)", () => {
  it("syntax error", () => {
    const r = loadCatalog('{"schemaVersion": "0.4.0",}');
    expect(codes(r.diagnostics)).toEqual(["JSON_SYNTAX_ERROR"]);
    expect(r.ok).toBe(false);
  });
  it("duplicate keys are rejected although JSON.parse would accept them", () => {
    const text = example().replace('"documentType": "questionnaireCatalog",', '"documentType": "questionnaireCatalog", "documentType": "questionnaireCatalog",');
    expect(() => JSON.parse(text)).not.toThrow();
    expect(codes(loadCatalog(text).diagnostics)).toEqual(["JSON_DUPLICATE_KEY"]);
  });
  it("size limit", () => {
    const r = loadCatalog(example(), { limits: { ...DEFAULT_LIMITS, maxBytes: 1000 } });
    expect(codes(r.diagnostics)).toEqual(["LIMIT_EXCEEDED"]);
  });
  it("script strings and dangerous links are only data (T41)", () => {
    const evil = JSON.parse(example());
    evil.items[1].text.en = "<img src=x onerror=alert(1)><script>alert(1)</script>";
    evil.sources[0].url = "javascript:alert(1)";
    const r = loadCatalog(JSON.stringify(evil));
    // The text is kept verbatim as text (rendering must use textContent); the javascript: URL is rejected by the schema.
    expect(codes(r.diagnostics)).toContain("INVALID_FORMAT");
    expect(r.ok).toBe(false);
  });
  it("a script string in a text is accepted as plain text", () => {
    const evil = JSON.parse(example());
    evil.items[1].text.en = "<script>alert(1)</script>";
    const r = loadCatalog(JSON.stringify(evil));
    expect(r.ok).toBe(true);
    expect(r.catalog!.items[1]!.text.en).toBe("<script>alert(1)</script>");
  });
});

describe("loadCatalog: a catalog with an inconsistent initial selection (A08)", () => {
  it("is rejected as a configuration error, not presented as a later export error", () => {
    const doc = JSON.parse(example());
    doc.items.find((i: any) => i.id === "wants_help").defaultSelected = false; // contact_email depends on it
    const r = loadCatalog(JSON.stringify(doc));
    expect(r.ok).toBe(false);
    const e = r.diagnostics.find((d) => d.code === "DEPENDENCY_NOT_SELECTED")!;
    expect(e.context).toBe("initial");
    expect(r.status.selection).toBe("fail");
    expect(r.catalog).toBeUndefined();
  });
});

describe("loadProject", () => {
  const cat10 = () => loadCatalog(raw("10_Katalog_Klein_Gemischt.json"), { migrate: true }).catalog!;
  it("0.3.0 projects need the explicit migration as well", () => {
    const r = loadProject(raw("11_Projekt_Klein_Gemischt.json"), cat10());
    expect(codes(r.diagnostics)).toEqual(["SCHEMA_VERSION_MIGRATION_REQUIRED"]);
    expect(r.ok).toBe(false);
  });
  it("a project of another catalog version yields no selection and no guess (T28)", () => {
    const text = raw("11_Projekt_Klein_Gemischt.json").replace('"version": "1.0.0"', '"version": "2.0.0"');
    const r = loadProject(text, cat10(), { migrate: true });
    expect(errorCodes(r.diagnostics)).toEqual(["PROJECT_CATALOG_MISMATCH"]);
    expect(r.result).toBeUndefined();
  });
  it("a catalog file passed as project is rejected by type", () => {
    const r = loadProject(example(), cat10());
    expect(codes(r.diagnostics)).toEqual(["DOCUMENT_TYPE_MISMATCH"]);
  });
  it("internal notes and school label never alter the selection", () => {
    const doc = JSON.parse(raw("11_Projekt_Klein_Gemischt.json"));
    doc.schoolLabel = "Schule X";
    doc.internalNotes = "vertraulich";
    const r = loadProject(JSON.stringify(doc), cat10(), { migrate: true });
    expect(r.ok).toBe(true);
    expect(r.result!.selection).toEqual(["extraversion_01", "extraversion_02"]);
  });
});

describe("transactional replacement (T04, T42)", () => {
  const good = () => loadCatalog(raw("10_Katalog_Klein_Gemischt.json"), { migrate: true });
  it("a rejected file leaves the previous valid state untouched and says so", () => {
    const first = replaceCatalog(undefined, good());
    expect(first.state?.catalog.catalog.id).toBe("school_test_small");

    const bad = loadCatalog('{"broken": ', { migrate: true });
    const second = replaceCatalog(first.state, bad);
    expect(second.state).toBe(first.state); // same object, nothing replaced
    expect(codes(second.diagnostics)).toEqual(["JSON_SYNTAX_ERROR", "PREVIOUS_STATE_KEPT"]);
  });
  it("a valid file replaces the state", () => {
    const first: LoadedCatalog = replaceCatalog(undefined, good()).state!;
    const next = replaceCatalog(first, loadCatalog(raw("20_Katalog_Vollstaendige_Skalen.json"), { migrate: true }));
    expect(next.state!.catalog.catalog.id).toBe("school_test_complete");
    expect(next.state).not.toBe(first);
  });
  it("without a previous state a failure yields no state and no note", () => {
    const r = replaceCatalog(undefined, loadCatalog("nope"));
    expect(r.state).toBeUndefined();
    expect(codes(r.diagnostics)).toEqual(["JSON_SYNTAX_ERROR"]);
  });
});
