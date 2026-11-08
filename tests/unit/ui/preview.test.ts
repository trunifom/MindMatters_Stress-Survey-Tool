// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { click, exampleText, fixtureText, Harness, mount } from "./helpers";
import { loadCatalogText, setView, setLanguage, toggleItem } from "../../../src/ui/state";

function loaded(source: string, mutate?: (doc: any) => void): Harness {
  const m = mount("en");
  const doc = JSON.parse(source.startsWith("{") ? source : fixtureText(source));
  doc.schemaVersion = "0.4.0";
  mutate?.(doc);
  loadCatalogText(m.store, JSON.stringify(doc), "test.json");
  if (!m.store.get().loaded) throw new Error(JSON.stringify(m.store.get().importDiagnostics));
  setView(m.store, "preview");
  return m;
}
const ids = (m: Harness) => m.qa(".pv [data-item]").map((e) => e.getAttribute("data-item"));
const CAT10 = "10_Katalog_Klein_Gemischt.json";
const CAT40 = "40_Katalog_Antworttypen_Logik.json";

describe("preview: content and order (A10)", () => {
  it("shows the selected items in questionnaire order, not in click order", () => {
    const m = loaded(CAT10);
    toggleItem(m.store, "self_efficacy_08", true);
    toggleItem(m.store, "conscientiousness_01", true);
    expect(ids(m)).toEqual(["extraversion_01", "conscientiousness_01", "extraversion_02", "self_efficacy_08"]);
  });

  it("leaves out unselected items and says so when nothing is selected", () => {
    const m = loaded(CAT10);
    expect(ids(m)).toEqual(["extraversion_01", "extraversion_02"]);
    expect(m.root.querySelector("[data-item=conscientiousness_01]")).toBeNull();
    m.store.set({ selection: new Set() });
    expect(ids(m)).toEqual([]);
    expect(m.root.textContent).toContain("No item is selected.");
  });

  it("an empty section disappears together with its title and instruction", () => {
    const m = loaded(CAT40, (d) => (d.questionnaire.sections[1].instruction = { en: "OWN-SECTION-INSTRUCTION" }));
    expect(m.root.textContent).toContain("OWN-SECTION-INSTRUCTION");
    m.store.set({ selection: new Set(["extraversion_01", "extraversion_02"]) });
    expect(m.root.textContent).not.toContain("OWN-SECTION-INSTRUCTION");
    expect(m.root.textContent).not.toContain("Own response formats");
    expect(m.root.textContent).toContain("Interleaved source items");
  });

  it("shows introduction, consent, privacy, help resources and closing text from the catalog", () => {
    const m = loaded(exampleText());
    const text = m.q(".pv").textContent!;
    for (const x of ["Rich example questionnaire", "Software test only.", "Taking part is voluntary", "Parents or guardians were informed", "No names are stored", "school counselling service", "Thank you."]) {
      expect(text, x).toContain(x);
    }
    expect(m.q("[aria-label=Consent] h3").textContent).toBe("Consent");
  });

  it("states that nothing is collected and that the target system may look different", () => {
    const m = loaded(CAT10);
    expect(m.q(".banner-info").textContent).toContain("no answers are collected or stored");
    expect(m.q(".banner-info").textContent).toContain("may differ in the target system");
  });
});

describe("preview: text blocks (title, explanation, anonymity)", () => {
  it("renders title, notice and list as proper elements, never as HTML", () => {
    const m = loaded(exampleText());
    expect(m.q("[data-item=intro_note] h3.pv-note-title").textContent).toBe("How do you feel at school?");
    const notice = m.q("[data-item=anon_note]");
    expect(notice.getAttribute("role")).toBe("note");
    expect(notice.textContent).toContain("voluntary and all answers are anonymous");
    expect(notice.querySelectorAll("ul li")).toHaveLength(3);
    expect(notice.querySelector("li")!.textContent).toBe("Nobody will see your name.");
  });

  it("subtitle and plain text styles", () => {
    const m = loaded(exampleText(), (d) => {
      d.items.find((i: any) => i.id === "anon_note").response.style = "subtitle";
      d.items.find((i: any) => i.id === "intro_note").response.style = "text";
    });
    expect(m.root.querySelector("[data-item=anon_note] h4.pv-note-subtitle")).not.toBeNull();
    expect(m.root.querySelector("[data-item=intro_note] h3")).toBeNull();
    expect(m.q("[data-item=intro_note]").textContent).toContain("How do you feel at school?");
  });

  it("a text block is selectable: deselecting it removes it from the preview", () => {
    const m = loaded(exampleText(), (d) => {
      const n = d.items.find((i: any) => i.id === "anon_note");
      n.inclusionRequired = false;
    });
    expect(ids(m)).toContain("anon_note");
    toggleItem(m.store, "anon_note", false);
    expect(ids(m)).not.toContain("anon_note");
  });

  it("HTML in a text block is shown as text", () => {
    const m = loaded(exampleText(), (d) => (d.items.find((i: any) => i.id === "anon_note").text.en = "<b>bold</b> <img src=x onerror=alert(1)>"));
    expect(m.root.querySelector(".pv b")).toBeNull();
    expect(m.root.querySelector(".pv img")).toBeNull();
    expect(m.q("[data-item=anon_note]").textContent).toContain("<b>bold</b>");
  });
});

describe("preview: answer formats", () => {
  const all = (m: Harness) => m.store.set({ selection: new Set(m.store.get().loaded!.catalog.items.map((i) => i.id)) });

  it("every control is disabled and nothing can be submitted or stored", () => {
    const m = loaded(CAT40);
    all(m);
    const controls = m.qa<HTMLInputElement>(".pv input, .pv select, .pv textarea");
    expect(controls.length).toBeGreaterThan(20);
    expect(controls.every((c) => c.disabled)).toBe(true);
    expect(m.root.querySelector("form")).toBeNull();
    expect(m.root.querySelector(".pv button")).toBeNull();
  });

  it("renders each response kind with its constraints", () => {
    const m = loaded(CAT40);
    all(m);
    const q = (id: string) => m.q(`[data-item=${id}]`);
    expect(q("extraversion_01").querySelectorAll("input[type=radio]")).toHaveLength(5);
    const age = q("age_test").querySelector<HTMLInputElement>("input[type=number]")!;
    expect([age.min, age.max, age.step]).toEqual(["10", "20", "1"]);
    expect(q("age_test").textContent).toContain("years");
    expect(q("hours_test").querySelector<HTMLInputElement>("input[type=number]")!.step).toBe("0.1");
    expect(q("areas_test").querySelectorAll("input[type=checkbox]")).toHaveLength(4);
    expect(q("areas_test").textContent).toContain("1 to 2 answers");
    expect(q("areas_test").textContent).toContain("excludes all others: none");
    expect(q("other_test").querySelector<HTMLInputElement>("input[type=text]")!.maxLength).toBe(250);
    expect(q("comment_test").querySelector("textarea")!.maxLength).toBe(2000);
    const date = q("date_test").querySelector<HTMLInputElement>("input[type=date]")!;
    expect([date.min, date.max]).toEqual(["2026-01-01", "2026-12-31"]);
    expect(q("missing_test").querySelectorAll("input[type=radio]")).toHaveLength(4);
  });

  it("keeps the answer order of the catalog and the codes' labels", () => {
    const m = loaded(CAT40);
    all(m);
    const labels = m.qa("[data-item=missing_test] .pv-opt").map((l) => l.textContent!.trim());
    expect(labels).toEqual(["First category", "Second category", "Do not know", "Prefer not to answer"]);
  });

  it("shows required and optional markers and conditions", () => {
    const m = loaded(CAT40);
    all(m);
    expect(m.q("[data-item=age_test] legend").textContent).toContain("required");
    expect(m.q("[data-item=hours_test] legend").textContent).toContain("optional");
    expect(m.q("[data-item=other_test]").textContent).toContain("Shown only if: areas_test ∋ other");
  });

  it("renders slider, ranking, e-mail format, dropdown and random order from the rich example", () => {
    const m = loaded(exampleText(), (d) => (d.items.find((i: any) => i.id === "wants_help").presentation = { widget: "dropdown" }));
    const q = (id: string) => m.q(`[data-item=${id}]`);
    const slider = q("mood_slider").querySelector<HTMLInputElement>("input[type=range]")!;
    expect([slider.min, slider.max, slider.step]).toEqual(["0", "100", "1"]);
    expect(q("mood_slider").textContent).toContain("Very bad");
    expect(q("mood_slider").textContent).toContain("from 0 to 100");
    m.store.set({ selection: new Set([...m.store.get().selection, "rank_topics"]) });
    expect(m.qa("[data-item=rank_topics] ol li")).toHaveLength(3);
    expect(m.q("[data-item=rank_topics]").textContent).toContain("at most 3");
    expect(m.q("[data-item=rank_topics]").textContent).toContain("shuffled randomly");
    expect(q("contact_email").querySelector<HTMLInputElement>("input")!.type).toBe("email");
    expect(q("wants_help").querySelector("select")).not.toBeNull();
    expect(q("wants_help").querySelector("input[type=radio]")).toBeNull();
  });

  it("shows the warning and help text of a sensitive item", () => {
    const m = loaded(exampleText());
    const text = m.q("[data-item=demo_02]").textContent!;
    expect(text).toContain("may find this question upsetting");
    expect(text).toContain("school counselling service");
    expect(m.q("[data-item=demo_02] .pv-sensitive").getAttribute("role")).toBe("note");
  });
});

describe("preview: matrix layout", () => {
  it("renders items that share one option set as a table", () => {
    const m = loaded(exampleText());
    const table = m.q("table.pv-matrix");
    expect(table.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(table.querySelectorAll("thead th")).toHaveLength(7); // empty corner + 6 options
    expect(table.textContent).toContain("Disagree strongly");
    expect(table.querySelectorAll("input[type=radio]")).toHaveLength(18);
    expect(table.querySelector("th[scope=row]")!.textContent).toContain("comfortable in my class");
  });
  it("falls back to a list when the items do not share the answers", () => {
    const m = loaded(exampleText(), (d) => (d.items.find((i: any) => i.id === "demo_03").response.optionSetRef = "yes_no"));
    expect(m.root.querySelector("table.pv-matrix")).toBeNull();
    expect(m.root.querySelector("[data-item=demo_03] input[type=radio]")).not.toBeNull();
  });
  it.each([
    ["a sensitive warning", (i: any) => (i.sensitivity = { level: "sensitive", warningText: { en: "UNIQUE-WARNING", "de-CH": "WARNUNG" } })],
    ["an instruction", (i: any) => (i.instruction = { en: "UNIQUE-INSTRUCTION", "de-CH": "ANWEISUNG" })],
    ["participant help", (i: any) => (i.respondentHelp = { en: "UNIQUE-HELP", "de-CH": "HILFE" })],
    ["a condition", (i: any) => (i.visibleWhen = { itemRef: "intro_note", operator: "equals", value: "x" })],
  ])("never lets the matrix swallow %s: the item is shown as a list instead", (_n, mutate) => {
    const m = loaded(exampleText(), (d) => {
      const it = d.items.find((i: any) => i.id === "demo_03");
      mutate(it);
      // keep the catalog valid for the conditional case
      if (it.visibleWhen) it.visibleWhen = { itemRef: "demo_01", operator: "equals", value: "1" };
    });
    expect(m.root.querySelector("table.pv-matrix")).toBeNull();
    const text = m.q("[data-item=demo_03]").textContent!;
    expect(/UNIQUE-|Shown only if/.test(text)).toBe(true);
  });
});

describe("preview: languages and locked texts", () => {
  it("switches language and marks missing translations instead of mixing silently", () => {
    const m = loaded("30_Katalog_Zweisprachig.json", (d) => delete d.items.find((i: any) => i.id === "extraversion_02").text["de-CH"]);
    expect(m.q("[data-item=extraversion_01]").textContent).toContain("Ich bin der Mittelpunkt auf Partys.");
    const missing = m.q("[data-item=extraversion_02]").textContent!;
    expect(missing).toContain("Feel comfortable around people.");
    expect(missing).toContain("Missing in this language, text in en");
    setLanguage(m.store, "en");
    expect(m.q("[data-item=extraversion_01]").textContent).toContain("Am the life of the party.");
    expect(m.q(".pv").getAttribute("lang")).toBe("en");
  });

  it("locked items appear only as placeholders with their ID, no wording anywhere", () => {
    const m = loaded(CAT10, (d) => (d.rights.find((r: any) => r.id === "rights_ipip").permissions.electronicDisplay = "unknown"));
    expect(m.q("[data-item=extraversion_01]").textContent).toContain("Text locked (ID extraversion_01)");
    expect(m.root.textContent).not.toContain("Am the life of the party");
    expect(m.root.textContent).not.toContain("Very Inaccurate");
    expect(m.q("[data-item=extraversion_01]").querySelector("input")).toBeNull();
  });

  it("a locked item in a matrix section turns the matrix into a list of placeholders", () => {
    const m = loaded(exampleText(), (d) => {
      d.rights.find((r: any) => r.id === "rights_own").permissions.electronicDisplay = "unknown";
    });
    expect(m.root.querySelector("table.pv-matrix")).toBeNull();
    expect(m.root.textContent).not.toContain("I feel comfortable in my class");
  });
});

describe("preview: safety", () => {
  it("catalog text never becomes markup", () => {
    const m = loaded(exampleText(), (d) => {
      const it = d.items.find((i: any) => i.id === "demo_01");
      it.text.en = "<img src=x onerror=alert(1)>";
      d.optionSets[0].options[0].label.en = "<script>alert(1)</script>";
      d.questionnaire.introduction.en = "<iframe src=//evil></iframe>";
    });
    for (const sel of [".pv img", ".pv script", ".pv iframe"]) expect(m.root.querySelector(sel), sel).toBeNull();
    expect(m.q("[data-item=demo_01]").textContent).toContain("<img src=x onerror=alert(1)>");
  });
});

describe("preview tab", () => {
  it("is reachable from the tab bar", () => {
    const m = mount("en");
    loadCatalogText(m.store, exampleText(), "x.json");
    expect(m.qa("nav.tabs button").map((b) => b.textContent)).toEqual(["1 Questions and modules", "2 Order", "3 Adapt texts", "4 Preview", "5 Check and output"]);
    click(m.q("[data-focus=tab-preview]"));
    expect(m.store.get().view).toBe("preview");
    expect(m.q("[data-focus=tab-preview]").getAttribute("aria-current")).toBe("page");
    expect(m.root.querySelector(".pv")).not.toBeNull();
  });
});
