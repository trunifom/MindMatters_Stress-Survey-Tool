/**
 * Explicit schema migration (never implicit, see ADR-003 and test T06).
 *
 * 0.3.0 -> 0.4.0 is purely additive: every 0.4.0 field is optional, so a valid 0.3.0 document becomes a valid
 * 0.4.0 document by changing `schemaVersion`. The input is never mutated; the caller decides whether to use the
 * result. Only the loader calls this, and only when the user asked for the migration.
 */

import { deepClone } from "./clone";
import { Diagnostic, diag } from "./diagnostics";

/** Outcome of a migration: the migrated copy plus an info diagnostic, or errors if there is no path. */
export type MigrationResult =
  | { ok: true; doc: Record<string, unknown>; diagnostics: Diagnostic[] }
  | { ok: false; diagnostics: Diagnostic[] };

const isObject = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/** Migrate a 0.3.0 document to the current schema version. Returns a deep copy; any other version or a non-object fails with a diagnostic. */
export function migrateToCurrent(input: unknown): MigrationResult {
  if (!isObject(input)) {
    return {
      ok: false,
      diagnostics: [diag("structure", "error", "DOCUMENT_NOT_OBJECT", "The document root must be a JSON object.", { jsonPath: "" })],
    };
  }
  if (input.schemaVersion !== "0.3.0") {
    return {
      ok: false,
      diagnostics: [
        diag(
          "structure",
          "error",
          "MIGRATION_NOT_AVAILABLE",
          `No migration path from schemaVersion ${JSON.stringify(input.schemaVersion)}. Only 0.3.0 -> 0.4.0 exists.`,
          { jsonPath: "/schemaVersion" },
        ),
      ],
    };
  }
  const doc = deepClone(input);
  doc.schemaVersion = "0.4.0";
  return {
    ok: true,
    doc,
    diagnostics: [
      diag("structure", "info", "MIGRATED_SCHEMA_VERSION", "Migrated schemaVersion 0.3.0 to 0.4.0 (additive change, content unchanged).", {
        jsonPath: "/schemaVersion",
      }),
    ],
  };
}
