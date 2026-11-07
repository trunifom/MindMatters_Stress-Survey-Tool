// Generates the JSON-Schema validators as plain JavaScript at build time (ajv standalone code).
//
// Why: ajv normally compiles validators at runtime with `new Function`, which forces the page's
// Content-Security-Policy to allow 'unsafe-eval'. With pre-generated validators the page needs no eval at all.
//
// Used by tools/build.mjs and by tests/unit/standalone.test.ts (which compares the generated validators
// with the runtime-compiled ones).
import Ajv2020 from "ajv/dist/2020.js";
import standaloneCode from "ajv/dist/standalone/index.js";
import addFormats from "ajv-formats";
import { readFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const unwrap = (m) => m.default ?? m;

/** Definitions that src/core/schemaCheck.ts validates one by one (response kinds and conditions). */
const DEF_FILTER = /^(Resp[A-Za-z]*|Condition|ConditionGroup)$/;

export function generateValidatorSource() {
  const catalog = JSON.parse(readFileSync(join(root, "schema/0.4.0/catalog.schema.json"), "utf8"));
  const project = JSON.parse(readFileSync(join(root, "schema/0.4.0/project.schema.json"), "utf8"));
  const Ajv = unwrap(Ajv2020);
  const ajv = new Ajv({ allErrors: true, verbose: true, strict: false, code: { source: true, esm: false } });
  unwrap(addFormats)(ajv);
  ajv.addSchema(catalog);
  ajv.addSchema(project);
  const refs = { catalog: catalog.$id, project: project.$id };
  for (const name of Object.keys(catalog.$defs)) if (DEF_FILTER.test(name)) refs[`catalog#${name}`] = `${catalog.$id}#/$defs/${name}`;
  for (const name of Object.keys(project.$defs ?? {})) if (DEF_FILTER.test(name)) refs[`project#${name}`] = `${project.$id}#/$defs/${name}`;
  return standaloneCode(unwrap(ajv), refs);
}
