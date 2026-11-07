import { SUPPORTED_SCHEMA_VERSIONS, APP_VERSION } from "../../version";
import { diagnosticsList } from "../components";
import { h } from "../dom";
import { t } from "../i18n";
import type { AppState } from "../state";

export interface StartHandlers {
  onFile(file: File): void;
  onConfirmMigration(): void;
  onCancelMigration(): void;
}

/** Start view: purpose, steps, file selection and the result of the last failed import. */
export function renderStart(s: AppState, handlers: StartHandlers, appVersion = APP_VERSION): HTMLElement {
  const steps = [t("start.step1"), t("start.step2"), t("start.step3"), t("start.step4")];
  return h(
    "section",
    { class: "card start", "aria-labelledby": "start-h" },
    h("h2", { id: "start-h" }, t("app.title")),
    h("p", null, t("start.purpose")),
    h("h3", { class: "visually-hidden" }, t("start.steps")),
    h("ol", { class: "steps" }, ...steps.map((x) => h("li", null, x))),
    h(
      "div",
      { class: "file-picker" },
      h("input", {
        id: "catalog-file",
        class: "visually-hidden",
        type: "file",
        accept: ".json,application/json",
        "data-focus": "catalog-file",
        on: {
          change: (ev) => {
            const input = ev.target as HTMLInputElement;
            const f = input.files?.[0];
            if (f) handlers.onFile(f);
            input.value = "";
          },
        },
      }),
      h("label", { class: "btn btn-primary", for: "catalog-file" }, t("start.load")),
      h("span", { class: "muted" }, " " + t("start.loadHint")),
    ),
    h("p", { class: "muted" }, t("start.privacy")),
    h("p", { class: "muted" }, t("start.schemas", { versions: SUPPORTED_SCHEMA_VERSIONS.join(", "), app: appVersion })),
    importResult(s, handlers),
  );
}

/** Findings and the explicit migration offer of the last import attempt. */
export function importResult(s: AppState, handlers: StartHandlers): HTMLElement | null {
  const failed = s.notice?.kind === "error";
  if (!failed && !s.pendingMigration) return null;
  const parts: Array<HTMLElement | null> = [];
  if (s.pendingMigration) {
    parts.push(
      h(
        "div",
        { class: "migration", role: "group", "aria-labelledby": "mig-h" },
        h("h3", { id: "mig-h" }, t("import.migrationTitle")),
        h("p", null, t("import.migrationText", { from: s.pendingMigration.from, to: "0.4.0" })),
        h("button", { type: "button", class: "btn btn-primary", on: { click: () => handlers.onConfirmMigration() } }, t("import.migrate", { to: "0.4.0" })),
        " ",
        h("button", { type: "button", class: "btn", on: { click: () => handlers.onCancelMigration() } }, t("import.cancel")),
      ),
    );
  }
  if (s.importDiagnostics.length > 0) {
    parts.push(h("details", { open: true, class: "import-details" }, h("summary", null, t("import.details")), diagnosticsList(s.importDiagnostics)));
  }
  return h("div", { class: "import-result" }, ...parts);
}
