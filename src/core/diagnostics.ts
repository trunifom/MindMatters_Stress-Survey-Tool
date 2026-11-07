/**
 * Diagnostics: machine-readable findings of every validation stage.
 *
 * Contract (docs/DIAGNOSECODES.md): every finding has a stable `code`, a
 * severity, the pipeline `stage` that produced it and an English default
 * `message`. The UI localizes by `code`; the message is never parsed.
 * `jsonPath` is a JSON Pointer (RFC 6901), e.g. "/items/3/response/kind".
 */

export type Severity = "error" | "warning" | "info";

export type Stage =
  | "file"
  | "structure"
  | "reference"
  | "selection"
  | "content"
  | "rights"
  | "export";

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

export type DiagnosticExtra = Partial<
  Omit<Diagnostic, "code" | "severity" | "stage" | "message">
>;

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

export const hasErrors = (ds: readonly Diagnostic[]): boolean =>
  ds.some((d) => d.severity === "error");

export type CheckStatus = "pass" | "warning" | "fail" | "notRun";

/** Status of one check area derived from the diagnostics of the given stages. */
export function statusOf(ds: readonly Diagnostic[], stages: readonly Stage[]): CheckStatus {
  const own = ds.filter((d) => stages.includes(d.stage));
  if (own.some((d) => d.severity === "error")) return "fail";
  if (own.some((d) => d.severity === "warning")) return "warning";
  return "pass";
}
