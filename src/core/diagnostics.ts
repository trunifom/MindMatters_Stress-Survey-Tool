/**
 * Diagnostics: machine-readable findings of every validation stage.
 *
 * Contract (docs/DIAGNOSECODES.md): every finding has a stable `code`, a
 * severity, the pipeline `stage` that produced it and an English default
 * `message`. The UI localizes by `code`; the message is never parsed.
 * `jsonPath` is a JSON Pointer (RFC 6901), e.g. "/items/3/response/kind".
 */

/** How serious a finding is. Only "error" blocks use of a document; "warning" and "info" are shown but never block. */
export type Severity = "error" | "warning" | "info";

/**
 * Pipeline stage that produced a finding. The UI groups check areas by stage (see statusOf): file, structure, reference and content form the
 * technical check; selection and rights have their own areas; export belongs to the output adapters.
 */
export type Stage =
  | "file"
  | "structure"
  | "reference"
  | "selection"
  | "content"
  | "rights"
  | "export";

/** One machine-readable finding. `code` is the stable identity (documented in docs/DIAGNOSECODES.md), `message` is only an English default. */
export interface Diagnostic {
  code: string;
  severity: Severity;
  stage: Stage;
  message: string;
  jsonPath?: string;
  itemRef?: string;
  moduleRef?: string;
  scaleRef?: string;
  targetPlatform?: string;
  remediation?: string;
  /** "initial" marks findings about the catalog's own initial selection. */
  context?: "initial" | "project";
}

/** Optional fields of a Diagnostic, passed as the last argument of diag(). */
export type DiagnosticExtra = Partial<
  Omit<Diagnostic, "code" | "severity" | "stage" | "message">
>;

/** Build a Diagnostic. Always use this instead of an object literal so that all findings share one shape. */
export function diag(
  stage: Stage,
  severity: Severity,
  code: string,
  message: string,
  extra: DiagnosticExtra = {},
): Diagnostic {
  return { code, severity, stage, message, ...extra };
}

/** Escape one reference token per RFC 6901. */
export function pointerToken(token: string | number): string {
  return String(token).replace(/~/g, "~0").replace(/\//g, "~1");
}

/** Build a JSON Pointer from path segments. */
export function pointer(...segments: Array<string | number>): string {
  return segments.map((s) => "/" + pointerToken(s)).join("");
}

/** True if at least one finding is an error (warnings and infos do not count). */
export const hasErrors = (ds: readonly Diagnostic[]): boolean =>
  ds.some((d) => d.severity === "error");

/** Result of one check area: pass, warning, fail, or notRun when the area could not be evaluated yet (for example selection of a broken catalog). */
export type CheckStatus = "pass" | "warning" | "fail" | "notRun";

/** Status of one check area derived from the diagnostics of the given stages. */
export function statusOf(ds: readonly Diagnostic[], stages: readonly Stage[]): CheckStatus {
  const own = ds.filter((d) => stages.includes(d.stage));
  if (own.some((d) => d.severity === "error")) return "fail";
  if (own.some((d) => d.severity === "warning")) return "warning";
  return "pass";
}
