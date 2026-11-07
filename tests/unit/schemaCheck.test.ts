import { describe, expect, it } from "vitest";
import { validateStructure, checkVersionAndType } from "../../src/core/schemaCheck";
import { migrateToCurrent } from "../../src/core/migrate";
import { clone, example040, fixture030, fixture040, POSITIVE_PAIRS } from "./helpers";

const codes = (ds: { code: string }[]) => ds.map((d) => d.code);

describe("version and type gate (T06)", () => {
  it("rejects a non-object root", () => {
    expect(codes(validateStructure([], "catalog"))).toEqual(["DOCUMENT_NOT_OBJECT"]);
    expect(codes(validateStructure("x", "project"))).toEqual(["DOCUMENT_NOT_OBJECT"]);
  });
  it("reports a missing schemaVersion", () => {
    expect(codes(validateStructure({}, "catalog"))).toEqual(["SCHEMA_VERSION_MISSING"]);
  });
  it("does not process 0.3.0 directly but points to the migration", () => {
    const ds = validateStructure(fixture030("10_Katalog_Klein_Gemischt.json"), "catalog");
    expect(codes(ds)).toEqual(["SCHEMA_VERSION_MIGRATION_REQUIRED"]);
    expect(ds[0]!.remediation).toMatch(/migrat/i);
  });
  it("rejects unknown versions", () => {
    const doc = { ...example040(), schemaVersion: "9.9.9" };
    expect(codes(validateStructure(doc, "catalog"))).toEqual(["SCHEMA_VERSION_UNSUPPORTED"]);
  });
  it("rejects a catalog passed as project and vice versa", () => {
    expect(codes(checkVersionAndType(example040(), "project"))).toEqual(["DOCUMENT_TYPE_MISMATCH"]);
    const project = fixture040("11_Projekt_Klein_Gemischt.json");
    expect(codes(checkVersionAndType(project, "catalog"))).toEqual(["DOCUMENT_TYPE_MISMATCH"]);
  });
});

describe("explicit migration 0.3.0 -> 0.4.0", () => {
  it("never mutates its input", () => {
    const original = fixture030("10_Katalog_Klein_Gemischt.json");
    const snapshot = JSON.stringify(original);
    const r = migrateToCurrent(original);
    expect(r.ok).toBe(true);
    expect(JSON.stringify(original)).toBe(snapshot);
    expect(original.schemaVersion).toBe("0.3.0");
  });
  it("changes only schemaVersion and reports it", () => {
    const original = fixture030("20_Katalog_Vollstaendige_Skalen.json");
    const r = migrateToCurrent(original);
    if (!r.ok) throw new Error("expected ok");
    expect(r.doc.schemaVersion).toBe("0.4.0");
    expect({ ...r.doc, schemaVersion: "0.3.0" }).toEqual(original);
    expect(codes(r.diagnostics)).toEqual(["MIGRATED_SCHEMA_VERSION"]);
  });
  it("refuses any other version", () => {
    for (const v of ["0.4.0", "0.2.0", "1.0.0", undefined]) {
      const r = migrateToCurrent({ schemaVersion: v });
      expect(r.ok).toBe(false);
      expect(codes(r.diagnostics)).toEqual(["MIGRATION_NOT_AVAILABLE"]);
    }
    expect(codes(migrateToCurrent(null).diagnostics)).toEqual(["DOCUMENT_NOT_OBJECT"]);
  });
  it.each(POSITIVE_PAIRS.flat())("migrated fixture %s is structurally valid", (name) => {
    const kind = name.includes("Projekt") ? "project" : "catalog";
    expect(validateStructure(fixture040(name), kind)).toEqual([]);
  });
});

describe("structure check on catalogs", () => {
  it("accepts the rich 0.4.0 example", () => {
    expect(validateStructure(example040(), "catalog")).toEqual([]);
  });

  it("fixture 90: boolean as text becomes INVALID_BOOLEAN with item reference (T05)", () => {
    const ds = validateStructure(fixture040("90_Fehler_Boolean_Als_Text.json"), "catalog");
    expect(codes(ds)).toEqual(["INVALID_BOOLEAN"]);
    expect(ds[0]!.jsonPath).toMatch(/^\/items\/\d+\/answerRequired$/);
    expect(ds[0]!.itemRef).toBe("extraversion_01");
    expect(ds[0]!.stage).toBe("structure");
  });

  it("fixtures 91/92 are structurally valid on purpose (semantic errors)", () => {
    expect(validateStructure(fixture040("91_Fehler_Fehlende_Antwortliste.json"), "catalog")).toEqual([]);
    expect(validateStructure(fixture040("92_Fehler_Projekt_Ohne_Ausloeser.json"), "project")).toEqual([]);
  });

  it("reports unknown core fields with the field path", () => {
    const doc = example040();
    doc.catalog.bogus = 1;
    const ds = validateStructure(doc, "catalog");
    expect(codes(ds)).toEqual(["UNKNOWN_FIELD"]);
    expect(ds[0]!.jsonPath).toBe("/catalog/bogus");
  });

  it("reports missing required fields at the parent path", () => {
    const doc = example040();
    delete doc.items[1].variableName;
    const ds = validateStructure(doc, "catalog");
    expect(codes(ds)).toEqual(["MISSING_FIELD"]);
    expect(ds[0]!.jsonPath).toBe("/items/1");
    expect(ds[0]!.itemRef).toBe("demo_01");
  });

  it("reports invalid ids, enums, and null values", () => {
    const doc = example040();
    doc.items[1].id = "Demo_01";
    doc.catalog.status = "final";
    doc.items[2].displayNumber = null;
    const c = codes(validateStructure(doc, "catalog"));
    expect(c).toContain("INVALID_FORMAT");
    expect(c).toContain("INVALID_VALUE");
    expect(c).toContain("INVALID_TYPE");
  });

  it("reports a bad date only once although schema has format and pattern", () => {
    const doc = example040();
    doc.catalog.createdAt = "2026-13-45";
    expect(codes(validateStructure(doc, "catalog"))).toEqual(["INVALID_FORMAT"]);
  });

  it("response oneOf: unknown kind yields exactly one specific diagnostic", () => {
    const doc = example040();
    doc.items[1].response = { kind: "ranking2" };
    const ds = validateStructure(doc, "catalog");
    expect(codes(ds)).toEqual(["UNKNOWN_RESPONSE_KIND"]);
    expect(ds[0]!.jsonPath).toBe("/items/1/response/kind");
  });

  it("response oneOf: errors of the matching branch only, no noise from other kinds", () => {
    const doc = example040();
    const slider = doc.items.find((i: any) => i.id === "mood_slider");
    delete slider.response.maximum;
    const ds = validateStructure(doc, "catalog");
    expect(codes(ds)).toEqual(["MISSING_FIELD"]);
    expect(ds[0]!.message).toMatch(/maximum/);
  });

  it("visibleWhen: group and single condition errors are attributed correctly", () => {
    const doc = example040();
    const mail = doc.items.find((i: any) => i.id === "contact_email");
    mail.visibleWhen.all[0].operator = "matches";
    const ds = validateStructure(doc, "catalog");
    expect(codes(ds)).toEqual(["INVALID_VALUE"]);
    expect(ds[0]!.jsonPath).toMatch(/visibleWhen\/all\/0\/operator$/);

    const doc2 = example040();
    const mail2 = doc2.items.find((i: any) => i.id === "contact_email");
    mail2.visibleWhen = { itemRef: "wants_help", operator: "equals" };
    const ds2 = validateStructure(doc2, "catalog");
    expect(codes(ds2)).toEqual(["MISSING_FIELD"]);
  });

  it("note items cannot be mandatory to answer", () => {
    const doc = example040();
    doc.items[0].answerRequired = true;
    expect(validateStructure(doc, "catalog").length).toBeGreaterThan(0);
  });

  it("text blocks: note styles title, subtitle, text and notice are accepted, others are not", () => {
    for (const style of ["text", "title", "subtitle", "notice"]) {
      const doc = example040();
      doc.items.find((i: any) => i.id === "anon_note").response.style = style;
      expect(validateStructure(doc, "catalog"), style).toEqual([]);
    }
    const bad = example040();
    bad.items.find((i: any) => i.id === "anon_note").response.style = "headline";
    const ds = validateStructure(bad, "catalog");
    expect(codes(ds)).toEqual(["INVALID_VALUE"]);
    expect(ds[0]!.itemRef).toBe("anon_note");
  });

  it("inclusionRequired without defaultSelected is rejected", () => {
    const doc = clone(example040());
    doc.items[1].defaultSelected = false;
    expect(validateStructure(doc, "catalog").length).toBeGreaterThan(0);
  });

  it("caps the number of structure diagnostics", () => {
    const doc = example040();
    for (let i = 0; i < 300; i++) doc.items[1]["x" + i] = 1;
    const ds = validateStructure(doc, "catalog");
    expect(ds.length).toBe(201);
    expect(ds[200]!.code).toBe("TOO_MANY_DIAGNOSTICS");
  });
});

describe("structure check on projects", () => {
  it("accepts migrated project fixtures", () => {
    expect(validateStructure(fixture040("21_Projekt_Vollstaendige_Skalen.json"), "project")).toEqual([]);
  });
  it("rejects duplicate selected ids and unknown fields", () => {
    const p = fixture040("11_Projekt_Klein_Gemischt.json");
    p.selectedItemIds.push("extraversion_01");
    p.bogus = true;
    const c = codes(validateStructure(p, "project"));
    expect(c).toContain("DUPLICATE_ENTRY");
    expect(c).toContain("UNKNOWN_FIELD");
  });
});
