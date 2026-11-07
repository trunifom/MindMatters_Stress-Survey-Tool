/**
 * UI texts (German and English). Catalog content is never translated here:
 * only the application's own labels. Keys are shared, so a missing translation
 * is a compile error. Placeholders look like {name}.
 */

const DE = {
  "app.title": "MindMatters Fragebogen-Konfigurator",
  "app.tagline": "Fragebogen aus einem Katalog zusammenstellen, prüfen und für Umfragetools vorbereiten. Alles läuft in Ihrem Browser.",
  "skip": "Zum Inhalt springen",
  "start.purpose": "Laden Sie einen Fragekatalog (JSON-Datei). Danach wählen Sie die Fragen und Module aus, die in Ihrer Befragung vorkommen sollen. Der Standardumfang ist fest vorgegeben und kann nicht abgewählt werden.",
  "start.steps": "Ablauf",
  "start.step1": "Laden",
  "start.step2": "Auswählen",
  "start.step3": "Prüfen",
  "start.step4": "Ausgeben",
  "start.load": "Katalog laden (JSON)",
  "start.loadHint": "Wählen Sie die Katalogdatei auf Ihrem Gerät aus.",
  "start.privacy": "Datenschutz: Die Datei wird nur in diesem Browser gelesen. Es wird nichts hochgeladen, nichts gespeichert und es werden keine Antworten erhoben.",
  "start.schemas": "Unterstützte Katalogversion: {versions}. Programmversion {app}.",
  "import.rejected": "Die Datei wurde nicht übernommen.",
  "import.kept": "Der bisher geladene Katalog bleibt unverändert.",
  "import.noCatalog": "Es ist noch kein Katalog geladen.",
  "import.details": "Details zur Fehleranalyse",
  "import.migrationTitle": "Ältere Katalogversion",
  "import.migrationText": "Diese Datei verwendet Schema {from}. Sie kann ausdrücklich nach {to} übernommen werden (rein additiv, Inhalt bleibt unverändert). Das geschieht nie automatisch.",
  "import.migrate": "Auf {to} übernehmen und laden",
  "import.cancel": "Abbrechen",
  "import.readError": "Die Datei konnte nicht gelesen werden.",
  "confirm.replaceUnsaved": "Es gibt ungesicherte Änderungen an der Auswahl. Beim Laden gehen sie verloren. Fortfahren?",
  "header.catalog": "Katalog",
  "header.id": "Katalog-ID",
  "header.version": "Version",
  "header.status": "Status",
  "header.publisher": "Herausgeber",
  "header.language": "Sprache der Fragen",
  "header.uiLanguage": "Oberfläche",
  "header.newCatalog": "Anderen Katalog laden",
  "header.loadProject": "Projekt laden",
  "banner.draft": "Entwurf – nicht für produktive Durchführung freigegeben.",
  "banner.withdrawn": "Zurückgezogen: Der Herausgeber hat diesen Katalog zurückgezogen. Nicht für neue Befragungen verwenden.",
  "status.technical": "Technische Gültigkeit",
  "status.selection": "Auswahl",
  "status.rights": "Rechte und Freigabe",
  "status.export": "Zielsystem",
  "status.pass": "in Ordnung",
  "status.warning": "mit Hinweisen",
  "status.fail": "fehlerhaft",
  "status.notRun": "nicht geprüft",
  "sev.error": "Fehler",
  "sev.warning": "Hinweis",
  "sev.info": "Information",
  "summary.items": "{n} Items ausgewählt",
  "summary.modules": "{n} Module enthalten",
  "summary.mandatory": "{n} Pflichtbestandteile",
  "diagnostics.title": "Befunde",
  "diagnostics.none": "Keine Befunde.",
  "diagnostics.path": "Stelle",
  "project.loaded": "Projekt geladen.",
  "project.added": "{n} fehlende Pflichtitems wurden ergänzt: {ids}",
  "project.conflicts": "Das Projekt enthält ungelöste Konflikte. Sie werden nicht automatisch repariert.",
  "project.mismatch": "Das Projekt gehört zu einem anderen Katalog oder einer anderen Version und wurde nicht übernommen.",
  "tab.items": "Fragen und Module",
  "tab.preview": "Vorschau",
  "tab.check": "Prüfung und Ausgabe",
  "tabs.label": "Ansichten",
  "notice.label": "Meldungen",
} as const;

type Key = keyof typeof DE;

const EN: Record<Key, string> = {
  "app.title": "MindMatters questionnaire configurator",
  "app.tagline": "Assemble a questionnaire from a catalog, check it and prepare it for survey tools. Everything runs in your browser.",
  "skip": "Skip to content",
  "start.purpose": "Load a question catalog (JSON file). Then choose the questions and modules for your survey. The standard scope is fixed and cannot be deselected.",
  "start.steps": "Steps",
  "start.step1": "Load",
  "start.step2": "Select",
  "start.step3": "Check",
  "start.step4": "Output",
  "start.load": "Load catalog (JSON)",
  "start.loadHint": "Choose the catalog file on your device.",
  "start.privacy": "Privacy: the file is only read in this browser. Nothing is uploaded, nothing is stored and no answers are collected.",
  "start.schemas": "Supported catalog version: {versions}. Program version {app}.",
  "import.rejected": "The file was not accepted.",
  "import.kept": "The previously loaded catalog is unchanged.",
  "import.noCatalog": "No catalog is loaded yet.",
  "import.details": "Details for error analysis",
  "import.migrationTitle": "Older catalog version",
  "import.migrationText": "This file uses schema {from}. It can be taken over explicitly as {to} (purely additive, content unchanged). This never happens automatically.",
  "import.migrate": "Take over as {to} and load",
  "import.cancel": "Cancel",
  "import.readError": "The file could not be read.",
  "confirm.replaceUnsaved": "There are unsaved changes to the selection. They will be lost when loading. Continue?",
  "header.catalog": "Catalog",
  "header.id": "Catalog ID",
  "header.version": "Version",
  "header.status": "Status",
  "header.publisher": "Publisher",
  "header.language": "Language of the questions",
  "header.uiLanguage": "Interface",
  "header.newCatalog": "Load another catalog",
  "header.loadProject": "Load project",
  "banner.draft": "Draft – not released for productive use.",
  "banner.withdrawn": "Withdrawn: the publisher has withdrawn this catalog. Do not use for new surveys.",
  "status.technical": "Technical validity",
  "status.selection": "Selection",
  "status.rights": "Rights and release",
  "status.export": "Target system",
  "status.pass": "OK",
  "status.warning": "with notes",
  "status.fail": "faulty",
  "status.notRun": "not checked",
  "sev.error": "Error",
  "sev.warning": "Note",
  "sev.info": "Information",
  "summary.items": "{n} items selected",
  "summary.modules": "{n} modules included",
  "summary.mandatory": "{n} mandatory parts",
  "diagnostics.title": "Findings",
  "diagnostics.none": "No findings.",
  "diagnostics.path": "Location",
  "project.loaded": "Project loaded.",
  "project.added": "{n} missing mandatory items were added: {ids}",
  "project.conflicts": "The project contains unresolved conflicts. They are not repaired automatically.",
  "project.mismatch": "The project belongs to another catalog or version and was not taken over.",
  "tab.items": "Questions and modules",
  "tab.preview": "Preview",
  "tab.check": "Check and output",
  "tabs.label": "Views",
  "notice.label": "Messages",
};

export type UiLang = "de" | "en";
export type TextKey = Key;

const dictionaries: Record<UiLang, Record<Key, string>> = { de: DE, en: EN };
let current: UiLang = "de";

export function setUiLang(l: UiLang): void {
  current = l;
}
export function getUiLang(): UiLang {
  return current;
}

/** Initial UI language from the browser, German by default. */
export function detectUiLang(navigatorLanguage: string | undefined): UiLang {
  return navigatorLanguage && navigatorLanguage.toLowerCase().startsWith("en") ? "en" : "de";
}

export function t(key: Key, params?: Record<string, string | number>): string {
  const s = dictionaries[current][key];
  return params ? s.replace(/\{(\w+)\}/g, (_m, k: string) => String(params[k] ?? `{${k}}`)) : s;
}

export function allKeys(): Key[] {
  return Object.keys(DE) as Key[];
}
