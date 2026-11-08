/**
 * Structural validation (pipeline stage "structure"):
 *  1. version/type gate: unsupported or migratable versions never reach the schema (T06: no silent migration);
 *  2. JSON Schema (Draft 2020-12) validation with errors translated to stable diagnostic codes and cleaned of
 *     oneOf-branch noise (at most 200 findings).
 *
 * Read-only. Validators come from ./schemas; the loader calls validateStructure for catalogs and projects.
 */

import type { ErrorObject } from "ajv/dist/2020.js";
import { Diagnostic, diag, pointer } from "./diagnostics";
import { getValidator, getDefValidator, DocKind } from "./schemas";
import { MIGRATABLE_SCHEMA_VERSIONS, SUPPORTED_SCHEMA_VERSIONS } from "../version";

const EXPECTED_TYPE: Record<DocKind, string> = {
  catalog: "questionnaireCatalog",
  project: "questionnaireProject",
};

const MAX_STRUCTURE_DIAGNOSTICS = 200;

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * Gate before the schema: `schemaVersion` must be supported (a migratable one reports SCHEMA_VERSION_MIGRATION_REQUIRED) and
 * `documentType` must match the kind. Does not look at anything else.
 */
export function checkVersionAndType(doc: unknown, kind: DocKind): Diagnostic[] {
  if (!isObject(doc)) {
    return [diag("structure", "error", "DOCUMENT_NOT_OBJECT", "The document root must be a JSON object.", { jsonPath: "" })];
  }
  const version = doc.schemaVersion;
  if (typeof version !== "string") {
    return [
      diag("structure", "error", "SCHEMA_VERSION_MISSING", 'Field "schemaVersion" is missing or not a string.', {
        jsonPath: "/schemaVersion",
      }),
    ];
  }
  const out: Diagnostic[] = [];
  if ((MIGRATABLE_SCHEMA_VERSIONS as readonly string[]).includes(version)) {
    out.push(
      diag(
        "structure",
        "error",
        "SCHEMA_VERSION_MIGRATION_REQUIRED",
        `schemaVersion ${version} is not processed directly. It can be migrated explicitly to ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}.`,
        { jsonPath: "/schemaVersion", remediation: "Run the explicit migration (migrateToCurrent) and review the result." },
      ),
    );
  } else if (!(SUPPORTED_SCHEMA_VERSIONS as readonly string[]).includes(version)) {
    out.push(
      diag(
        "structure",
        "error",
        "SCHEMA_VERSION_UNSUPPORTED",
        `schemaVersion ${version} is not supported. Supported: ${SUPPORTED_SCHEMA_VERSIONS.join(", ")}.`,
        { jsonPath: "/schemaVersion" },
      ),
    );
  }
  if (doc.documentType !== EXPECTED_TYPE[kind]) {
    out.push(
      diag(
        "structure",
        "error",
        "DOCUMENT_TYPE_MISMATCH",
        `Expected documentType "${EXPECTED_TYPE[kind]}", found ${JSON.stringify(doc.documentType)}.`,
        { jsonPath: "/documentType" },
      ),
    );
  }
  return out;
}

/** Full structural check: gate first, schema only if the gate passes. */
export function validateStructure(doc: unknown, kind: DocKind): Diagnostic[] {
  const gate = checkVersionAndType(doc, kind);
  if (gate.length > 0) return gate;

  const validate = getValidator(kind);
  if (validate(doc)) return [];

  const raw = refineOneOf((validate.errors ?? []) as ErrorObject[], doc, kind);
  const out: Diagnostic[] = [];
  const seen = new Set<string>();
  for (const e of raw) {
    const d = translate(e, doc, raw);
    if (!d) continue;
    const key = `${d.code}|${d.jsonPath}|${d.message}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(d);
  }
  if (out.length > MAX_STRUCTURE_DIAGNOSTICS) {
    const total = out.length;
    out.length = MAX_STRUCTURE_DIAGNOSTICS;
    out.push(
      diag("structure", "info", "TOO_MANY_DIAGNOSTICS", `Only the first ${MAX_STRUCTURE_DIAGNOSTICS} of ${total} structure findings are shown.`),
    );
  }
  return out;
}

// ---------------------------------------------------------------------------
// Translation of ajv errors
// ---------------------------------------------------------------------------

const RESPONSE_DEF: Record<string, string> = {
  singleChoice: "RespSingleChoice",
  multipleChoice: "RespMultipleChoice",
  integer: "RespInteger",
  decimal: "RespDecimal",
  shortText: "RespShortText",
  longText: "RespLongText",
  date: "RespDate",
  slider: "RespSlider",
  ranking: "RespRanking",
  note: "RespNote",
};

function getByPointer(doc: unknown, ptr: string): unknown {
  if (ptr === "") return doc;
  let cur: unknown = doc;
  for (const raw of ptr.split("/").slice(1)) {
    const key = raw.replace(/~1/g, "/").replace(/~0/g, "~");
    if (Array.isArray(cur)) cur = cur[Number(key)];
    else if (isObject(cur)) cur = cur[key];
    else return undefined;
  }
  return cur;
}

function itemRefOf(doc: unknown, path: string): string | undefined {
  const m = /^\/items\/(\d+)(\/|$)/.exec(path);
  if (!m) return undefined;
  const item = getByPointer(doc, `/items/${m[1]}`);
  return isObject(item) && typeof item.id === "string" ? item.id : undefined;
}

/**
 * Replace the noisy errors of a failed oneOf (Item.response, Item.visibleWhen) by the
 * errors of the single branch the data asks for. The branch is chosen from the data
 * (`kind`, or `all`/`any`), never by trying all variants and printing every failure.
 * ajv reports errors behind a $ref with schema-relative paths, so branch attribution
 * by schemaPath is not possible; validating the object against the chosen definition
 * is.
 */
function refineOneOf(raw: ErrorObject[], doc: unknown, kind: DocKind): ErrorObject[] {
  const oneOfPaths = raw
    .filter((e) => e.keyword === "oneOf" && /\/(response|visibleWhen)$/.test(e.instancePath))
    .map((e) => e.instancePath);
  if (oneOfPaths.length === 0) return raw;

  let result = raw;
  for (const p of new Set(oneOfPaths)) {
    result = result.filter((e) => e.instancePath !== p && !e.instancePath.startsWith(p + "/"));
    const instance = getByPointer(doc, p);
    if (p.endsWith("/response")) {
      const k = isObject(instance) ? instance.kind : undefined;
      const def = typeof k === "string" ? RESPONSE_DEF[k] : undefined;
      if (!def) {
        result.push(syntheticUnknownKind(p, k));
        continue;
      }
      result.push(...branchErrors(kind, def, instance, p));
    } else {
      const isGroup = isObject(instance) && ("all" in instance || "any" in instance);
      result.push(...branchErrors(kind, isGroup ? "ConditionGroup" : "Condition", instance, p));
    }
  }
  return result;
}

function branchErrors(kind: DocKind, def: string, instance: unknown, prefix: string): ErrorObject[] {
  const v = getDefValidator(kind, def);
  if (v(instance)) return [];
  return ((v.errors ?? []) as ErrorObject[]).map((e) => ({ ...e, instancePath: prefix + e.instancePath }));
}

function syntheticUnknownKind(path: string, k: unknown): ErrorObject {
  return {
    keyword: "x-unknownResponseKind",
    instancePath: path + "/kind",
    schemaPath: "#/x-unknownResponseKind",
    params: { kind: k },
    message: `Unknown or missing response kind ${JSON.stringify(k)}`,
    data: k,
  } as unknown as ErrorObject;
}

function translate(e: ErrorObject, doc: unknown, all: ErrorObject[]): Diagnostic | null {
  const path = e.instancePath;

  // Drop meta errors that only restate a failed if/then.
  if (e.keyword === "if") return null;

  switch (e.keyword) {
    case "x-unknownResponseKind":
      return mk(e, doc, "UNKNOWN_RESPONSE_KIND", `${e.message}.`, path);
    case "type": {
      const expected = Array.isArray(e.params.type) ? e.params.type.join("|") : String(e.params.type);
      if (expected === "boolean") {
        return mk(e, doc, "INVALID_BOOLEAN", `Expected a real boolean (true/false) but found ${describe(e.data)}.`, path);
      }
      return mk(e, doc, "INVALID_TYPE", `Expected ${expected} but found ${describe(e.data)}.`, path);
    }
    case "required": {
      const prop = String(e.params.missingProperty);
      return mk(e, doc, "MISSING_FIELD", `Required field "${prop}" is missing.`, path);
    }
    case "additionalProperties": {
      const prop = String(e.params.additionalProperty);
      return mk(e, doc, "UNKNOWN_FIELD", `Unknown field "${prop}". Additions belong into "extensions".`, path + pointer(prop));
    }
    case "enum":
      return mk(e, doc, "INVALID_VALUE", `Value ${describe(e.data)} is not allowed. Allowed: ${(e.params.allowedValues as unknown[]).map((v) => JSON.stringify(v)).join(", ")}.`, path);
    case "const":
      return mk(e, doc, "INVALID_VALUE", `Value ${describe(e.data)} is not allowed. Expected ${JSON.stringify(e.params.allowedValue)}.`, path);
    case "pattern":
      return mk(e, doc, "INVALID_FORMAT", `Value ${describe(e.data)} does not match the required pattern.`, path);
    case "format": {
      // The schema carries both a format and a pattern for dates/timestamps; report once.
      const hasPattern = all.some((o) => o.keyword === "pattern" && o.instancePath === path);
      if (hasPattern) return null;
      return mk(e, doc, "INVALID_FORMAT", `Value ${describe(e.data)} is not a valid ${String(e.params.format)}.`, path);
    }
    case "uniqueItems":
      return mk(e, doc, "DUPLICATE_ENTRY", "Array entries must be unique.", path);
    case "minLength":
    case "minItems":
    case "minProperties":
    case "maxLength":
    case "maxItems":
    case "minimum":
    case "maximum":
    case "exclusiveMinimum":
    case "exclusiveMaximum":
    case "propertyNames":
      return mk(e, doc, "CONSTRAINT_VIOLATION", `${e.message ?? "Constraint violated"}.`, path);
    default:
      return mk(e, doc, "SCHEMA_VIOLATION", `${e.message ?? "Schema violation"}.`, path);
  }
}

function mk(e: ErrorObject, doc: unknown, code: string, message: string, jsonPath: string): Diagnostic {
  const itemRef = itemRefOf(doc, e.instancePath);
  return diag("structure", "error", code, message, itemRef ? { jsonPath, itemRef } : { jsonPath });
}

function describe(v: unknown): string {
  const s = JSON.stringify(v);
  if (s === undefined) return "undefined";
  return s.length > 60 ? s.slice(0, 57) + "..." : s;
}
