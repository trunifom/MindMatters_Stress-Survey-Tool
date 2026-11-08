import { describe, expect, it } from "vitest";
import { hasErrors } from "../../src/core/diagnostics";
import { loadCatalog, loadProject } from "../../src/core/loader";
import type { Catalog, Customization } from "../../src/core/types";
import { applyCustomization, baseText, CUSTOM_RIGHTS_ID, isEmptyCustomization, nextBlockId, normalizeCustomization } from "../../src/model/customize";
import { createProject, serializeProject } from "../../src/model/project";
import { buildNeutralCsv } from "../../src/output/csvtable";
import { buildPackage } from "../../src/output/package";
import { clone, example040 } from "./helpers";

const base = (): Catalog => clone(example040()) as Catalog;
const all = (c: Catalog) => new Set(c.items.map((i) => i.id));

describe("applyCustomization", () => {
  it("returns the very same catalog if there is nothing to apply", () => {
    const c = base();
    expect(applyCustomization(c, undefined).catalog).toBe(c);
    expect(applyCustomization(c, {}).catalog).toBe(c);
    expect(applyCustomization(c, { textOverrides: { title: { en: "   " } }, customBlocks: [] }).catalog).toBe(c);
    expect(isEmptyCustomization({ customBlocks: [] })).toBe(true);
  });

  it("never changes the catalog it was given", () => {
    const c = base();
    const before = JSON.stringify(c);
    applyCustomization(c, { textOverrides: { title: { en: "Mine" } }, customBlocks: [{ id: "custom_1", style: "text", text: { en: "x" }, sectionRef: "intro" }] });
    expect(JSON.stringify(c)).toBe(before);
  });

  it("applies adapted texts per language and keeps the other languages", () => {
    const c = base();
    const r = applyCustomization(c, { textOverrides: { introduction: { "de-CH": "Unsere Einleitung" }, closingText: { en: "Bye", "de-CH": "Tschüss" } } });
    expect(r.diagnostics).toEqual([]);
    expect(r.catalog.questionnaire.introduction).toEqual({ "de-CH": "Unsere Einleitung" });
    expect(r.catalog.questionnaire.closingText).toEqual({ en: "Bye", "de-CH": "Tschüss" });
    expect(baseText(c, "introduction")).toEqual({ en: "Software test only.", "de-CH": "Nur für Softwaretests." });
  });

  it("ignores and reports an adaptation of a locked text", () => {
    const c = base();
    expect(c.questionnaire.lockedTexts).toContain("consentText");
    const r = applyCustomization(c, { textOverrides: { consentText: { en: "Changed" }, consentTitle: { en: "My consent" } } });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["CUSTOM_TEXT_LOCKED"]);
    expect(r.catalog.questionnaire.consent?.text).toEqual(c.questionnaire.consent?.text);
    expect(r.catalog.questionnaire.consent?.title).toEqual({ en: "My consent" });
  });

  it("ignores consent title and parental text when the catalog has no consent section", () => {
    const c = base();
    delete c.questionnaire.consent;
    const r = applyCustomization(c, { textOverrides: { consentTitle: { en: "x" }, parentalConsentText: { en: "y" } } });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["CUSTOM_TEXT_NO_TARGET", "CUSTOM_TEXT_LOCKED"]); // the example locks the parental text, which is checked first
    expect(r.catalog.questionnaire.consent).toBeUndefined();
  });

  it("inserts own blocks as note items at the requested place, with their own rights", () => {
    const c = base();
    const firstId = c.questionnaire.sections[0]!.itemRefs[0]!;
    const r = applyCustomization(c, {
      customBlocks: [
        { id: "custom_1", style: "title", text: { en: "Welcome", "de-CH": "Willkommen" }, sectionRef: "intro" },
        { id: "custom_2", style: "notice", text: { en: "Hint" }, sectionRef: "intro", afterItemRef: firstId },
      ],
    });
    expect(r.diagnostics).toEqual([]);
    expect(r.blockIds).toEqual(["custom_1", "custom_2"]);
    const refs = r.catalog.questionnaire.sections[0]!.itemRefs;
    expect(refs[0]).toBe("custom_1");
    expect(refs.indexOf("custom_2")).toBe(refs.indexOf(firstId) + 1);
    const item = r.catalog.items.find((i) => i.id === "custom_2")!;
    expect(item.response).toEqual({ kind: "note", style: "notice" });
    expect(item.origin).toBe("own");
    expect(item.rightsRef).toBe(CUSTOM_RIGHTS_ID);
    expect(r.catalog.rights.filter((x) => x.id === CUSTOM_RIGHTS_ID)).toHaveLength(1);
  });

  it("skips a block with an unknown section or a taken id instead of placing it somewhere else", () => {
    const c = base();
    const r = applyCustomization(c, {
      customBlocks: [
        { id: "custom_1", style: "text", text: { en: "a" }, sectionRef: "nowhere" },
        { id: c.items[0]!.id, style: "text", text: { en: "b" }, sectionRef: "intro" },
      ],
    });
    expect(r.diagnostics.map((d) => d.code).sort()).toEqual(["CUSTOM_BLOCK_ID_TAKEN", "CUSTOM_BLOCK_SECTION_UNKNOWN"]);
    expect(r.blockIds).toEqual([]);
    expect(r.catalog.items.length).toBe(c.items.length);
  });

  it("falls back to the start of the section, with a warning, if the anchor item is not in it", () => {
    const c = base();
    const r = applyCustomization(c, { customBlocks: [{ id: "custom_1", style: "text", text: { en: "a" }, sectionRef: "intro", afterItemRef: "not_there" }] });
    expect(r.diagnostics.map((d) => d.code)).toEqual(["CUSTOM_BLOCK_ANCHOR_UNKNOWN"]);
    expect(r.catalog.questionnaire.sections[0]!.itemRefs[0]).toBe("custom_1");
  });

  it("produces a catalog that passes the full validation, so exports and checks can rely on it", () => {
    const c = base();
    const r = applyCustomization(c, {
      textOverrides: { introduction: { en: "Hello", "de-CH": "Hallo" } },
      customBlocks: [{ id: "custom_1", style: "subtitle", text: { en: "Part", "de-CH": "Teil" }, sectionRef: "battery" }],
    });
    const load = loadCatalog(JSON.stringify(r.catalog));
    expect(load.ok, JSON.stringify(load.diagnostics.filter((d) => d.severity === "error"))).toBe(true);
  });

  it("flows into the exports: the adapted wording is what gets written", () => {
    const c: any = base();
    c.catalog.status = "released";
    const r = applyCustomization(c, { customBlocks: [{ id: "custom_1", style: "text", text: { en: "Own paragraph for our school" }, sectionRef: "intro" }] });
    const out = buildNeutralCsv(r.catalog, all(r.catalog), { language: "en", mode: "native" });
    expect(out.ok, JSON.stringify(out.diagnostics)).toBe(true);
    expect(out.content).toContain("Own paragraph for our school");
  });

  it("numbers new blocks without clashes", () => {
    const c = base();
    expect(nextBlockId(c, undefined)).toBe("custom_1");
    expect(nextBlockId(c, { customBlocks: [{ id: "custom_1", style: "text", text: { en: "a" }, sectionRef: "intro" }] })).toBe("custom_2");
  });

  it("normalizes: drops empty texts and blocks, keeps a stable shape", () => {
    expect(normalizeCustomization({ textOverrides: { title: { en: " " } }, customBlocks: [{ id: "custom_1", style: "text", text: { en: "" }, sectionRef: "intro" }] })).toBeUndefined();
    const n = normalizeCustomization({ customBlocks: [{ id: "custom_1", style: "text", text: { en: "a", de: " " }, sectionRef: "intro", afterItemRef: null }] })!;
    expect(n.customBlocks![0]).toEqual({ id: "custom_1", style: "text", text: { en: "a" }, sectionRef: "intro" });
  });
});

describe("project file with customization", () => {
  const custom: Customization = {
    textOverrides: { introduction: { "de-CH": "Eigene Einleitung" } },
    customBlocks: [{ id: "custom_1", style: "notice", text: { "de-CH": "Eigener Hinweis" }, sectionRef: "intro" }],
  };

  it("round-trips: the block, its selection and the adapted text come back", () => {
    const c = base();
    const eff = applyCustomization(c, custom).catalog;
    const { project } = createProject(eff, all(eff), { language: "de-CH", customization: custom });
    expect(project!.customization).toEqual(custom);
    expect(project!.selectedItemIds).toContain("custom_1");
    const r = loadProject(serializeProject(project!), c);
    expect(r.project).toBeDefined();
    expect(r.catalog!.questionnaire.introduction).toEqual({ "de-CH": "Eigene Einleitung" });
    expect(r.result!.selection).toContain("custom_1");
    expect(hasErrors(r.diagnostics.filter((d) => d.code === "UNKNOWN_ITEM_ID"))).toBe(false);
  });

  it("a project without customization stays exactly as before (no new key)", () => {
    const c = base();
    const { project } = createProject(c, all(c), { language: "en" });
    expect("customization" in project!).toBe(false);
  });

  it("the file never carries catalog wording, only the school's own texts", () => {
    const c = base();
    const eff = applyCustomization(c, custom).catalog;
    const text = serializeProject(createProject(eff, all(eff), { language: "de-CH", customization: custom }).project!);
    expect(text).not.toContain("Nur für Softwaretests");
    expect(text).toContain("Eigener Hinweis");
  });

  it("rejects an invalid customization by schema (bad block id, unknown key)", () => {
    const c = base();
    const eff = applyCustomization(c, custom).catalog;
    const p: any = JSON.parse(serializeProject(createProject(eff, all(eff), { language: "de-CH", customization: custom }).project!));
    p.customization.customBlocks[0].id = "Bad Id";
    expect(loadProject(JSON.stringify(p), c).ok).toBe(false);
    const q: any = JSON.parse(serializeProject(createProject(eff, all(eff), { language: "de-CH", customization: custom }).project!));
    q.customization.somethingElse = true;
    expect(loadProject(JSON.stringify(q), c).ok).toBe(false);
  });

  it("a locked text in a project file is reported and not applied", () => {
    const c = base();
    const eff = c;
    const p: any = JSON.parse(serializeProject(createProject(eff, all(eff), { language: "en" }).project!));
    p.customization = { textOverrides: { consentText: { en: "sneaky" } } };
    const r = loadProject(JSON.stringify(p), c);
    expect(r.diagnostics.some((d) => d.code === "CUSTOM_TEXT_LOCKED")).toBe(true);
    expect(r.catalog!.questionnaire.consent!.text).toEqual(c.questionnaire.consent!.text);
  });
});

describe("package with customization", () => {
  it("writes the customization into the project file of the package", () => {
    const c: any = base();
    const custom: Customization = { customBlocks: [{ id: "custom_1", style: "text", text: { en: "Hello" }, sectionRef: "intro" }] };
    const eff = applyCustomization(c, custom).catalog;
    const r = buildPackage({ catalog: eff, loadDiagnostics: [], selection: all(eff), language: "en", customization: custom, now: new Date("2026-11-08T10:00:00") });
    expect(r.included.some((i) => i.file.endsWith("_project.json"))).toBe(true);
  });
});
