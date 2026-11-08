// @vitest-environment jsdom
import { describe, expect, it, vi } from "vitest";
import { readFileText } from "../../../src/ui/dom";
import { describeError, FileProblem, guarded, installGlobalHandlers } from "../../../src/ui/errors";
import { loadCatalogText, setView } from "../../../src/ui/state";
import { buildGoogleForms } from "../../../src/output/googleforms";
import { ADAPTERS, guardBuild } from "../../../src/output/registry";
import { chooseFile, click, exampleText, mount } from "./helpers";
import { clone, example040 } from "../helpers";

const quiet = () => vi.spyOn(console, "error").mockImplementation(() => undefined);

describe("reading a file", () => {
  const read = (parts: BlobPart[], name = "x.json") => readFileText(new File(parts, name));

  it("says which file is empty", async () => {
    await expect(read([], "leer.json")).rejects.toMatchObject({ name: "FileProblem", kind: "empty", fileName: "leer.json" });
  });

  it("recognises a binary file (zip, Excel, Word) by its signature or NUL bytes", async () => {
    await expect(read(["PK\u0003\u0004rest"], "a.xlsx")).rejects.toMatchObject({ kind: "notText" });
    await expect(read(["{\u0000}"], "b.json")).rejects.toMatchObject({ kind: "notText" });
  });

  it("recognises text that is not UTF-8", async () => {
    await expect(read([new Uint8Array([0x7b, 0xe4, 0x7d])], "latin1.json")).rejects.toMatchObject({ kind: "encoding" });
  });

  it("refuses a file above the size limit without reading it", async () => {
    const f = new File(["{}"], "big.json");
    Object.defineProperty(f, "size", { value: 11 * 1024 * 1024 });
    await expect(readFileText(f)).rejects.toMatchObject({ kind: "tooLarge", detail: expect.stringContaining("MB") });
  });

  it("reads a normal file", async () => {
    await expect(read(["{}"])).resolves.toBe("{}");
  });
});

describe("importing a file shows the reason in the page", () => {
  it("names the file and what is wrong for a binary file, and keeps the loaded catalog", async () => {
    quiet();
    const m = mount("de");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "rich.json", exampleText());
    const before = m.store.get().loaded;
    await chooseFile(m.q<HTMLInputElement>("#catalog-file-2"), "tabelle.xlsx", "PK\u0003\u0004binary");
    const text = m.store.get().notice?.text ?? "";
    expect(m.store.get().notice?.kind).toBe("error");
    expect(text).toContain("tabelle.xlsx");
    expect(text).toContain("keine JSON-Textdatei");
    expect(m.store.get().loaded).toBe(before);
  });

  it("an empty file is named as empty", async () => {
    quiet();
    const m = mount("de");
    await chooseFile(m.q<HTMLInputElement>("#catalog-file"), "leer.json", "");
    expect(m.store.get().notice?.text).toContain("«leer.json» ist leer");
  });
});

describe("guarded actions", () => {
  it("turn an exception into a visible error and leave the state alone", () => {
    quiet();
    const m = mount("de");
    loadCatalogText(m.store, exampleText(), "x.json");
    const selection = m.store.get().selection;
    const r = guarded(m.store, "act.savePackage", () => {
      throw new Error("Speicher voll");
    });
    expect(r).toBeUndefined();
    const n = m.store.get().notice!;
    expect(n.kind).toBe("error");
    expect(n.text).toContain("ZIP-Paket speichern");
    expect(n.text).toContain("Speicher voll");
    expect(m.store.get().selection).toBe(selection);
  });

  it("pass the result through when nothing goes wrong", () => {
    const m = mount("de");
    expect(guarded(m.store, "act.export", () => 42)).toBe(42);
    expect(m.store.get().notice).toBeUndefined();
  });

  it("describeError copes with strings, errors and odd values", () => {
    expect(describeError(new TypeError("kaputt"))).toBe("TypeError: kaputt");
    expect(describeError("text")).toBe("text");
    expect(describeError({ a: 1 })).toBe('{"a":1}');
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(describeError(circular)).toBe("unknown error");
    expect(new FileProblem("empty", "a.json").message).toContain("a.json");
  });
});

describe("unexpected errors", () => {
  it("script errors and rejected promises end up in the notice area", () => {
    quiet();
    const m = mount("de");
    const target = new EventTarget();
    installGlobalHandlers(m.store, target as unknown as Window);
    target.dispatchEvent(Object.assign(new Event("error"), { message: "boom", error: new Error("boom") }));
    expect(m.store.get().notice?.text).toContain("boom");
    target.dispatchEvent(Object.assign(new Event("unhandledrejection"), { reason: new Error("abgelehnt") }));
    expect(m.store.get().notice?.text).toContain("abgelehnt");
  });

  it("ignores resource loading errors that carry no message", () => {
    const m = mount("de");
    const target = new EventTarget();
    installGlobalHandlers(m.store, target as unknown as Window);
    target.dispatchEvent(new Event("error"));
    expect(m.store.get().notice).toBeUndefined();
  });
});

describe("a view that cannot be drawn", () => {
  it("shows the cause and a way back instead of a blank page", () => {
    quiet();
    const m = mount("de");
    loadCatalogText(m.store, exampleText(), "x.json");
    const s = m.store.get();
    // a catalog whose sections are missing breaks the order view
    m.store.set({ loaded: { ...s.loaded!, catalog: { ...s.loaded!.catalog, questionnaire: { ...s.loaded!.catalog.questionnaire, sections: undefined as never } } } });
    setView(m.store, "structure");
    expect(m.q(".crash-panel").textContent).toContain("konnte nicht angezeigt werden");
    expect(m.q(".crash-detail").textContent).toMatch(/TypeError/);
    click(m.q(".crash-panel button"));
    expect(m.store.get().view).toBe("items");
    // once the state is sound again, the page draws normally
    m.store.set({ loaded: s.loaded! });
    expect(m.qa(".crash-panel")).toHaveLength(0);
    expect(m.qa("li.item").length).toBeGreaterThan(0);
  });
});

describe("an export that throws", () => {
  it("becomes a failed result with EXPORT_INTERNAL_ERROR naming the target, and the others keep working", () => {
    const c = clone(example040());
    const boom = guardBuild("googleForms", () => {
      throw new RangeError("Stapel zu gross");
    });
    const r = boom(c, new Set(), { language: "en", mode: "test" });
    expect(r.ok).toBe(false);
    expect(r.content).toBeUndefined();
    const d = r.diagnostics.find((x) => x.code === "EXPORT_INTERNAL_ERROR")!;
    expect(d.severity).toBe("error");
    expect(d.targetPlatform).toBe("googleForms");
    expect(d.message).toContain("Stapel zu gross");
    expect(d.remediation).toBeTruthy();
    expect(typeof buildGoogleForms).toBe("function");
    expect(Object.keys(ADAPTERS).length).toBeGreaterThan(5);
  });
});
