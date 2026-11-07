/**
 * Versionskonstanten der Anwendung. Die unterstuetzten Schema-Versionen
 * werden in der Oberflaeche angezeigt (siehe docs/ARCHITEKTUR.md).
 */
export const APP_VERSION = "0.0.1";

/** Schema-Versionen, die ohne Migration verarbeitet werden. */
export const SUPPORTED_SCHEMA_VERSIONS = ["0.4.0"] as const;

/** Schema-Versionen, die ausdruecklich (nie still) nach 0.4.0 migriert werden koennen. */
export const MIGRATABLE_SCHEMA_VERSIONS = ["0.3.0"] as const;

export type SupportedSchemaVersion = (typeof SUPPORTED_SCHEMA_VERSIONS)[number];
