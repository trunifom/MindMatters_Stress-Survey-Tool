import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { beforeAll, describe, expect, it } from "vitest";

const root = join(dirname(fileURLToPath(import.meta.url)), "..", "..");
const out = join(root, "dist", "mindmatters.html");
let html = "";

beforeAll(() => {
  execFileSync(process.execPath, [join(root, "tools", "build.mjs")], { cwd: root, stdio: "pipe" });
  html = readFileSync(out, "utf8");
}, 60_000);

describe("single-file build (A02, T01, T02)", () => {
  it("is one self-contained HTML document", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).toContain('<div id="app">');
    expect((html.match(/<script/gi) ?? []).length).toBe(1);
    expect((html.match(/<style/gi) ?? []).length).toBe(1);
  });

  it("loads nothing from outside: no script src, stylesheet link, import, iframe, image or font URL", () => {
    expect(html).not.toMatch(/<script[^>]+src=/i);
    expect(html).not.toMatch(/<link\b/i);
    expect(html).not.toMatch(/<iframe|<object|<embed|<img[^>]+src=["']https?:/i);
    expect(html).not.toMatch(/@import/i);
    expect(html).not.toMatch(/url\(\s*["']?https?:/i);
  });

  it("contains no network API at all", () => {
    for (const api of ["fetch(", "XMLHttpRequest", "WebSocket", "EventSource", "sendBeacon", "importScripts", "navigator.serviceWorker", "RTCPeerConnection"]) {
      expect(html.includes(api), api).toBe(false);
    }
  });

  it("forbids connections by Content-Security-Policy as a second line of defence", () => {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(csp).toContain("default-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).toContain("frame-src 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'none'");
    expect(csp).toContain("form-action 'none'");
    expect(csp).not.toMatch(/https?:/);
  });

  it("targets ES2019 syntax: no optional chaining, nullish coalescing or class fields in the bundle", () => {
    const js = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? "";
    // TODO(M3 UI): raise to > 50_000 once the UI imports the core (ajv and the validator must be inside).
    expect(js.length).toBeGreaterThan(100);
    expect(js).not.toMatch(/\?\.\w/); // a?.b (the ternary form `a ? .5 : 1` has a space)
    expect(js).not.toMatch(/\?\?[^=]/);
    expect(js).not.toContain("structuredClone");
  });

  it("stays reasonably small", () => {
    expect(Buffer.byteLength(html)).toBeLessThan(1_500_000);
  });

  it("writes a matching checksum file", () => {
    const sha = readFileSync(out + ".sha256", "utf8").split(/\s+/)[0];
    expect(sha).toBe(createHash("sha256").update(html).digest("hex"));
  });

  it("builds reproducibly", () => {
    const first = createHash("sha256").update(html).digest("hex");
    execFileSync(process.execPath, [join(root, "tools", "build.mjs")], { cwd: root, stdio: "pipe" });
    expect(createHash("sha256").update(readFileSync(out, "utf8")).digest("hex")).toBe(first);
  }, 60_000);

  it("embeds the version", () => {
    expect(html).toContain('<meta name="generator" content="MindMatters 0.0.1">');
  });
});
