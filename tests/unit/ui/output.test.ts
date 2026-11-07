// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { chooseFile, click, exampleText, fixtureText, Harness, mount } from "./helpers";
import { loadCatalogText, setView, toggleItem } from "../../../src/ui/state";

interface Download {
  name: string;
  text: string;
}

let downloads: Download[] = [];
const blobs = new Map<string, Blob>();
let counter = 0;
const origCreate = URL.createObjectURL;
const origRevoke = URL.revokeObjectURL;
const origClick = HTMLAnchorElement.prototype.click;

function readBlob(b: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsText(b);
  });
}

beforeEach(() => {
  downloads = [];
  blobs.clear();
  URL.createObjectURL = (b: Blob | MediaSource) => {
    const url = `blob:test/${++counter}`;
    blobs.set(url, b as Blob);
    return url;
  };
  URL.revokeObjectURL = () => undefined;
  // jsdom cannot navigate: record the download instead
  HTMLAnchorElement.prototype.click = function (this: HTMLAnchorElement) {
    const blob = blobs.get(this.href);
    if (this.hasAttribute("download") && blob) downloads.push({ name: this.getAttribute("download")!, text: "" });
    if (this.hasAttribute("download") && blob) (downloads[downloads.length - 1] as Download & { blob?: Blob }).blob = blob;
  };
});
afterEach(() => {
  URL.createObjectURL = origCreate;
  URL.revokeObjectURL = origRevoke;
  HTMLAnchorElement.prototype.click = origClick;
});

function firstBytes(b: Blob): Promise<number[]> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve([...new Uint8Array(r.result as ArrayBuffer).slice(0, 3)]);
    r.onerror = () => reject(r.error);
    r.readAsArrayBuffer(b);
  });
}

async function last(): Promise<Download> {
  const d = downloads[downloads.length - 1] as Download & { blob?: Blob };
  if (!d?.blob) throw new Error("no download happened");
  d.text = await readBlob(d.blob);
  return d;
}

function loaded(source: string, mutate?: (doc: any) => void): Harness {
  const m = mount("en");
  const doc = JSON.parse(source.startsWith("{") ? source : fixtureText(source));
  doc.schemaVersion = "0.4.0";
  mutate?.(doc);
  loadCatalogText(m.store, JSON.stringify(doc), "test.json");
  if (!m.store.get().loaded) throw new Error(JSON.stringify(m.store.get().importDiagnostics));
  setView(m.store, "check");
  return m;
}
const CAT10 = "10_Katalog_Klein_Gemischt.json";
const CAT20 = "20_Katalog_Vollstaendige_Skalen.json";
const lockIpip = (d: any) => (d.rights.find((r: any) => r.id === "rights_ipip").permissions.electronicDisplay = "unknown");
const lockCodebook = (d: any) => (d.rights.find((r: any) => r.id === "rights_ipip").permissions.redistribution = "unknown");

describe("save project", () => {
  it("downloads the project with references and selection only, and clears the unsaved state", async () => {
    const m = loaded(CAT10);
    toggleItem(m.store, "self_efficacy_08", true);
    toggleItem(m.store, "conscientiousness_01", true);
    expect(m.q("#dirty-badge").textContent).toContain("Unsaved changes");
    click(m.q("#save-project"));
    const d = await last();
    expect(d.name).toBe("school_test_small_1.0.0_project.json");
    const p = JSON.parse(d.text);
    expect(p.documentType).toBe("questionnaireProject");
    expect(p.catalogRef).toEqual({ id: "school_test_small", version: "1.0.0" });
    expect(p.selectedItemIds).toEqual(["extraversion_01", "conscientiousness_01", "extraversion_02", "self_efficacy_08"]);
    expect(d.text).not.toContain("Am the life of the party");
    expect(m.store.get().dirty).toBe(false);
    expect(m.root.querySelector("#dirty-badge")).toBeNull();
    expect(m.q("#notices").textContent).toContain("school_test_small_1.0.0_project.json was created.");
  });

  it("stores school label, notes and target system, and keeps them out of the file name", async () => {
    const m = loaded(CAT10);
    const school = m.q<HTMLInputElement>("#meta-school");
    school.value = "Schule Geheim";
    school.dispatchEvent(new Event("input", { bubbles: true }));
    const notes = m.q<HTMLTextAreaElement>("#meta-notes");
    notes.value = "vertrauliche Notiz";
    notes.dispatchEvent(new Event("input", { bubbles: true }));
    const platform = m.q<HTMLSelectElement>("#meta-platform");
    platform.value = "limesurvey";
    platform.dispatchEvent(new Event("change", { bubbles: true }));
    click(m.q("#save-project"));
    const d = await last();
    const p = JSON.parse(d.text);
    expect([p.schoolLabel, p.internalNotes, p.targetPlatform]).toEqual(["Schule Geheim", "vertrauliche Notiz", "limesurvey"]);
    expect(d.name).not.toMatch(/Geheim|vertraulich/);
    expect(m.q("li[data-platform=limesurvey]").className).toContain("is-target");
  });

  it("typing in a detail field keeps focus and caret", () => {
    const m = loaded(CAT10);
    const school = m.q<HTMLInputElement>("#meta-school");
    school.focus();
    school.value = "Sch";
    school.setSelectionRange(3, 3);
    school.dispatchEvent(new Event("input", { bubbles: true }));
    expect(document.activeElement?.id).toBe("meta-school");
    expect((document.activeElement as HTMLInputElement).value).toBe("Sch");
    expect(m.store.get().dirty).toBe(true);
  });

  it("T27: saving and loading through the file inputs restores the same selection and details", async () => {
    const m = loaded(CAT10);
    toggleItem(m.store, "conscientiousness_02", true);
    m.store.set({ schoolLabel: "Schule A", internalNotes: "N" });
    click(m.q("#save-project"));
    const saved = (await last()).text;
    const before = [...m.store.get().selection].sort();

    const m2 = mount("en");
    loadCatalogText(m2.store, m.store.get().loaded ? JSON.stringify({ ...JSON.parse(fixtureText(CAT10)), schemaVersion: "0.4.0" }) : "", "c.json");
    await chooseFile(m2.q<HTMLInputElement>("#project-file"), "p.json", saved);
    expect([...m2.store.get().selection].sort()).toEqual(before);
    expect(m2.store.get().schoolLabel).toBe("Schule A");
    expect(m2.store.get().internalNotes).toBe("N");
    expect(m2.store.get().dirty).toBe(false);
  });

  it("saving is allowed despite conflicts, which stay visible and are not repaired", async () => {
    const m = loaded(CAT20);
    m.store.set({ selection: new Set([...m.store.get().selection].filter((id) => id !== "conscientiousness_01")) });
    click(m.q("#save-project"));
    const p = JSON.parse((await last()).text);
    expect(p.selectedItemIds).not.toContain("conscientiousness_01");
    expect(p.selectedItemIds).toContain("conscientiousness_02");
    expect(m.q("#notices .banner-warning").textContent).toContain("unresolved conflicts");
  });
});

describe("check report", () => {
  it("contains IDs and findings but no wording, and is recognised as current, then outdated", async () => {
    const m = loaded(CAT10);
    expect(m.q("#report-state").textContent).toContain("No check report has been saved yet.");
    click(m.q("#save-report"));
    const d = await last();
    expect(d.name).toBe("school_test_small_1.0.0_check-report.json");
    const r = JSON.parse(d.text);
    expect(r.reportType).toBe("questionnaireCheckReport");
    expect(r.validity).toBe("valid");
    expect(d.text).not.toContain("Am the life of the party");
    expect(m.q("#report-state").textContent).toContain("matches the current state");

    toggleItem(m.store, "conscientiousness_01", true);
    expect(m.q("#report-state").textContent).toContain("outdated");
    expect(m.q("#report-state").className).toContain("sev-warning");
    click(m.q("#save-report"));
    expect(m.q("#report-state").textContent).toContain("matches the current state");
  });

  it("is outdated after a language or target change as well", () => {
    const m = loaded("30_Katalog_Zweisprachig.json");
    click(m.q("#save-report"));
    m.store.set({ language: "en" });
    expect(m.q("#report-state").textContent).toContain("outdated");
  });

  it("flags a conflicting selection as not a valid questionnaire", async () => {
    const m = loaded(CAT20);
    m.store.set({ selection: new Set([...m.store.get().selection].filter((id) => id !== "conscientiousness_01")) });
    expect(m.root.textContent).toContain("The selection has unresolved conflicts. The report records this");
    click(m.q("#save-report"));
    const r = JSON.parse((await last()).text);
    expect(r.validity).toBe("hasConflicts");
    expect(r.notice).toMatch(/not a valid questionnaire/);
  });
});

describe("codebook", () => {
  it("is created in the chosen language with the draft notice and without school notes by default", async () => {
    const m = loaded("30_Katalog_Zweisprachig.json");
    m.store.set({ schoolLabel: "Schule Geheim", internalNotes: "vertrauliche Notiz" });
    // the interface is English, the file follows the language of the questions (de-CH)
    expect(m.root.textContent).toContain("The codebook carries the notice");
    click(m.q("#save-codebook"));
    const d = await last();
    expect(d.name).toBe("school_test_bilingual_1.0.0_codebook.de-CH.md");
    expect(d.text).toMatch(/^# Codebuch: /);
    expect(d.text).toContain("Entwurf – nicht für produktive Durchführung freigegeben");
    expect(d.text).toContain("Ich bin der Mittelpunkt auf Partys.");
    expect(d.text).not.toMatch(/Geheim|vertrauliche/);
  });

  it("includes school label and notes only after the explicit choice", async () => {
    const m = loaded(CAT10);
    m.store.set({ schoolLabel: "Schule Geheim", internalNotes: "vertrauliche Notiz" });
    const box = m.q<HTMLInputElement>("#codebook-notes");
    expect(box.checked).toBe(false);
    click(box);
    expect(m.store.get().codebookNotes).toBe(true);
    click(m.q("#save-codebook"));
    const d = await last();
    expect(d.text).toContain("Schule Geheim");
    expect(d.text).toContain("vertrauliche Notiz");
  });

  it("withholds the wording of items whose codebook rights are not confirmed, and says so", async () => {
    const m = loaded(CAT10, lockCodebook);
    expect(m.root.textContent).toContain("For 2 items the wording is left out of the codebook");
    click(m.q("#save-codebook"));
    const d = await last();
    expect(d.text).not.toContain("Am the life of the party");
    expect(d.text).toContain("Wording withheld");
    expect(d.text).toContain("extraversion_01");
  });

  it("markdown mime type and no HTML in the output", async () => {
    const m = loaded(exampleText(), (d) => (d.items.find((i: any) => i.id === "demo_01").text.en = "<script>alert(1)</script>"));
    click(m.q("#save-codebook"));
    const d = await last();
    expect(d.text).not.toContain("<script>");
    expect((blobs.get([...blobs.keys()].pop()!) as Blob).type).toContain("text/markdown");
  });
});

describe("rights per action and export overview", () => {
  const row = (m: Harness, action: string) => m.q(`li[data-action=${action}]`);

  it("lists the four actions with their state; a draft catalog blocks the regular export", () => {
    const m = loaded(CAT10);
    expect(row(m, "displayItems").textContent).toContain("possible");
    expect(row(m, "codebookWithTexts").textContent).toContain("possible");
    expect(row(m, "nativeExport").textContent).toContain("blocked");
    expect(row(m, "nativeExport").textContent).toContain("CATALOG_NOT_RELEASED");
    expect(row(m, "devTestExport").textContent).toContain("possible");
  });

  it("a released catalog with confirmed rights allows the regular export in the policy", () => {
    const m = loaded(CAT10, (d) => (d.catalog.status = "released"));
    expect(row(m, "nativeExport").textContent).toContain("possible");
    expect(m.root.textContent).not.toContain("Draft – not released");
  });

  it("locked display rights show up as blocked items", () => {
    const m = loaded(CAT10, lockIpip);
    expect(row(m, "displayItems").textContent).toContain("blocked");
    expect(row(m, "displayItems").textContent).toContain("2 items affected");
    expect(row(m, "displayItems").textContent).toContain("RIGHTS_PERMISSION_UNKNOWN");
  });

  it("a withdrawn catalog is clearly marked and blocks both exports", () => {
    const m = loaded(CAT10, (d) => (d.catalog.status = "withdrawn"));
    expect(m.q(".banner-error").textContent).toContain("Withdrawn");
    expect(row(m, "nativeExport").textContent).toContain("CATALOG_WITHDRAWN");
    expect(row(m, "devTestExport").textContent).toContain("blocked");
    expect(m.root.textContent).toContain("withdrawal notice");
  });

  it("without confirmed rights no export is offered, the reason is shown and every target has a labelled adapter, prototype or table", () => {
    const m = loaded(CAT10);
    expect(m.q<HTMLButtonElement>("#native-export-limesurvey").disabled).toBe(true);
    expect(m.q<HTMLButtonElement>("#test-export-limesurvey").disabled).toBe(true);
    expect(m.q("#export-why-limesurvey").textContent).toContain("CATALOG_NOT_RELEASED");
    expect(m.qa("ul.adapters li").map((li) => li.textContent)).toEqual([
      "LimeSurvey: adapter available, untested on a real instance",
      "REDCap: prototype, unverified",
      "Qualtrics: adapter available, untested on a real instance",
      "SurveyMonkey (Bauplan): prototype, unverified",
      "Google Forms (Apps Script): prototype, unverified",
      "Unipark (Bauplan): prototype, unverified",
      "Neutrale Tabelle (CSV): table for people, not an import",
    ]);
    expect(m.q(".out-block .banner-info").textContent).toContain("None of this has been tested on a real instance");
    expect(m.q("#native-reason-limesurvey").textContent).toContain("does not bypass any rights prohibition");
  });
});

describe("export for LimeSurvey", () => {
  it("a draft catalog offers only the labelled test export, which downloads a file with BOM, TEST label and the mapping", async () => {
    const m = loaded(exampleText());
    expect(m.q<HTMLButtonElement>("#native-export-limesurvey").disabled).toBe(true);
    expect(m.q<HTMLButtonElement>("#test-export-limesurvey").disabled).toBe(false);
    expect(m.q("#export-why-limesurvey").textContent).toContain("CATALOG_NOT_RELEASED");
    click(m.q("#test-export-limesurvey"));
    const d = await last();
    expect(d.name).toMatch(/_limesurvey_TEST\.txt$/);
    expect(await firstBytes((downloads[downloads.length - 1] as Download & { blob: Blob }).blob)).toEqual([0xef, 0xbb, 0xbf]); // UTF-8 byte order mark
    expect(d.text).toContain("surveyls_title");
    expect(d.text).toContain("TEST");
    expect(m.q("#notices").textContent).toContain("was created");
    expect(m.q("#mapping-report-limesurvey").textContent).toContain("response.slider");
    expect(m.q("#mapping-report-limesurvey").textContent).toContain("Unverified assumptions");
  });

  it("a released catalog offers the regular export", async () => {
    const m = loaded(exampleText(), (d) => (d.catalog.status = "released"));
    expect(m.q<HTMLButtonElement>("#native-export-limesurvey").disabled).toBe(false);
    expect(m.root.querySelector("#export-why-limesurvey")).toBeNull();
    click(m.q("#native-export-limesurvey"));
    const d = await last();
    expect(d.name).toMatch(/_limesurvey\.txt$/);
    expect(d.text).not.toContain("[TEST");
  });

  it("Qualtrics: the rich example cannot be exported because the format has no slider and no display logic, and says so", () => {
    const m = loaded(exampleText());
    expect(m.q<HTMLButtonElement>("#test-export-qualtrics").disabled).toBe(true);
    const why = m.q("#export-why-qualtrics").textContent as string;
    expect(why).toContain("EXPORT_RESPONSE_UNSUPPORTED");
    expect(why).toContain("EXPORT_CONDITION_UNSUPPORTED");
  });

  it("Qualtrics: without slider and conditions the test export downloads a TXT in the Advanced Format", async () => {
    const m = loaded(exampleText(), (d) => {
      d.items = d.items.filter((i: any) => i.id !== "mood_slider");
      for (const s of d.questionnaire.sections) s.itemRefs = s.itemRefs.filter((x: string) => x !== "mood_slider");
      for (const mod of d.modules) mod.itemRefs = mod.itemRefs.filter((x: string) => x !== "mood_slider");
      for (const i of d.items) delete i.visibleWhen;
    });
    expect(m.q<HTMLButtonElement>("#test-export-qualtrics").disabled).toBe(false);
    click(m.q("#test-export-qualtrics"));
    const d = await last();
    expect(d.name).toMatch(/_qualtrics_TEST\.txt$/);
    expect(d.text.startsWith("[[AdvancedFormat]]")).toBe(true);
  });

  it("the neutral table and the build plans download for the rich example, REDCap and Google Forms explain why they cannot", async () => {
    const m = loaded(exampleText());
    for (const id of ["rank_topics", "contact_email", "wants_help", "mood_slider"]) toggleItem(m.store, id, true);
    expect(m.q<HTMLButtonElement>("#test-export-csv").disabled).toBe(false);
    expect(m.q<HTMLButtonElement>("#test-export-unipark").disabled).toBe(false);
    expect(m.q<HTMLButtonElement>("#test-export-surveymonkey").disabled).toBe(false);
    expect(m.q<HTMLButtonElement>("#test-export-redcap").disabled).toBe(true);
    expect(m.q("#export-why-redcap").textContent).toContain("EXPORT_RESPONSE_UNSUPPORTED");
    expect(m.q<HTMLButtonElement>("#test-export-googleForms").disabled).toBe(true);
    expect(m.q("#export-why-googleForms").textContent).toContain("EXPORT_CONDITION_UNSUPPORTED");
    click(m.q("#test-export-csv"));
    expect((await last()).name).toMatch(/_csv_TEST_table\.csv$/);
    click(m.q("#test-export-unipark"));
    const plan = await last();
    expect(plan.name).toMatch(/_unipark_TEST_bauplan\.md$/);
    expect(plan.text).toContain("# Bauplan für Unipark");
  });

  it("an option code LimeSurvey cannot take blocks the export and names the remedy", () => {
    const m = loaded(exampleText(), (d) => {
      d.catalog.status = "released";
      delete d.optionSets[0].options.find((o: any) => o.code === "refused").exportHints;
    });
    expect(m.q<HTMLButtonElement>("#native-export-limesurvey").disabled).toBe(true);
    expect(m.q("#export-why-limesurvey").textContent).toContain("EXPORT_OPTION_CODE_INVALID");
  });
});

describe("unsaved changes", () => {
  it("the badge appears after a change and everything that changes the state marks it", () => {
    const m = loaded(CAT10);
    expect(m.root.querySelector("#dirty-badge")).toBeNull();
    toggleItem(m.store, "conscientiousness_01", true);
    expect(m.q("#dirty-badge").textContent).toContain("Unsaved changes");
  });
});
