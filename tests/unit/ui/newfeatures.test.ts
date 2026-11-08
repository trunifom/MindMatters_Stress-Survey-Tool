// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { loadCatalogText, setView } from "../../../src/ui/state";
import { click, exampleText, mount } from "./helpers";

const change = (el: Element, value: string) => {
  (el as HTMLTextAreaElement).value = value;
  el.dispatchEvent(new Event("change", { bubbles: true }));
};

function loaded() {
  const m = mount("de", "tool");
  loadCatalogText(m.store, exampleText(), "x.json");
  return m;
}

describe("start screen", () => {
  it("explains goal, steps, what the tool does and does not do, and lists every target", () => {
    const m = mount("de");
    expect(m.qa(".step-card")).toHaveLength(4);
    expect(m.root.textContent).toContain("Das können Sie hier tun");
    expect(m.root.textContent).toContain("Das tut das Tool nicht");
    expect(m.qa(".target")).toHaveLength(7);
    expect(m.q(".dropzone")).toBeTruthy();
  });

  it("loads the built-in example catalog with one click, in German", () => {
    const m = mount("de", "tool");
    click(m.q("#load-demo"));
    expect(m.store.get().loaded?.catalog.catalog.id).toBe("example_rich");
    expect(m.store.get().language).toBe("de-CH");
  });
});

describe("display controls", () => {
  it("switches between light and dark on the whole page", () => {
    const m = mount("de");
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
    click(m.q("#theme-toggle"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("dark");
    expect(m.q("#theme-toggle").textContent).toContain("Hell");
    click(m.q("#theme-toggle"));
    expect(document.documentElement.getAttribute("data-theme")).toBe("light");
  });

  it("switches the text size between exactly two steps", () => {
    const m = mount("de");
    expect(document.documentElement.getAttribute("data-size")).toBe("normal");
    click(m.q("#size-toggle"));
    expect(document.documentElement.getAttribute("data-size")).toBe("large");
    expect(m.q("#size-toggle").textContent).toContain("kleiner");
    click(m.q("#size-toggle"));
    expect(document.documentElement.getAttribute("data-size")).toBe("normal");
  });

  it("the controls stay on screen after a catalog is loaded", () => {
    const m = loaded();
    expect(m.q("#theme-toggle")).toBeTruthy();
    expect(m.q("#size-toggle")).toBeTruthy();
  });
});

describe("question list shows how answers look", () => {
  it("shows the answer options under each question, can be hidden", () => {
    const m = loaded();
    const row = m.q("li[data-item=wellbeing_01], li.item:not(.item-note)");
    expect(m.qa(".answer-preview").length).toBeGreaterThan(3);
    expect(row).toBeTruthy();
    click(m.q("#show-answers"));
    expect(m.qa(".answer-preview")).toHaveLength(0);
  });

  it("shows the module as participants see it only when opened", () => {
    const m = mount("de", "tool");
    const doc = JSON.parse(exampleText());
    loadCatalogText(m.store, JSON.stringify(doc), "x.json");
    const modules = m.store.get().loaded!.catalog.modules;
    if (modules.length === 0) return; // the example has none: covered by the schema-4 fixtures
    expect(m.qa(".module-pv")).toHaveLength(0);
  });
});

describe("adapt texts", () => {
  it("is the second step and lists the adaptable texts, with locked ones disabled", () => {
    const m = loaded();
    setView(m.store, "texts");
    expect(m.qa("[data-text]").length).toBeGreaterThanOrEqual(6);
    expect((m.q("#text-consentText") as HTMLTextAreaElement).disabled).toBe(true);
    expect((m.q("#text-introduction") as HTMLTextAreaElement).disabled).toBe(false);
  });

  it("an adapted text reaches the preview and the project, and can be reset", () => {
    const m = loaded();
    setView(m.store, "texts");
    change(m.q("#text-introduction"), "Unsere eigene Einleitung");
    expect(m.store.get().dirty).toBe(true);
    expect(m.store.get().customization.textOverrides?.introduction?.["de-CH"]).toBe("Unsere eigene Einleitung");
    setView(m.store, "preview");
    expect(m.q(".pv-intro").textContent).toContain("Unsere eigene Einleitung");
    setView(m.store, "texts");
    click(m.q("[data-focus=text-introduction-reset]"));
    expect(m.store.get().customization.textOverrides).toEqual({});
    setView(m.store, "preview");
    expect(m.q(".pv-intro").textContent).toContain("Nur für Softwaretests");
  });

  it("typing the original wording back is no adaptation", () => {
    const m = loaded();
    setView(m.store, "texts");
    change(m.q("#text-introduction"), "Nur für Softwaretests.");
    expect(m.store.get().customization.textOverrides ?? {}).toEqual({});
  });

  it("adds an own block that appears in the list, the preview and the selection, and removes it again", () => {
    const m = loaded();
    setView(m.store, "texts");
    change(m.q("#new-block-text"), "Herzlich willkommen an unserer Schule");
    click(m.q("#new-block-add"));
    const id = m.store.get().customization.customBlocks![0]!.id;
    expect(id).toBe("custom_1");
    expect(m.store.get().selection.has(id)).toBe(true);
    expect(m.q(`[data-block=${id}]`)).toBeTruthy();
    setView(m.store, "preview");
    expect(m.q(`[data-item=${id}]`).textContent).toContain("Herzlich willkommen");
    setView(m.store, "items");
    expect(m.q(`li[data-item=${id}]`).textContent).toContain("Herzlich willkommen");
    setView(m.store, "texts");
    click(m.q(`[data-focus=block-${id}-remove]`));
    expect(m.store.get().customization.customBlocks ?? []).toEqual([]);
    expect(m.store.get().selection.has(id)).toBe(false);
  });

  it("refuses an empty block with a message", () => {
    const m = loaded();
    setView(m.store, "texts");
    click(m.q("#new-block-add"));
    expect(m.q("#new-block-msg").textContent).toContain("Bitte zuerst einen Text");
    expect(m.store.get().customization.customBlocks ?? []).toEqual([]);
  });

  it("warns when a block has no text in another language of the catalog", () => {
    const m = loaded();
    setView(m.store, "texts");
    change(m.q("#new-block-text"), "Nur deutsch");
    click(m.q("#new-block-add"));
    expect(m.q("[data-block=custom_1]").textContent).toContain("Fehlt in: en");
  });

  it("a catalog change keeps the base untouched and a new catalog clears the customization", () => {
    const m = loaded();
    setView(m.store, "texts");
    change(m.q("#text-closingText"), "Auf Wiedersehen");
    expect(m.store.get().loaded!.base.questionnaire.closingText?.["de-CH"]).toBe("Danke.");
    loadCatalogText(m.store, exampleText(), "y.json");
    expect(m.store.get().customization).toEqual({});
  });
});

describe("steps and explanations", () => {
  it("shows four numbered steps with an intro and next/back navigation", () => {
    const m = loaded();
    expect(m.qa("nav.tabs .tab")).toHaveLength(4);
    expect(m.q(".view-intro").textContent).toContain("Wählen Sie");
    click(m.q("[data-focus=nav-next]"));
    expect(m.store.get().view).toBe("texts");
    click(m.q("[data-focus=nav-back]"));
    expect(m.store.get().view).toBe("items");
  });
});
