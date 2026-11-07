import { describe, expect, it } from "vitest";
import { parseStrictJson } from "../../src/core/strictJson";
import { DEFAULT_LIMITS } from "../../src/core/limits";

const ok = (t: string, l = DEFAULT_LIMITS) => {
  const r = parseStrictJson(t, l);
  if (!r.ok) throw new Error("expected ok: " + JSON.stringify(r.diagnostics));
  return r.value;
};
const bad = (t: string, l = DEFAULT_LIMITS) => {
  const r = parseStrictJson(t, l);
  if (r.ok) throw new Error("expected failure");
  return r.diagnostics[0]!;
};

describe("parseStrictJson: valid input", () => {
  it("matches JSON.parse on typical documents", () => {
    const text = '{"a":[1,2.5,-3e2,true,false,null,"x\\u00e4\\n"],"b":{"c":{}}}';
    expect(ok(text)).toEqual(JSON.parse(text));
  });
  it("tolerates a leading BOM and surrounding whitespace", () => {
    expect(ok("﻿ \n[1]\n")).toEqual([1]);
  });
  it("preserves strings with leading zeros and unicode", () => {
    expect(ok('{"code":"01","t":"Grüezi 😀"}')).toEqual({ code: "01", t: "Grüezi 😀" });
  });
  it("stores __proto__ as an own property without touching the prototype", () => {
    const v = ok('{"__proto__":{"polluted":true}}') as Record<string, unknown>;
    expect(Object.getPrototypeOf(v)).toBe(Object.prototype);
    expect(Object.prototype.hasOwnProperty.call(v, "__proto__")).toBe(true);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
});

describe("parseStrictJson: duplicate keys (T04)", () => {
  it("rejects a duplicate key at top level with its path", () => {
    const d = bad('{"a":1,"a":2}');
    expect(d.code).toBe("JSON_DUPLICATE_KEY");
    expect(d.stage).toBe("file");
    expect(d.jsonPath).toBe("/a");
  });
  it("rejects a duplicate key in a nested object inside an array", () => {
    const d = bad('{"items":[{"id":"x"},{"id":"y","id":"z"}]}');
    expect(d.code).toBe("JSON_DUPLICATE_KEY");
    expect(d.jsonPath).toBe("/items/1/id");
  });
  it("allows the same key in different objects", () => {
    expect(ok('[{"a":1},{"a":2}]')).toEqual([{ a: 1 }, { a: 2 }]);
  });
});

describe("parseStrictJson: syntax errors (T04)", () => {
  it.each([
    ["trailing comma in object", '{"a":1,}'],
    ["trailing comma in array", "[1,]"],
    ["single quotes", "{'a':1}"],
    ["comment", '{"a":1} // x'],
    ["leading zero number", "[01]"],
    ["bare plus number", "[+1]"],
    ["unterminated string", '{"a":"x'],
    ["raw newline in string", '"a\nb"'],
    ["invalid escape", '"\\x"'],
    ["bad unicode escape", '"\\u12"'],
    ["empty input", ""],
    ["two values", "1 2"],
    ["NaN", "[NaN]"],
    ["missing colon", '{"a" 1}'],
  ])("rejects %s", (_n, text) => {
    expect(bad(text).code).toBe("JSON_SYNTAX_ERROR");
  });
  it("reports line and column", () => {
    const d = bad('{\n  "a": 1,\n  "b": }');
    expect(d.message).toMatch(/line 3/);
  });
});

describe("parseStrictJson: limits (C09)", () => {
  it("rejects input larger than maxBytes", () => {
    const d = bad('["' + "x".repeat(50) + '"]', { ...DEFAULT_LIMITS, maxBytes: 20 });
    expect(d.code).toBe("LIMIT_EXCEEDED");
  });
  it("counts bytes, not characters", () => {
    // 10 two-byte characters = 20 bytes + 4 for ["..."] -> over a limit of 20
    const d = bad('["' + "ä".repeat(10) + '"]', { ...DEFAULT_LIMITS, maxBytes: 20 });
    expect(d.code).toBe("LIMIT_EXCEEDED");
  });
  it("rejects nesting deeper than maxDepth without stack overflow", () => {
    const deep = "[".repeat(10_000) + "]".repeat(10_000);
    expect(bad(deep).code).toBe("LIMIT_EXCEEDED");
  });
  it("accepts nesting exactly at maxDepth", () => {
    const l = { ...DEFAULT_LIMITS, maxDepth: 3 };
    expect(ok("[[[1]]]", l)).toEqual([[[1]]]);
    expect(bad("[[[[1]]]]", l).code).toBe("LIMIT_EXCEEDED");
  });
  it("rejects too many nodes", () => {
    const d = bad("[" + "1,".repeat(50) + "1]", { ...DEFAULT_LIMITS, maxNodes: 10 });
    expect(d.code).toBe("LIMIT_EXCEEDED");
  });
  it("rejects over-long strings", () => {
    const d = bad('"' + "a".repeat(100) + '"', { ...DEFAULT_LIMITS, maxStringLength: 50 });
    expect(d.code).toBe("LIMIT_EXCEEDED");
  });
});
