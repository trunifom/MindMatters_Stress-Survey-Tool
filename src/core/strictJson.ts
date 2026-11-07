import { Diagnostic, diag, pointer } from "./diagnostics";
import { DEFAULT_LIMITS, Limits } from "./limits";

/**
 * Strict JSON reader (spec B01, C01, C09).
 *
 * Differences to JSON.parse:
 *  - duplicate object keys are an error (JSON_DUPLICATE_KEY), not "last wins";
 *  - hard limits for size, depth, node count and string length (LIMIT_EXCEEDED);
 *  - errors carry line/column and a JSON Pointer;
 *  - a leading BOM is tolerated, any other trailing content is an error;
 *  - keys such as "__proto__" are stored as ordinary own properties, so
 *    untrusted input can never touch the prototype chain.
 *
 * Depth is limited, so the recursive descent cannot overflow the stack.
 */

export type ParseResult =
  | { ok: true; value: unknown }
  | { ok: false; diagnostics: Diagnostic[] };

class ParseFailure extends Error {
  constructor(
    readonly code: "JSON_SYNTAX_ERROR" | "JSON_DUPLICATE_KEY" | "LIMIT_EXCEEDED",
    message: string,
    readonly path: string,
    readonly offset: number,
  ) {
    super(message);
  }
}

const WS = new Set([" ", "\t", "\n", "\r"]);
const NUMBER = /-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/y;

export function parseStrictJson(text: string, limits: Limits = DEFAULT_LIMITS): ParseResult {
  const bytes = new TextEncoder().encode(text).length;
  if (bytes > limits.maxBytes) {
    return fail(
      new ParseFailure(
        "LIMIT_EXCEEDED",
        `Input is ${bytes} bytes, limit is ${limits.maxBytes}.`,
        "",
        0,
      ),
      text,
    );
  }

  let pos = text.charCodeAt(0) === 0xfeff ? 1 : 0;
  let nodes = 0;

  const err = (message: string, path: string, at = pos): ParseFailure =>
    new ParseFailure("JSON_SYNTAX_ERROR", message, path, at);

  const skipWs = (): void => {
    while (pos < text.length && WS.has(text[pos] as string)) pos++;
  };

  const countNode = (path: string): void => {
    if (++nodes > limits.maxNodes) {
      throw new ParseFailure(
        "LIMIT_EXCEEDED",
        `More than ${limits.maxNodes} JSON values.`,
        path,
        pos,
      );
    }
  };

  const parseString = (path: string): string => {
    const start = pos;
    pos++; // opening quote
    let out = "";
    for (;;) {
      if (pos >= text.length) throw err("Unterminated string.", path, start);
      const ch = text[pos] as string;
      const code = ch.charCodeAt(0);
      if (ch === '"') {
        pos++;
        return out;
      }
      if (code < 0x20) throw err("Unescaped control character in string.", path);
      if (ch === "\\") {
        const esc = text[pos + 1];
        pos += 2;
        switch (esc) {
          case '"': out += '"'; break;
          case "\\": out += "\\"; break;
          case "/": out += "/"; break;
          case "b": out += "\b"; break;
          case "f": out += "\f"; break;
          case "n": out += "\n"; break;
          case "r": out += "\r"; break;
          case "t": out += "\t"; break;
          case "u": {
            const hex = text.slice(pos, pos + 4);
            if (!/^[0-9a-fA-F]{4}$/.test(hex)) throw err("Invalid \\u escape.", path, pos - 2);
            out += String.fromCharCode(parseInt(hex, 16));
            pos += 4;
            break;
          }
          default:
            throw err("Invalid escape sequence.", path, pos - 2);
        }
      } else {
        out += ch;
        pos++;
      }
      if (out.length > limits.maxStringLength) {
        throw new ParseFailure(
          "LIMIT_EXCEEDED",
          `String longer than ${limits.maxStringLength} characters.`,
          path,
          pos,
        );
      }
    }
  };

  const parseValue = (path: string, depth: number): unknown => {
    skipWs();
    if (pos >= text.length) throw err("Unexpected end of input.", path);
    countNode(path);
    const ch = text[pos] as string;

    if (ch === "{") {
      if (depth + 1 > limits.maxDepth) {
        throw new ParseFailure("LIMIT_EXCEEDED", `Nesting deeper than ${limits.maxDepth}.`, path, pos);
      }
      pos++;
      const obj: Record<string, unknown> = {};
      const seen = new Set<string>();
      skipWs();
      if (text[pos] === "}") {
        pos++;
        return obj;
      }
      for (;;) {
        skipWs();
        if (text[pos] !== '"') throw err("Expected a string key.", path);
        const keyStart = pos;
        const key = parseString(path);
        const childPath = path + pointer(key);
        if (seen.has(key)) {
          throw new ParseFailure(
            "JSON_DUPLICATE_KEY",
            `Duplicate object key "${key}".`,
            childPath,
            keyStart,
          );
        }
        seen.add(key);
        skipWs();
        if (text[pos] !== ":") throw err("Expected ':' after key.", childPath);
        pos++;
        const value = parseValue(childPath, depth + 1);
        Object.defineProperty(obj, key, {
          value,
          enumerable: true,
          writable: true,
          configurable: true,
        });
        skipWs();
        if (text[pos] === ",") {
          pos++;
          continue;
        }
        if (text[pos] === "}") {
          pos++;
          return obj;
        }
        throw err("Expected ',' or '}'.", path);
      }
    }

    if (ch === "[") {
      if (depth + 1 > limits.maxDepth) {
        throw new ParseFailure("LIMIT_EXCEEDED", `Nesting deeper than ${limits.maxDepth}.`, path, pos);
      }
      pos++;
      const arr: unknown[] = [];
      skipWs();
      if (text[pos] === "]") {
        pos++;
        return arr;
      }
      for (;;) {
        arr.push(parseValue(path + pointer(arr.length), depth + 1));
        skipWs();
        if (text[pos] === ",") {
          pos++;
          continue;
        }
        if (text[pos] === "]") {
          pos++;
          return arr;
        }
        throw err("Expected ',' or ']'.", path);
      }
    }

    if (ch === '"') return parseString(path);
    if (text.startsWith("true", pos)) {
      pos += 4;
      return true;
    }
    if (text.startsWith("false", pos)) {
      pos += 5;
      return false;
    }
    if (text.startsWith("null", pos)) {
      pos += 4;
      return null;
    }

    NUMBER.lastIndex = pos;
    const m = NUMBER.exec(text);
    if (m) {
      pos += m[0].length;
      return Number(m[0]);
    }
    throw err(`Unexpected character '${ch}'.`, path);
  };

  try {
    const value = parseValue("", 0);
    skipWs();
    if (pos < text.length) throw err("Unexpected content after the JSON value.", "");
    return { ok: true, value };
  } catch (e) {
    if (e instanceof ParseFailure) return fail(e, text);
    throw e;
  }
}

function fail(f: ParseFailure, text: string): ParseResult {
  const { line, column } = lineColumn(text, f.offset);
  return {
    ok: false,
    diagnostics: [
      diag("file", "error", f.code, `${f.message} (line ${line}, column ${column})`, {
        jsonPath: f.path,
      }),
    ],
  };
}

function lineColumn(text: string, offset: number): { line: number; column: number } {
  let line = 1;
  let last = -1;
  for (let i = 0; i < offset && i < text.length; i++) {
    if (text[i] === "\n") {
      line++;
      last = i;
    }
  }
  return { line, column: offset - last };
}
