import { resolveText } from "../../core/localized";
import { diagnosticsList, statusChips } from "../components";
import { h } from "../dom";
import { t } from "../i18n";
import { counts, currentStatus, selectionDiagnostics } from "../state";
import type { ViewContext } from "./registry";

/** Check and output view. This step: status, counts and findings; outputs follow. */
export function renderCheck({ state: s }: ViewContext): HTMLElement {
  const loaded = s.loaded;
  if (!loaded) return h("p", { class: "muted" }, t("import.noCatalog"));
  const c = counts(s);
  const cat = loaded.catalog;
  const title = resolveText(cat.catalog.title, s.language, cat.catalog.defaultLanguage)?.text ?? cat.catalog.id;
  const findings = [...loaded.loadDiagnostics.filter((d) => d.stage !== "selection" && d.stage !== "rights"), ...selectionDiagnostics(s)];

  return h(
    "section",
    { class: "card", "aria-labelledby": "check-h" },
    h("h2", { id: "check-h" }, t("tab.check")),
    h("p", null, h("strong", null, title)),
    h(
      "ul",
      { class: "counts" },
      h("li", null, t("summary.items", { n: c.items })),
      h("li", null, t("summary.modules", { n: c.modules })),
      h("li", null, t("summary.mandatory", { n: c.mandatory })),
    ),
    statusChips(currentStatus(s)),
    h("h3", null, t("diagnostics.title")),
    diagnosticsList(findings),
  );
}
