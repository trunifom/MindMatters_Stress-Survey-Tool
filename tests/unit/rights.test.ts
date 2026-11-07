import { describe, expect, it } from "vitest";
import { effectiveRights, evaluateAction, mayDisplay, requiredAttributions } from "../../src/model/rights";
import { initialSelection } from "../../src/model/selection";
import { loadCatalog } from "../../src/core/loader";
import type { Catalog } from "../../src/core/types";
import { clone, fixture040, example040 } from "./helpers";

const cat10 = (): any => clone(fixture040("10_Katalog_Klein_Gemischt.json"));
const cat40 = (): any => clone(fixture040("40_Katalog_Antworttypen_Logik.json"));
const codes = (ds: { code: string }[]) => ds.map((d) => d.code);
const profile = (c: any, id: string) => c.rights.find((r: any) => r.id === id);
const sel = (c: Catalog) => initialSelection(c);

const ALL_ACTIONS = ["displayItems", "saveProject", "saveCheckReport", "codebookWithTexts", "nativeExport", "devTestExport"] as const;

describe("resolution of effective rights (B05)", () => {
  it("item profile wins over instrument profile", () => {
    const c = cat40();
    const own = c.items.find((i: any) => i.id === "age_test");
    expect(effectiveRights(c, own).source).toBe("item");
    expect(effectiveRights(c, own).profileId).toBe("rights_own");
  });
  it("falls back to the instrument profile", () => {
    const c = cat10();
    const item = c.items.find((i: any) => i.id === "extraversion_01");
    const r = effectiveRights(c, item);
    expect(r.source).toBe("instrument");
    expect(r.profileId).toBe("rights_ipip");
  });
  it("an item with neither is unknown and unreviewed", () => {
    const c = cat10();
    const item = c.items.find((i: any) => i.id === "extraversion_01");
    delete item.instrumentRef;
    const r = effectiveRights(c, item);
    expect(r.source).toBe("none");
    expect(r.reviewStatus).toBe("unreviewed");
    expect(Object.values(r.permissions).every((p) => p === "unknown")).toBe(true);
  });
  it("an item override replaces, never merges with, the instrument profile", () => {
    const c = cat10();
    c.rights.push({
      id: "rights_strict",
      reviewStatus: "reviewed",
      permissions: { redistribution: "prohibited", electronicDisplay: "permitted", electronicAdministration: "permitted", modification: "prohibited", export: "permitted" },
    });
    const item = c.items.find((i: any) => i.id === "extraversion_01");
    item.rightsRef = "rights_strict";
    expect(effectiveRights(c, item).permissions.redistribution).toBe("prohibited");
    const other = c.items.find((i: any) => i.id === "extraversion_02");
    expect(effectiveRights(c, other).permissions.redistribution).toBe("permitted");
  });
});

describe("baseline: everything declared and reviewed", () => {
  it("draft catalog: all actions except regular native export are allowed", () => {
    const c = cat10();
    const s = sel(c);
    for (const a of ALL_ACTIONS) {
      const d = evaluateAction(c, a, { selection: s });
      expect(d.allowed, a).toBe(a !== "nativeExport");
      expect(d.blockedItems, a).toEqual([]);
    }
  });
  it("the loader reports the rights status", () => {
    const text = JSON.stringify(example040());
    expect(loadCatalog(text).status.rights).toBe("pass");
  });
});

describe("T36: unknown display rights lock the text but not the technical diagnosis", () => {
  it("locks exactly the affected items; other actions stay possible", () => {
    const c = cat10();
    profile(c, "rights_ipip").permissions.electronicDisplay = "unknown";
    const s = sel(c);
    const display = evaluateAction(c, "displayItems", { selection: s });
    expect(display.allowed).toBe(false);
    expect(display.blockedItems.map((b) => b.itemId).sort()).toEqual(["extraversion_01", "extraversion_02"]);
    expect(mayDisplay(display, "extraversion_01")).toBe(false);
    expect(display.diagnostics[0]!.code).toBe("RIGHTS_PERMISSION_UNKNOWN");
    expect(display.diagnostics[0]!.severity).toBe("warning"); // text locked, catalog still usable
    expect(display.diagnostics[0]!.stage).toBe("rights");
    // diagnosis, project and report need no display right
    for (const a of ["saveProject", "saveCheckReport"] as const) expect(evaluateAction(c, a, { selection: s }).allowed).toBe(true);
  });
  it("a locked catalog stays loadable and reports a rights warning", () => {
    const doc = example040();
    doc.rights[0].permissions.electronicDisplay = "unknown";
    const r = loadCatalog(JSON.stringify(doc));
    expect(r.ok).toBe(true);
    expect(r.status.rights).toBe("warning");
    expect(r.diagnostics.some((d) => d.code === "RIGHTS_PERMISSION_UNKNOWN")).toBe(true);
  });
  it("items with an unlocked profile remain displayable", () => {
    const c = cat40();
    profile(c, "rights_ipip").permissions.electronicDisplay = "unknown";
    const d = evaluateAction(c, "displayItems", { selection: sel(c) });
    expect(mayDisplay(d, "age_test")).toBe(true);
    expect(mayDisplay(d, "extraversion_01")).toBe(false);
  });
});

describe("T35: permitted use with a prohibited modification is consistent", () => {
  it("modification=prohibited blocks nothing the product offers", () => {
    const c = cat10();
    profile(c, "rights_ipip").permissions.modification = "prohibited";
    const s = sel(c);
    for (const a of ["displayItems", "codebookWithTexts", "devTestExport"] as const) {
      expect(evaluateAction(c, a, { selection: s }).blockedItems, a).toEqual([]);
    }
  });
  it("a prohibition that an action does not need does not block it", () => {
    const c = cat10();
    profile(c, "rights_ipip").permissions.electronicAdministration = "prohibited";
    const s = sel(c);
    expect(evaluateAction(c, "codebookWithTexts", { selection: s }).allowed).toBe(true);
    expect(evaluateAction(c, "displayItems", { selection: s }).allowed).toBe(true);
    expect(evaluateAction(c, "devTestExport", { selection: s }).allowed).toBe(false);
  });
});

describe("T37: codebook and native export follow their own rows of the matrix", () => {
  it("codebook needs export, redistribution and electronicDisplay", () => {
    for (const p of ["export", "redistribution", "electronicDisplay"] as const) {
      const c = cat10();
      profile(c, "rights_ipip").permissions[p] = "prohibited";
      const d = evaluateAction(c, "codebookWithTexts", { selection: sel(c) });
      expect(d.allowed, p).toBe(false);
      const f = d.diagnostics.find((x) => x.code === "RIGHTS_PERMISSION_PROHIBITED")!;
      expect(f.message).toContain(p);
      expect(f.severity).toBe("error");
    }
  });
  it("the codebook withholds only the blocked texts", () => {
    const c = cat40();
    profile(c, "rights_ipip").permissions.redistribution = "unknown";
    const d = evaluateAction(c, "codebookWithTexts", { selection: sel(c) });
    expect(mayDisplay(d, "age_test")).toBe(true);
    expect(mayDisplay(d, "extraversion_01")).toBe(false);
    // display in the configurator is unaffected
    expect(evaluateAction(c, "displayItems", { selection: sel(c) }).allowed).toBe(true);
  });
  it("native export needs electronicAdministration, not electronicDisplay", () => {
    const c = cat10();
    c.catalog.status = "released";
    profile(c, "rights_ipip").permissions.electronicDisplay = "unknown";
    expect(evaluateAction(c, "nativeExport", { selection: sel(c) }).allowed).toBe(true);
    profile(c, "rights_ipip").permissions.electronicAdministration = "unknown";
    expect(evaluateAction(c, "nativeExport", { selection: sel(c) }).allowed).toBe(false);
  });
  it("a review status other than reviewed blocks, even if every permission is declared", () => {
    for (const status of ["unreviewed", "clarificationRequired"]) {
      const c = cat10();
      profile(c, "rights_ipip").reviewStatus = status;
      const d = evaluateAction(c, "displayItems", { selection: sel(c) });
      expect(d.allowed, status).toBe(false);
      expect(d.diagnostics[0]!.code).toBe("RIGHTS_UNREVIEWED");
      expect(d.diagnostics[0]!.message).toMatch(/unconfirmed statement/);
    }
  });
  it("findings are aggregated per reason, not per item", () => {
    const c = cat40();
    c.items.forEach((i: any) => {
      i.rightsRef = undefined;
      delete i.rightsRef;
      delete i.instrumentRef;
    });
    const d = evaluateAction(c, "displayItems", { selection: sel(c) });
    expect(d.blockedItems.length).toBe(sel(c).size);
    expect(d.diagnostics.length).toBeLessThanOrEqual(6); // unreviewed + a handful of permission reasons
    expect(d.diagnostics.some((x) => /10 selected items/.test(x.message))).toBe(true);
  });
});

describe("T45: catalog status policy", () => {
  it("draft: no regular native export, but a labelled test export is possible", () => {
    const c = cat10();
    const s = sel(c);
    const reg = evaluateAction(c, "nativeExport", { selection: s });
    expect(reg.allowed).toBe(false);
    expect(reg.catalogBlocked).toBe(true);
    expect(codes(reg.diagnostics)).toEqual(["CATALOG_NOT_RELEASED"]);
    const test = evaluateAction(c, "devTestExport", { selection: s });
    expect(test.allowed).toBe(true);
    expect(test.flags).toEqual({ draftWatermark: true, withdrawnNotice: false, testArtifact: true });
  });
  it("reviewed is not released", () => {
    const c = cat10();
    c.catalog.status = "reviewed";
    expect(evaluateAction(c, "nativeExport", { selection: sel(c) }).catalogBlocked).toBe(true);
  });
  it("released: native export allowed when rights fit; no watermark", () => {
    const c = cat10();
    c.catalog.status = "released";
    const d = evaluateAction(c, "nativeExport", { selection: sel(c) });
    expect(d.allowed).toBe(true);
    expect(d.flags).toEqual({ draftWatermark: false, withdrawnNotice: false, testArtifact: false });
    expect(d.diagnostics).toEqual([]);
  });
  it("draft codebook carries the watermark", () => {
    const c = cat10();
    const d = evaluateAction(c, "codebookWithTexts", { selection: sel(c) });
    expect(d.flags.draftWatermark).toBe(true);
    expect(codes(d.diagnostics)).toContain("DRAFT_WATERMARK_REQUIRED");
  });
  it("withdrawn: native and test export blocked, views and codebook marked", () => {
    const c = cat10();
    c.catalog.status = "withdrawn";
    const s = sel(c);
    for (const a of ["nativeExport", "devTestExport"] as const) {
      const d = evaluateAction(c, a, { selection: s });
      expect(d.allowed, a).toBe(false);
      expect(d.flags.withdrawnNotice, a).toBe(true);
      expect(d.diagnostics.find((x) => x.code === "CATALOG_WITHDRAWN")!.severity).toBe("error");
    }
    for (const a of ["displayItems", "codebookWithTexts", "saveProject"] as const) {
      const d = evaluateAction(c, a, { selection: s });
      expect(d.allowed, a).toBe(true);
      expect(d.flags.withdrawnNotice, a).toBe(true);
      expect(d.diagnostics.find((x) => x.code === "CATALOG_WITHDRAWN")!.severity).toBe("warning");
    }
  });
  it("a test export never bypasses a rights prohibition", () => {
    const c = cat10();
    profile(c, "rights_ipip").permissions.export = "prohibited";
    const d = evaluateAction(c, "devTestExport", { selection: sel(c) });
    expect(d.allowed).toBe(false);
    expect(d.blockedItems.length).toBeGreaterThan(0);
  });
});

describe("scope and attribution", () => {
  it("only selected items are evaluated", () => {
    const c = cat10();
    c.items.find((i: any) => i.id === "conscientiousness_01").rightsRef = undefined;
    delete c.items.find((i: any) => i.id === "conscientiousness_01").rightsRef;
    delete c.items.find((i: any) => i.id === "conscientiousness_01").instrumentRef;
    expect(evaluateAction(c, "displayItems", { selection: sel(c) }).allowed).toBe(true);
    const withIt = new Set([...sel(c), "conscientiousness_01"]);
    const d = evaluateAction(c, "displayItems", { selection: withIt });
    expect(d.blockedItems.map((b) => b.itemId)).toEqual(["conscientiousness_01"]);
  });
  it("without a selection the whole catalog is evaluated", () => {
    const c = cat10();
    expect(evaluateAction(c, "displayItems").allowedItemIds).toHaveLength(12);
  });
  it("required attribution is collected once per profile and never dropped", () => {
    const c = cat40();
    profile(c, "rights_ipip").attribution = { en: "IPIP, public domain" };
    profile(c, "rights_own").attribution = { en: "Own content" };
    const a = requiredAttributions(c, sel(c));
    expect(a.map((x) => x.profileId).sort()).toEqual(["rights_ipip", "rights_own"]);
    expect(requiredAttributions(c, new Set(["extraversion_01"])).map((x) => x.profileId)).toEqual(["rights_ipip"]);
    expect(requiredAttributions(cat40(), sel(c))).toEqual([]);
  });
});
