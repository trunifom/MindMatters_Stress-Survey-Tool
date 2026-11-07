import type { CheckStatus, Diagnostic } from "../core/diagnostics";
import { h } from "./dom";
import { t, TextKey } from "./i18n";

/** Shared building blocks. Status and severity are always conveyed by text AND a symbol, never by colour alone. */

const STATUS_SYMBOL: Record<CheckStatus, string> = { pass: "✓", warning: "!", fail: "✕", notRun: "–" };
const SEVERITY_SYMBOL: Record<Diagnostic["severity"], string> = { error: "✕", warning: "!", info: "i" };

export function statusChip(labelKey: TextKey, status: CheckStatus): HTMLElement {
  return h(
    "li",
    { class: `chip chip-${status}` },
    h("span", { class: "chip-symbol", "aria-hidden": "true" }, STATUS_SYMBOL[status]),
    h("span", { class: "chip-label" }, t(labelKey) + ": "),
    h("strong", null, t(`status.${status}` as TextKey)),
  );
}

export function statusChips(status: Record<"technical" | "selection" | "rights" | "export", CheckStatus>): HTMLElement {
  return h(
    "ul",
    { class: "chips", "aria-label": t("header.status") },
    statusChip("status.technical", status.technical),
    statusChip("status.selection", status.selection),
    statusChip("status.rights", status.rights),
    statusChip("status.export", status.export),
  );
}

export function severityBadge(sev: Diagnostic["severity"]): HTMLElement {
  return h(
    "span",
    { class: `badge sev-${sev}` },
    h("span", { "aria-hidden": "true" }, SEVERITY_SYMBOL[sev] + " "),
    t(`sev.${sev}` as TextKey),
  );
}

/** A list of findings: severity (text + symbol), stable code, message and the JSON location. */
export function diagnosticsList(ds: readonly Diagnostic[], emptyText = t("diagnostics.none")): HTMLElement {
  if (ds.length === 0) return h("p", { class: "muted" }, emptyText);
  const order = { error: 0, warning: 1, info: 2 } as const;
  const sorted = [...ds].sort((a, b) => order[a.severity] - order[b.severity]);
  return h(
    "ul",
    { class: "diagnostics" },
    ...sorted.map((d) =>
      h(
        "li",
        { class: `diag diag-${d.severity}` },
        severityBadge(d.severity),
        " ",
        h("code", { class: "diag-code" }, d.code),
        " ",
        h("span", { class: "diag-message" }, d.message),
        d.jsonPath ? h("span", { class: "diag-path muted" }, ` (${t("diagnostics.path")}: ${d.jsonPath || "/"})`) : null,
      ),
    ),
  );
}

export function banner(kind: "info" | "warning" | "error", text: string): HTMLElement {
  return h("div", { class: `banner banner-${kind}`, role: kind === "error" ? "alert" : "status" }, h("strong", null, text));
}
