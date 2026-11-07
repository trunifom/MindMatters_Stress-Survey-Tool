// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { click, exampleText, fixtureText, Harness, mount } from "./helpers";
import { loadCatalogText, setFilter } from "../../../src/ui/state";
import { orderedSelection } from "../../../src/model/selection";

function loaded(fixture: string, mutate?: (doc: any) => void, lang: "en" | "de" = "en"): Harness {
  const m = mount(lang);
  const doc = JSON.parse(fixture.startsWith("{") ? fixture : fixtureText(fixture));
  doc.schemaVersion = "0.4.0";
  mutate?.(doc);
  loadCatalogText(m.store, JSON.stringify(doc), "test.json");
  if (!m.store.get().loaded) throw new Error("catalog did not load: " + JSON.stringify(m.store.get().importDiagnostics));
  return m;
}
const cb = (m: Harness, id: string) => m.q<HTMLInputElement>(`#item-${id}`);
const rowIds = (m: Harness) => m.qa("li.item").map((li) => li.getAttribute("data-item"));
const CAT10 = "10_Katalog_Klein_Gemischt.json";
const CAT20 = "20_Katalog_Vollstaendige_Skalen.json";
const CAT30 = "30_Katalog_Zweisprachig.json";
const CAT40 = "40_Katalog_Antworttypen_Logik.json";

describe("selection in the list (T09, T10, T11, T16)", () => {
  it("mandatory items are checked and locked with the standard-scope label", () => {
    const m = loaded(CAT10);
    for (const id of ["extraversion_01", "extraversion_02"]) {
      expect(cb(m, id).checked).toBe(true);
      expect(cb(m, id).disabled).toBe(true);
    }
    expect(cb(m, "extraversion_01").closest("li")!.textContent).toContain("Standard scope – cannot be deselected");
    expect(cb(m, "conscientiousness_01").disabled).toBe(false);
    expect(cb(m, "conscientiousness_01").checked).toBe(false);
  });

  it("T11: a mandatory module locks all members although the item flags are false", () => {
    const m = loaded(CAT20);
    const ext = m.qa<HTMLInputElement>("li.item input").filter((i) => i.id.startsWith("item-extraversion_"));
    expect(ext).toHaveLength(10);
    expect(ext.every((i) => i.checked && i.disabled)).toBe(true);
    expect(m.root.textContent).toContain("Mandatory module");
  });

  it("clicking an optional item selects it, marks the state dirty and keeps focus", () => {
    const m = loaded(CAT10);
    const box = cb(m, "conscientiousness_01");
    box.focus();
    click(box);
    expect(m.store.get().selection.has("conscientiousness_01")).toBe(true);
    expect(m.store.get().dirty).toBe(true);
    expect(cb(m, "conscientiousness_01").checked).toBe(true);
    expect(document.activeElement?.id).toBe("item-conscientiousness_01");
    click(cb(m, "conscientiousness_01"));
    expect(m.store.get().selection.has("conscientiousness_01")).toBe(false);
  });

  it("the module buttons select and deselect all members, mandatory ones stay", () => {
    const m = loaded(CAT10);
    click(m.q("[data-focus=mod-all-module_extraversion]"));
    expect(m.qa<HTMLInputElement>("input[id^=item-extraversion_]").every((i) => i.checked)).toBe(true);
    click(m.q("[data-focus=mod-none-module_extraversion]"));
    expect([...m.store.get().selection].sort()).toEqual(["extraversion_01", "extraversion_02"]);
  });

  it("T16: members of an optional allOrNothing module switch together", () => {
    const m = loaded(CAT20);
    click(cb(m, "conscientiousness_04"));
    expect(m.qa<HTMLInputElement>("input[id^=item-conscientiousness_]").some((i) => i.checked)).toBe(false);
    click(cb(m, "conscientiousness_04"));
    expect(m.qa<HTMLInputElement>("input[id^=item-conscientiousness_]").every((i) => i.checked)).toBe(true);
    expect(m.root.textContent).toContain("can only be selected completely");
  });

  it("T10: deselect all keeps the whole mandatory set, also while a filter is active", () => {
    const m = loaded(CAT20);
    setFilter(m.store, { scope: "optional", query: "pay attention" });
    click(m.q("[data-focus=deselect-all]"));
    expect(m.store.get().selection.size).toBe(10);
    expect([...m.store.get().selection].every((id) => id.startsWith("extraversion_"))).toBe(true);
  });

  it("restore brings back the default selection", () => {
    const m = loaded(CAT20);
    click(m.q("[data-focus=deselect-all]"));
    click(m.q("[data-focus=restore]"));
    expect(m.store.get().selection.size).toBe(30);
  });

  it("the selection lives in the state: a re-render never invents or loses checks", () => {
    const m = loaded(CAT10);
    click(cb(m, "self_efficacy_02"));
    m.store.set({ language: "en" }); // forces a re-render
    expect(cb(m, "self_efficacy_02").checked).toBe(true);
    expect(m.qa<HTMLInputElement>("li.item input").filter((i) => i.checked).map((i) => i.id).sort()).toEqual(
      [...m.store.get().selection].map((id) => `item-${id}`).sort(),
    );
  });
});

describe("search and filters (T20)", () => {
  it("do not change the selection or its output order", () => {
    const m = loaded(CAT10);
    click(cb(m, "self_efficacy_02"));
    const before = [...m.store.get().selection];
    const loadedCat = m.store.get().loaded!.catalog;
    const orderBefore = orderedSelection(loadedCat, m.store.get().selection);
    for (const patch of [{ query: "life of the party" }, { scope: "selected" as const }, { scope: "optional" as const }, { moduleId: "module_conscientiousness" }, { query: "zzz-no-match" }]) {
      setFilter(m.store, patch);
    }
    expect([...m.store.get().selection]).toEqual(before);
    expect(orderedSelection(loadedCat, m.store.get().selection)).toEqual(orderBefore);
  });

  it("text search shows only matching items and counts them", () => {
    const m = loaded(CAT10);
    const input = m.q<HTMLInputElement>("#filter-query");
    input.value = "life of the party";
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(rowIds(m)).toEqual(["extraversion_01"]);
    expect(m.root.textContent).toContain("1 of 12 items shown");
  });

  it("is case-insensitive and keeps focus and caret while typing", () => {
    const m = loaded(CAT10);
    const input = m.q<HTMLInputElement>("#filter-query");
    input.focus();
    input.value = "LIFE of";
    input.setSelectionRange(3, 3);
    input.dispatchEvent(new Event("input", { bubbles: true }));
    expect(rowIds(m)).toEqual(["extraversion_01"]);
    const after = m.q<HTMLInputElement>("#filter-query");
    expect(document.activeElement).toBe(after);
    expect(after.selectionStart).toBe(3);
    expect(after.value).toBe("LIFE of");
  });

  it("finds items by dimension, scale, instrument and module names", () => {
    const m = loaded(CAT10);
    for (const [q, n] of [["Conscientiousness", 4], ["Self-Efficacy", 4], ["software-test excerpt", 12], ["extraversion_08", 1]] as const) {
      setFilter(m.store, { query: q });
      expect(rowIds(m).length, q).toBe(n);
    }
  });

  it("scope filters: selected, mandatory, optional", () => {
    const m = loaded(CAT10);
    setFilter(m.store, { scope: "selected" });
    expect(rowIds(m).sort()).toEqual(["extraversion_01", "extraversion_02"]);
    setFilter(m.store, { scope: "mandatory" });
    expect(rowIds(m).sort()).toEqual(["extraversion_01", "extraversion_02"]);
    setFilter(m.store, { scope: "optional" });
    expect(rowIds(m)).toHaveLength(10);
  });

  it("module and dimension filters", () => {
    const m = loaded(CAT10);
    setFilter(m.store, { moduleId: "module_self_efficacy" });
    expect(rowIds(m)).toHaveLength(4);
    setFilter(m.store, { moduleId: "", constructId: "conscientiousness" });
    expect(rowIds(m)).toHaveLength(4);
    expect(m.q("select#filter-construct")).toBeTruthy();
  });

  it("a dimension filter includes sub-dimensions", () => {
    const m = loaded(CAT10, (d) => {
      d.constructs.push({ id: "personality", label: { en: "Personality" }, description: { en: "root" } });
      d.constructs.find((k: any) => k.id === "extraversion").parentRef = "personality";
      d.constructs.find((k: any) => k.id === "conscientiousness").parentRef = "personality";
    });
    setFilter(m.store, { constructId: "personality" });
    expect(rowIds(m)).toHaveLength(8);
  });

  it("shows a message when nothing matches", () => {
    const m = loaded(CAT10);
    setFilter(m.store, { query: "zzz-no-match" });
    expect(m.qa("[role=status]").some((e) => e.textContent === "No item matches the filters.")).toBe(true);
    expect(m.root.textContent).toContain("No item matches the filters.");
  });
});

describe("locked texts (T36)", () => {
  const lock = (d: any) => (d.rights.find((r: any) => r.id === "rights_ipip").permissions.electronicDisplay = "unknown");
  it("shows ID and lock note instead of the wording, nowhere in the page", () => {
    const m = loaded(CAT10, lock);
    expect(m.root.textContent).not.toContain("Am the life of the party");
    expect(m.root.textContent).not.toContain("Feel comfortable around people");
    expect(m.q("li[data-item=extraversion_01] label.locked").textContent).toContain("Text locked: display rights not confirmed (ID extraversion_01)");
  });
  it("search cannot reveal locked wording, but IDs still work", () => {
    const m = loaded(CAT10, lock);
    setFilter(m.store, { query: "life of the party" });
    expect(rowIds(m)).toEqual([]);
    setFilter(m.store, { query: "extraversion_01" });
    expect(rowIds(m)).toEqual(["extraversion_01"]);
  });
  it("the catalog is still usable: the locked item can be selected and the page shows the rights status", () => {
    const m = loaded(CAT10, lock);
    expect(m.store.get().loaded!.status.rights).toBe("warning");
    expect(m.root.textContent).toContain("Rights and release: with notes");
    click(cb(m, "conscientiousness_01"));
    expect(m.store.get().selection.has("conscientiousness_01")).toBe(true);
  });
});

describe("selection hints", () => {
  it("a partial wholeScale is an error hint, a partial partialWithWarning a note", () => {
    const m20 = loaded(CAT20);
    const store = m20.store;
    store.set({ selection: new Set([...store.get().selection].filter((id) => id !== "conscientiousness_01")) });
    expect(m20.q(".hints").textContent).toContain("SCALE_PARTIAL_NOT_ALLOWED");
    const m10 = loaded(CAT10);
    click(cb(m10, "conscientiousness_01"));
    expect(m10.q(".hints").textContent).toContain("PARTIAL_SCALE");
    expect(m10.q(".hints").textContent).toContain("original scoring");
  });
  it("no hint panel for a clean selection", () => {
    expect(loaded(CAT20).root.querySelector(".hints")).toBeNull();
  });
});

describe("text blocks and answer types", () => {
  it("renders the title and notice items of the rich example as selectable text blocks", () => {
    const m = loaded(exampleText());
    const note = m.q("li[data-item=anon_note]");
    expect(note.textContent).toContain("voluntary and all answers are anonymous");
    expect(note.textContent).toContain("Text block (Notice)");
    expect(m.q("li[data-item=intro_note]").textContent).toContain("Text block (Title)");
    expect(m.q<HTMLInputElement>("#item-anon_note").disabled).toBe(true); // mandatory
  });
  it("shows type and requirement badges for questions", () => {
    const m = loaded(CAT40);
    const row = m.q("li[data-item=age_test]").textContent!;
    expect(row).toContain("integer");
    expect(row).toContain("Answer required");
    expect(m.q("li[data-item=other_test]").textContent).toContain("Only if: areas_test ∋ other");
  });
});

describe("language of the questions (T26)", () => {
  it("switches the texts and marks missing translations instead of mixing silently", () => {
    const m = loaded(CAT30, (d) => delete d.items.find((i: any) => i.id === "extraversion_02").text["de-CH"]);
    expect(m.store.get().language).toBe("de-CH");
    expect(m.q("li[data-item=extraversion_01]").textContent).toContain("Ich bin der Mittelpunkt auf Partys.");
    expect(m.q("li[data-item=extraversion_02]").textContent).toContain("Feel comfortable around people.");
    expect(m.q("li[data-item=extraversion_02]").textContent).toContain("Text in en");
    const sel = m.q<HTMLSelectElement>("select[data-focus=language]");
    sel.value = "en";
    sel.dispatchEvent(new Event("change", { bubbles: true }));
    expect(m.q("li[data-item=extraversion_01]").textContent).toContain("Am the life of the party.");
    expect(m.q("li[data-item=extraversion_02]").textContent).not.toContain("Text in en");
  });
});

describe("safety of catalog text (T41)", () => {
  it("script and image tags in item texts are shown as text", () => {
    const m = loaded(exampleText(), (d) => {
      d.items.find((i: any) => i.id === "demo_01").text.en = "<img src=x onerror=alert(1)><script>alert(1)</script>";
    });
    expect(m.root.querySelector("img")).toBeNull();
    expect(m.root.querySelector("script")).toBeNull();
    expect(m.q("li[data-item=demo_01] label").textContent).toBe("<img src=x onerror=alert(1)><script>alert(1)</script>");
  });
});

describe("information dialog (A09)", () => {
  const open = (m: Harness, id: string) => click(m.q(`[data-focus=info-item-${id}]`));

  it("opens as a modal dialog, moves focus inside and hides the page from assistive technology", () => {
    const m = loaded(CAT10);
    m.q(`[data-focus=info-item-extraversion_01]`).focus();
    open(m, "extraversion_01");
    const dlg = m.q("[role=dialog]");
    expect(dlg.getAttribute("aria-modal")).toBe("true");
    expect(dlg.getAttribute("aria-labelledby")).toBe("info-title");
    expect(m.q("#info-title").textContent).toContain("extraversion_01");
    expect(document.activeElement?.id).toBe("info-close");
    expect(m.q(".app-bg").getAttribute("aria-hidden")).toBe("true");
  });

  it("shows the sections in the specified order", () => {
    const m = loaded(CAT10);
    open(m, "extraversion_01");
    const titles = m.qa(".modal h3").map((x) => x.textContent);
    expect(titles).toEqual([
      "Questions and modules", // the wording
      "Short description and measurement goal",
      "Dimensions and scales",
      "Source, instrument form, original number",
      "Target population and perspective",
      "Reference period",
      "Instruction and answer format",
      "Limits of selection and scoring",
      "Translation status",
      "Rights",
      "Export particulars",
    ]);
  });

  it("shows the wording, source, original number and dimension", () => {
    const m = loaded(CAT10);
    open(m, "extraversion_01");
    const text = m.q(".modal").textContent!;
    expect(text).toContain("Am the life of the party.");
    expect(text).toContain("IPIP Big-Five Factor Markers");
    expect(text).toContain("Source-key position 1; not universal questionnaire number");
    expect(text).toContain("Extraversion");
    expect(text).toContain("Four-item software-test excerpt, not a validated short form");
    const link = m.q<HTMLAnchorElement>(".modal a");
    expect(link.href).toContain("ipip.ori.org");
    expect(link.rel).toBe("noopener noreferrer");
  });

  it("says 'not documented' for facts the catalog does not carry and never guesses", () => {
    const m = loaded(CAT10);
    open(m, "extraversion_01");
    const dd = (label: string) => m.qa(".info-row").find((r) => r.querySelector("dt")!.textContent === label)!.querySelector("dd")!.textContent;
    expect(dd("Target population")).toBe("not documented");
    expect(dd("Respondent role")).toBe("self-report"); // documented in the instrument
    expect(dd("Age")).toBe("not documented");
    expect(dd("Reference period")).toBe("not documented");
    expect(dd("Status")).toBe("not documented"); // translation status
  });

  it("explains the effective rights and where they come from", () => {
    const m = loaded(CAT10);
    open(m, "extraversion_01");
    const text = m.q(".modal").textContent!;
    expect(text).toContain("from the instrument");
    expect(text).toContain("reviewed");
    expect(text).toContain("Electronic display: permitted");
    expect(text).toContain("not a legal judgement by the tool");
  });

  it("reference period is taken from the item first, then the instrument, with its origin", () => {
    const m = loaded(CAT10, (d) => {
      d.instruments[0].referencePeriod = { kind: "relative", amount: 7, unit: "day" };
      d.items.find((i: any) => i.id === "extraversion_02").referencePeriod = { kind: "current" };
    });
    open(m, "extraversion_01");
    expect(m.q(".modal").textContent).toContain("last 7 day(s) (from the instrument)");
    click(m.q("#info-close"));
    open(m, "extraversion_02");
    expect(m.q(".modal").textContent).toContain("current (from the item)");
  });

  it("Escape closes and returns focus to the info button", () => {
    const m = loaded(CAT10);
    m.q(`[data-focus=info-item-extraversion_01]`).focus();
    open(m, "extraversion_01");
    document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape", bubbles: true }));
    expect(m.root.querySelector("[role=dialog]")).toBeNull();
    expect(document.activeElement?.getAttribute("data-focus")).toBe("info-item-extraversion_01");
  });

  it("the close button and a click on the backdrop close it", () => {
    const m = loaded(CAT10);
    open(m, "extraversion_01");
    click(m.q("#info-close"));
    expect(m.store.get().info).toBeUndefined();
    open(m, "extraversion_01");
    click(m.q(".modal-backdrop"));
    expect(m.store.get().info).toBeUndefined();
  });

  it("keeps Tab inside the dialog", () => {
    const m = loaded(CAT10);
    open(m, "extraversion_01");
    const focusables = m.qa<HTMLElement>(".modal a[href], .modal button");
    const last = focusables[focusables.length - 1]!;
    last.focus();
    const ev = new KeyboardEvent("keydown", { key: "Tab", bubbles: true, cancelable: true });
    document.dispatchEvent(ev);
    expect(ev.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(focusables[0]);
    const back = new KeyboardEvent("keydown", { key: "Tab", shiftKey: true, bubbles: true, cancelable: true });
    document.dispatchEvent(back);
    expect(document.activeElement).toBe(last);
  });

  it("a locked item shows only technical details, no wording and no answer labels", () => {
    const m = loaded(CAT10, (d) => (d.rights.find((r: any) => r.id === "rights_ipip").permissions.electronicDisplay = "unknown"));
    open(m, "extraversion_01");
    const text = m.q(".modal").textContent!;
    expect(text).toContain("The texts of this item are locked");
    expect(text).not.toContain("Am the life of the party");
    expect(text).not.toContain("Very Inaccurate");
    expect(text).toContain("extraversion_01");
    expect(text).toContain("Electronic display: unknown");
    expect(text).toContain("singleChoice");
  });

  it("module info lists members and the selection mode", () => {
    const m = loaded(CAT20);
    click(m.q("[data-focus=info-module-module_conscientiousness]"));
    const text = m.q(".modal").textContent!;
    expect(text).toContain("complete only");
    expect(text).toContain("conscientiousness_01");
    expect(text).toContain("Am always prepared"); // member wording when display is allowed
  });

  it("documents scoring availability against the current selection", () => {
    const m = loaded(CAT20);
    open(m, "conscientiousness_01");
    expect(m.q(".modal").textContent).toContain("score_conscientiousness: available, all items selected");
    click(m.q("#info-close"));
    click(m.q("[data-focus=mod-none-module_conscientiousness]"));
    open(m, "conscientiousness_01");
    expect(m.q(".modal").textContent).toContain("score_conscientiousness: not available, 10 items missing");
  });

  it("a catalog without any documentation still opens a complete dialog", () => {
    const m = loaded(CAT40);
    open(m, "age_test");
    expect(m.qa(".modal h3")).toHaveLength(11);
    expect(m.q(".modal").textContent).toContain("min 10");
    expect(m.q(".modal").textContent).toContain("not documented");
  });

  it("sensitive items show their sensitivity in the export particulars", () => {
    const m = loaded(exampleText());
    open(m, "demo_02");
    expect(m.q(".modal").textContent).toContain("sensitive");
    expect(m.q(".modal").textContent).toContain("negative");
  });
});
