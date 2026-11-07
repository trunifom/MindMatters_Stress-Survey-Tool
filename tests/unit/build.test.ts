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
    // Markup and CSS are checked separately from the bundled JavaScript: library code contains
    // strings such as new URL("http://" + host) for parsing, which never produce a request.
    const css = /<style>([\s\S]*?)<\/style>/.exec(html)?.[1] ?? "";
    const markup = html.replace(/<script>[\s\S]*<\/script>/, "<script></script>").replace(/<style>[\s\S]*?<\/style>/, "<style></style>");
    expect(markup).not.toMatch(/<script[^>]+src=/i);
    expect(markup).not.toMatch(/<link/i);
    expect(markup).not.toMatch(/<iframe|<object|<embed|<img|<audio|<video|<source/i);
    expect(markup).not.toMatch(/(?:src|href|action|poster)\s*=\s*["']?https?:/i);
    expect(css).not.toMatch(/@import/i);
    expect(css).not.toMatch(/url\(/i);
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

  it("needs no eval: the validators are generated at build time, so the policy has no 'unsafe-eval' and the bundle no eval", () => {
    const csp = /http-equiv="Content-Security-Policy" content="([^"]+)"/.exec(html)?.[1] ?? "";
    expect(csp).toContain("script-src 'unsafe-inline'");
    expect(csp).not.toContain("unsafe-eval");
    const js = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? "";
    expect(js).not.toMatch(/new Function|eval\s*\(/);
  });

  it("targets ES2019 syntax: no optional chaining, nullish coalescing or class fields in the bundle", () => {
    const js = /<script>([\s\S]*)<\/script>/.exec(html)?.[1] ?? "";
    expect(js.length).toBeGreaterThan(100_000); // the generated validators and the application are really inside
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
