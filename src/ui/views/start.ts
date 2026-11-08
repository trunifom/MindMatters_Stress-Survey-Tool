import { SUPPORTED_SCHEMA_VERSIONS, APP_VERSION } from "../../version";
import { ADAPTERS, ADAPTER_IDS } from "../../output/registry";
import { diagnosticsList } from "../components";
import { h } from "../dom";
import { t, TextKey } from "../i18n";
import type { AppState } from "../state";

export interface StartHandlers {
  onFile(file: File): void;
  onDemo(): void;
  onConfirmMigration(): void;
  onCancelMigration(): void;
}

const STEPS: Array<[TextKey, TextKey]> = [
  ["start.s1.t", "start.s1.d"],
  ["start.s2.t", "start.s2.d"],
  ["start.s3.t", "start.s3.d"],
  ["start.s4.t", "start.s4.d"],
];

const CAN: TextKey[] = ["start.can1", "start.can2", "start.can3", "start.can4", "start.can5", "start.can6"];
const NOT: TextKey[] = ["start.not1", "start.not2", "start.not3", "start.not4"];

const TIER_KEY = { adapter: "start.tier.adapter", prototype: "start.tier.prototype", table: "start.tier.table" } as const;

/**
 * Start view: what the tool is for, what you can do and what not, the four steps, the supported survey
 * tools and the file drop zone. Everything a first-time visitor needs before loading a file.
 */
export function renderStart(s: AppState, handlers: StartHandlers, appVersion = APP_VERSION): HTMLElement {
  return h(
    "div",
    { class: "start" },
    hero(handlers),
    importResult(s, handlers),
    h(
      "section",
      { class: "start-section", "aria-labelledby": "how-h" },
      h("h2", { id: "how-h" }, t("start.howTitle")),
      h(
        "ol",
        { class: "step-cards" },
        ...STEPS.map(([title, text], i) =>
          h("li", { class: "step-card" }, h("span", { class: "step-no", "aria-hidden": "true" }, String(i + 1)), h("h3", null, t(title)), h("p", null, t(text))),
        ),
      ),
    ),
    h(
      "div",
      { class: "two-col" },
      h("section", { class: "card can", "aria-labelledby": "can-h" }, h("h2", { id: "can-h" }, t("start.canTitle")), h("ul", { class: "tick-list" }, ...CAN.map((k) => h("li", null, t(k))))),
      h("section", { class: "card cannot", "aria-labelledby": "not-h" }, h("h2", { id: "not-h" }, t("start.notTitle")), h("ul", { class: "dash-list" }, ...NOT.map((k) => h("li", null, t(k))))),
    ),
    h(
      "section",
      { class: "start-section", "aria-labelledby": "targets-h" },
      h("h2", { id: "targets-h" }, t("start.targetsTitle")),
      h("p", { class: "muted" }, t("start.targetsIntro")),
      h(
        "ul",
        { class: "target-list" },
        ...ADAPTER_IDS.map((id) => {
          const e = ADAPTERS[id]!;
          return h(
            "li",
            { class: "target" },
            h("strong", null, e.label),
            " ",
            h("span", { class: `tier tier-${e.tier}` }, t(TIER_KEY[e.tier])),
            h("span", { class: "muted target-text" }, t(`start.target.${id}` as TextKey)),
          );
        }),
      ),
    ),
    h("p", { class: "muted start-foot" }, t("start.privacy")),
    h("p", { class: "muted start-foot" }, t("start.schemas", { versions: SUPPORTED_SCHEMA_VERSIONS.join(", "), app: appVersion })),
  );
}

function hero(handlers: StartHandlers): HTMLElement {
  let zone: HTMLElement | undefined;
  const take = (files: FileList | null | undefined) => {
    const f = files?.[0];
    if (f) handlers.onFile(f);
  };
  const drop = h(
    "div",
    {
      class: "dropzone",
      on: {
        dragover: (ev) => {
          ev.preventDefault();
          zone?.classList.add("is-over");
        },
        dragleave: () => zone?.classList.remove("is-over"),
        drop: (ev) => {
          ev.preventDefault();
          zone?.classList.remove("is-over");
          take((ev as DragEvent).dataTransfer?.files);
        },
      },
    },
    h("h2", { id: "drop-h" }, t("start.dropTitle")),
    h("p", { class: "muted" }, t("start.dropText")),
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
            take(input.files);
            input.value = "";
          },
        },
      }),
      h("label", { class: "btn btn-primary btn-large", for: "catalog-file" }, t("start.load")),
      " ",
      h("button", { type: "button", class: "btn btn-large", id: "load-demo", "data-focus": "load-demo", on: { click: () => handlers.onDemo() } }, t("start.demo")),
    ),
    h("p", { class: "muted small" }, t("start.demoHint")),
  );
  zone = drop;
  return h(
    "section",
    { class: "hero", "aria-labelledby": "hero-h" },
    h(
      "div",
      { class: "hero-text" },
      h("p", { class: "eyebrow" }, t("start.eyebrow")),
      h("h2", { id: "hero-h", class: "hero-title" }, t("start.hero")),
      h("p", { class: "lead" }, t("start.heroText")),
    ),
    drop,
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
  return h("div", { class: "import-result card" }, ...parts);
}
