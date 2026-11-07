// @vitest-environment jsdom
import { describe, expect, it } from "vitest";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { allKeys, setUiLang, t, detectUiLang } from "../../../src/ui/i18n";
import { chooseFile, click, exampleText, fixtureText, mount } from "./helpers";
import { loadCatalogText } from "../../../src/ui/state";
import { h, richText, safeHttpUrl, externalLink } from "../../../src/ui/dom";

describe("start view", () => {
  it("explains purpose, steps and privacy, and offers the file button", () => {
    const m = mount("en");
    expect(m.q("h1").textContent).toBe("MindMatters questionnaire configurator");
    expect(m.root.textContent).toContain("Nothing is uploaded, nothing is stored");
    expect(m.qa(".steps li").map((x) => x.textContent)).toEqual(["Load", "Select", "Check", "Output"]);
    expect(m.q("label[for=catalog-file]").textContent).toBe("Load catalog (JSON)");
    expect(m.root.textContent).toContain("Supported catalog version: 0.4.0");
    expect(m.q("#catalog-file").getAttribute("accept")).toContain(".json");
  });

  it("is German by default for German browsers and can be switched", () => {
    expect(detectUiLang("de-CH")).toBe("de");
    expect(detectUiLang("en-US")).toBe("en");
    expect(detectUiLang(undefined)).toBe("de");
    const m = mount("de");
    expect(m.q("h1").textContent).toBe("MindMatters Fragebogen-Konfigurator");
    click(m.q("[data-focus=ui-lang-en]"));
    expect(m.q("h1").textContent).toBe("MindMatters questionnaire configurator");
    expect(document.documentElement.lang).toBe("en");
    expect(m.q("[data-focus=ui-lang-en]").getAttribute("aria-pressed")).toBe("true");
    expect(m.q("[data-focus=ui-lang-de]").getAttribute("aria-pressed")).toBe("false");
  });

  it("has a skip link and a focusable main region", () => {
    const m = mount("en");
    expect(m.q("a.skip-link").getAttribute("href")).toBe("#content");
    expect(m.q("main#content").getAttribute("tabindex")).toBe("-1");
  });
});

describe("loading a catalog through the file input (T01, T05)", () => {
  it("loads the rich 0.4.0 example and shows catalog facts and statuses", async () => {
    const m = mount("en");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "rich.json", exampleText());
    expect(m.q("#cat-h").textContent).toBe("Rich 0.4.0 feature example");
    expect(m.root.textContent).toContain("example_rich");
    expect(m.root.textContent).toContain("1.0.0");
    expect(m.q(".banner-warning").textContent).toContain("Draft – not released for productive use");
    const chips = m.qa(".chip").map((c) => c.textContent);
    expect(chips.some((c) => c!.includes("Technical validity: OK"))).toBe(true);
    expect(chips.some((c) => c!.includes("Target system: not checked"))).toBe(true);
    expect(m.store.get().dirty).toBe(false);
    expect(m.store.get().selection.size).toBeGreaterThan(0);
  });

  it("status chips carry text and a symbol, never colour alone", async () => {
    const m = mount("en");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "rich.json", exampleText());
    for (const chip of m.qa(".chip")) {
      expect(chip.querySelector(".chip-symbol")?.textContent?.length).toBeGreaterThan(0);
      expect(chip.querySelector("strong")?.textContent?.length).toBeGreaterThan(0);
    }
  });

  it("a broken file is rejected with details and nothing is loaded", async () => {
    const m = mount("en");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "bad.json", '{"schemaVersion": "0.4.0",}');
    expect(m.store.get().loaded).toBeUndefined();
    expect(m.q(".banner-error").textContent).toContain("The file was not accepted.");
    expect(m.q(".import-details").textContent).toContain("JSON_SYNTAX_ERROR");
    expect(m.root.querySelector("#cat-h")).toBeNull();
  });

  it("T04: a rejected file leaves the previously loaded catalog untouched and says so", async () => {
    const m = mount("en");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "rich.json", exampleText());
    const before = m.store.get().loaded;
    await chooseFile(m.q<HTMLInputElement>("#catalog-file-2"), "bad.json", "not json");
    expect(m.store.get().loaded).toBe(before);
    expect(m.q(".banner-error").textContent).toContain("The previously loaded catalog is unchanged.");
    expect(m.q("#cat-h").textContent).toBe("Rich 0.4.0 feature example");
  });

  it("T05: a structural error is shown with its code and location", async () => {
    const m = mount("en");
    const doc = JSON.parse(exampleText());
    doc.items[1].answerRequired = "true";
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "bool.json", JSON.stringify(doc));
    const details = m.q(".import-details").textContent!;
    expect(details).toContain("INVALID_BOOLEAN");
    expect(details).toContain("/items/1/answerRequired");
  });
});

describe("explicit migration (T06)", () => {
  it("a 0.3.0 file is not loaded; the migration is only offered", async () => {
    const m = mount("en");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "old.json", fixtureText("10_Katalog_Klein_Gemischt.json"));
    expect(m.store.get().loaded).toBeUndefined();
    expect(m.q(".migration").textContent).toContain("schema 0.3.0");
    expect(m.q(".migration").textContent).toContain("never happens automatically");
  });
  it("loads after the user confirms, and cancel discards the offer", async () => {
    const m = mount("en");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "old.json", fixtureText("10_Katalog_Klein_Gemischt.json"));
    click(m.qa(".migration button")[1]!); // cancel
    expect(m.store.get().pendingMigration).toBeUndefined();
    expect(m.store.get().loaded).toBeUndefined();

    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "old.json", fixtureText("10_Katalog_Klein_Gemischt.json"));
    click(m.qa(".migration button")[0]!); // confirm
    expect(m.store.get().loaded?.catalog.catalog.id).toBe("school_test_small");
    expect(m.store.get().loaded?.loadDiagnostics.some((d) => d.code === "MIGRATED_SCHEMA_VERSION")).toBe(true);
  });
  it("an unknown version is never offered for migration", async () => {
    const m = mount("en");
    const text = fixtureText("10_Katalog_Klein_Gemischt.json").replace('"0.3.0"', '"9.9.9"');
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "x.json", text);
    expect(m.root.querySelector(".migration")).toBeNull();
    expect(m.q(".import-details").textContent).toContain("SCHEMA_VERSION_UNSUPPORTED");
  });
});

describe("unsaved changes (T42)", () => {
  it("asks before another catalog replaces a changed selection, and honours a refusal", async () => {
    const m = mount("en");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "rich.json", exampleText());
    const store = m.store;
    store.set({ dirty: true });
    m.setConfirm(false);
    await chooseFile(m.q<HTMLInputElement>("#catalog-file-2"), "x.json", exampleText().replace("example_rich", "other_cat"));
    expect(m.confirms).toHaveLength(1);
    expect(m.confirms[0]).toContain("unsaved changes");
    expect(store.get().loaded?.catalog.catalog.id).toBe("example_rich");
    m.setConfirm(true);
    await chooseFile(m.q<HTMLInputElement>("#catalog-file-2"), "x.json", exampleText().replace(/example_rich/g, "other_cat"));
    expect(store.get().loaded?.catalog.catalog.id).toBe("other_cat");
  });
  it("does not ask when nothing changed", async () => {
    const m = mount("en");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "rich.json", exampleText());
    await chooseFile(m.q<HTMLInputElement>("#catalog-file-2"), "x.json", exampleText());
    expect(m.confirms).toEqual([]);
  });
});

describe("language of the questions", () => {
  it("is offered for multilingual catalogs and defaults to the catalog default", async () => {
    const m = mount("en");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "rich.json", exampleText());
    const sel = m.q<HTMLSelectElement>("select[data-focus=language]");
    expect(Array.from(sel.options).map((o) => o.value)).toEqual(["en", "de-CH"]);
    expect(sel.value).toBe("en");
  });
});

describe("static safety rules (T41)", () => {
  const uiDir = join(dirname(fileURLToPath(import.meta.url)), "..", "..", "..", "src", "ui");
  const files = (dir: string): string[] =>
    readdirSync(dir).flatMap((f) => (statSync(join(dir, f)).isDirectory() ? files(join(dir, f)) : f.endsWith(".ts") ? [join(dir, f)] : []));

  it("no UI file can inject HTML or evaluate code", () => {
    const banned = [/\binnerHTML\b/, /\bouterHTML\b/, /insertAdjacentHTML/, /document\.write/, /\beval\s*\(/, /new Function/, /localStorage|sessionStorage|indexedDB/, /\bfetch\s*\(/, /XMLHttpRequest/];
    for (const f of files(uiDir)) {
      // comments may mention the banned names (the rule itself is documented there)
      const src = readFileSync(f, "utf8").replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
      for (const re of banned) expect(re.test(src), `${f} must not match ${re}`).toBe(false);
    }
  });
});

describe("dom helpers", () => {
  it("h() inserts text, never markup", () => {
    const el = h("p", null, "<img src=x onerror=alert(1)>");
    expect(el.children.length).toBe(0);
    expect(el.textContent).toBe("<img src=x onerror=alert(1)>");
  });
  it("only http(s) URLs become links", () => {
    expect(safeHttpUrl("https://example.org/x")).toBe("https://example.org/x");
    for (const bad of ["javascript:alert(1)", "data:text/html,x", "  JAVASCRIPT:1", "ftp://x", "//evil", undefined, "https://a b"]) {
      expect(safeHttpUrl(bad as string | undefined), String(bad)).toBeUndefined();
    }
    const link = externalLink("https://example.org", "ex") as HTMLAnchorElement;
    expect(link.tagName).toBe("A");
    expect(link.rel).toBe("noopener noreferrer");
    expect(link.target).toBe("_blank");
    expect(externalLink("javascript:alert(1)", "bad").nodeType).toBe(3); // plain text node
  });
  it("richText builds paragraphs and lists without interpreting HTML", () => {
    const host = h("div");
    host.appendChild(richText("Intro <b>x</b>\nsecond line\n\n- one\n- two\n\nEnd"));
    expect(host.querySelectorAll("p").length).toBe(2);
    expect(host.querySelectorAll("li").length).toBe(2);
    expect(host.querySelector("b")).toBeNull();
    expect(host.querySelector("p")!.textContent).toBe("Intro <b>x</b>\nsecond line");
  });
});

describe("i18n completeness", () => {
  it("every key is translated and placeholders match", () => {
    for (const k of allKeys()) {
      setUiLang("de");
      const de = t(k);
      setUiLang("en");
      const en = t(k);
      expect(de.length, k).toBeGreaterThan(0);
      expect(en.length, k).toBeGreaterThan(0);
      const ph = (s: string) => (s.match(/\{\w+\}/g) ?? []).sort().join();
      expect(ph(de), k).toBe(ph(en));
    }
  });
});

describe("store behaviour", () => {
  it("loadCatalogText replaces the whole state on success and resets metadata", async () => {
    const m = mount("en");
    loadCatalogText(m.store, exampleText(), "a.json");
    m.store.set({ schoolLabel: "X", dirty: true });
    loadCatalogText(m.store, exampleText(), "b.json");
    expect(m.store.get().schoolLabel).toBe("");
    expect(m.store.get().dirty).toBe(false);
    expect(m.store.get().loaded?.fileName).toBe("b.json");
  });
});
