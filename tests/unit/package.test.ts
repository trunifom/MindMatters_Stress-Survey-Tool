import { spawnSync } from "node:child_process";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { crc32 as nodeCrc32 } from "node:zlib";
import { describe, expect, it } from "vitest";
import { buildZip, crc32 } from "../../src/output/zip";
import { buildPackage } from "../../src/output/package";
import { ADAPTER_IDS, ADAPTERS } from "../../src/output/registry";
import type { Catalog } from "../../src/core/types";
import { clone, example040 } from "./helpers";

const NOW = new Date("2026-11-08T10:30:00");

/** Reads a stored ZIP: returns name and bytes of every entry and checks the CRC of each. */
function readZip(bytes: Uint8Array): Map<string, Uint8Array> {
  const dv = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  const out = new Map<string, Uint8Array>();
  let eocd = bytes.length - 22;
  expect(dv.getUint32(eocd, true)).toBe(0x06054b50);
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  for (let i = 0; i < count; i++) {
    expect(dv.getUint32(p, true)).toBe(0x02014b50);
    const flags = dv.getUint16(p + 8, true);
    expect(flags & 0x0800).toBe(0x0800); // UTF-8 names
    expect(dv.getUint16(p + 10, true)).toBe(0); // stored
    const crc = dv.getUint32(p + 16, true);
    const size = dv.getUint32(p + 24, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const local = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(bytes.subarray(p + 46, p + 46 + nameLen));
    const lNameLen = dv.getUint16(local + 26, true);
    const lExtraLen = dv.getUint16(local + 28, true);
    const start = local + 30 + lNameLen + lExtraLen;
    const data = bytes.subarray(start, start + size);
    expect(nodeCrc32(data), name).toBe(crc);
    out.set(name, data);
    p += 46 + nameLen + extraLen + commentLen;
  }
  return out;
}

describe("zip writer", () => {
  it("crc32 agrees with Node's implementation", () => {
    for (const s of ["", "a", "123456789", "Grüße ÄÖÜ €"]) expect(crc32(new TextEncoder().encode(s))).toBe(nodeCrc32(new TextEncoder().encode(s)));
    expect(crc32(new TextEncoder().encode("123456789"))).toBe(0xcbf43926);
  });

  it("round-trips entries with umlauts in names and content", () => {
    const zip = buildZip([{ name: "a.txt", data: "hallo" }, { name: "export/Grüße.csv", data: "Zeile 1\nÄÖÜ €" }, { name: "leer.txt", data: "" }, { name: "bin.dat", data: Uint8Array.from([0, 255, 1]) }], NOW);
    const files = readZip(zip);
    expect([...files.keys()]).toEqual(["a.txt", "export/Grüße.csv", "leer.txt", "bin.dat"]);
    expect(new TextDecoder().decode(files.get("export/Grüße.csv"))).toBe("Zeile 1\nÄÖÜ €");
    expect([...(files.get("bin.dat") as Uint8Array)]).toEqual([0, 255, 1]);
  });

  it("refuses duplicate and unsafe names", () => {
    expect(() => buildZip([{ name: "a", data: "" }, { name: "a", data: "" }])).toThrow();
    expect(() => buildZip([{ name: "../evil", data: "" }])).toThrow();
    expect(() => buildZip([{ name: "/abs", data: "" }])).toThrow();
    expect(() => buildZip([{ name: "", data: "" }])).toThrow();
  });

  it("is a valid archive for an independent reader (Python zipfile), if Python is available", () => {
    const dir = mkdtempSync(join(tmpdir(), "mm-zip-"));
    const file = join(dir, "t.zip");
    writeFileSync(file, buildZip([{ name: "x/ä.txt", data: "Grüße" }, { name: "y.txt", data: "b" }], NOW));
    const code = "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1]); assert z.testzip() is None; out='|'.join(sorted(z.namelist()))+chr(10)+z.read(z.namelist()[0]).decode('utf-8'); sys.stdout.buffer.write(out.encode('utf-8'))";
    const r = spawnSync("python", ["-I", "-c", code, file], { encoding: "utf8" });
    if (r.error || r.status === null) return; // no Python: the manual reader above is the proof
    expect(r.status, r.stderr).toBe(0);
    expect(r.stdout).toContain("x/ä.txt|y.txt");
    expect(r.stdout).toContain("Grüße");
  });
});

const everything = (c: Catalog): Set<string> => new Set(c.items.map((i) => i.id));
const input = (c: any, extra: object = {}) => ({ catalog: c as Catalog, loadDiagnostics: [], selection: everything(c), language: "en", now: NOW, ...extra });

describe("download package", () => {
  it("contains project, report, codebook, README and every possible export, and lists the impossible ones with reasons", () => {
    const r = buildPackage(input(clone(example040())));
    const files = readZip(r.bytes);
    const names = [...files.keys()];
    expect(names[0]).toBe("LIESMICH.txt");
    expect(names.some((n) => n.endsWith("_project.json"))).toBe(true);
    expect(names.some((n) => n.endsWith("_check-report.json"))).toBe(true);
    expect(names.some((n) => n.endsWith("_codebook.en.md"))).toBe(true);
    expect(names.some((n) => /^export\/.*_csv_TEST_table\.csv$/.test(n))).toBe(true);
    expect(names.some((n) => /^export\/.*_unipark_TEST_bauplan\.md$/.test(n))).toBe(true);
    const readme = new TextDecoder().decode(files.get("LIESMICH.txt"));
    expect(readme).toContain("ACHTUNG: Der Katalog ist nicht freigegeben");
    expect(readme).toContain("Nicht enthalten (mit Grund)");
    expect(readme).toContain("Kein Export wurde an einem echten Zielsystem getestet");
    // Qualtrics cannot do the example's conditions and sliders: it is listed with the reason, not silently missing
    expect(r.skipped.some((s) => s.platform === "qualtrics" && s.reasons.some((x) => x.startsWith("EXPORT_CONDITION_UNSUPPORTED")))).toBe(true);
    expect(readme).toContain("Qualtrics:");
    expect(r.fileName).toMatch(/_paket\.zip$/);
  });

  it("every registered target is either included or skipped, never lost", () => {
    const r = buildPackage(input(clone(example040())));
    const have = new Set([...r.skipped.map((s) => s.platform), ...r.included.filter((i) => i.tier || i.kind.includes("Neutrale")).map((i) => ADAPTER_IDS.find((id) => ADAPTERS[id]!.label === i.kind))]);
    for (const id of ADAPTER_IDS) expect(have.has(id), id).toBe(true);
  });

  it("test exports are marked as such in the list", () => {
    const r = buildPackage(input(clone(example040())));
    expect(r.included.filter((i) => i.file.startsWith("export/")).every((i) => i.testArtifact === true)).toBe(true);
  });

  it("a released catalog gets regular exports without the draft warning", () => {
    const c: any = clone(example040());
    c.catalog.status = "released";
    const r = buildPackage(input(c));
    const readme = new TextDecoder().decode(readZip(r.bytes).get("LIESMICH.txt"));
    expect(readme).not.toContain("ACHTUNG");
    expect(r.included.some((i) => i.file.startsWith("export/") && i.testArtifact === false)).toBe(true);
  });

  it("school label and notes stay out of the codebook unless asked, but are in the project", () => {
    const c = clone(example040());
    const files = readZip(buildPackage(input(c, { schoolLabel: "Schule Geheim", internalNotes: "intern" })).bytes);
    const text = (suffix: string) => new TextDecoder().decode([...files].find(([n]) => n.endsWith(suffix))![1]);
    expect(text("_project.json")).toContain("Schule Geheim");
    expect(text("_codebook.en.md")).not.toContain("Schule Geheim");
    const files2 = readZip(buildPackage(input(c, { schoolLabel: "Schule Geheim", codebookNotes: true })).bytes);
    expect(new TextDecoder().decode([...files2].find(([n]) => n.endsWith("_codebook.en.md"))![1])).toContain("Schule Geheim");
  });

  it("a prohibited right leaves no wording in any export or the codebook", () => {
    const c: any = clone(example040());
    c.rights[0].permissions.export = "prohibited";
    c.rights[0].permissions.redistribution = "prohibited";
    const r = buildPackage(input(c));
    const files = readZip(r.bytes);
    expect([...files.keys()].some((n) => n.startsWith("export/"))).toBe(false);
    const text = [...files].map(([, d]) => new TextDecoder().decode(d)).join("\n");
    expect(text).not.toContain(c.items.find((i: any) => i.id === "demo_01").text.en);
  });
});
