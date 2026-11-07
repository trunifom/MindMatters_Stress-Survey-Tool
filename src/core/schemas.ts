import Ajv2020Module from "ajv/dist/2020.js";
import type { ValidateFunction } from "ajv/dist/2020.js";
import addFormatsModule from "ajv-formats";

import catalogSchema040 from "../../schema/0.4.0/catalog.schema.json";
import projectSchema040 from "../../schema/0.4.0/project.schema.json";

/**
 * Compiled JSON-Schema validators (Draft 2020-12) for the supported schema
 * version. Schemas are imported from schema/<version>/ and bundled into the
 * single-file build; nothing is fetched at runtime.
 */

export type DocKind = "catalog" | "project";

// ajv and ajv-formats are CommonJS packages; unwrap the default export defensively
// so the same code works under Node ESM, Vitest and the bundler.
const unwrap = <T>(m: unknown): T => ((m as { default?: T }).default ?? (m as T)) as T;
const Ajv2020 = unwrap<typeof Ajv2020Module>(Ajv2020Module);
const addFormats = unwrap<typeof addFormatsModule>(addFormatsModule);

type AjvInstance = InstanceType<typeof Ajv2020Module>;

interface Compiled {
  ajv: AjvInstance;
  root: ValidateFunction;
  id: string;
}

const cache = new Map<DocKind, Compiled>();

function compiled(kind: DocKind): Compiled {
  let c = cache.get(kind);
  if (!c) {
    const ajv = new Ajv2020({
      allErrors: true,
      verbose: true,
      strict: false, // schemas use annotation-style keywords; structure is covered by tests
    });
    addFormats(ajv);
    const schema = kind === "catalog" ? catalogSchema040 : projectSchema040;
    const root = ajv.compile(schema);
    c = { ajv, root, id: schema.$id };
    cache.set(kind, c);
  }
  return c;
}

export function getValidator(kind: DocKind): ValidateFunction {
  return compiled(kind).root;
}

/** Validator for one named definition ("#/$defs/<name>") of the schema. */
export function getDefValidator(kind: DocKind, defName: string): ValidateFunction {
  const { ajv, id } = compiled(kind);
  const v = ajv.getSchema(`${id}#/$defs/${defName}`);
  if (!v) throw new Error(`Schema definition not found: ${defName}`);
  return v;
}
