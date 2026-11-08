# src/model: Auswahl, Rechte, Projekt, Anpassung

Die Fachregeln der Anwendung ohne Oberfläche und ohne Browser: wer was auswählen darf, was angezeigt oder ausgegeben werden darf, wie eine Projektdatei entsteht und wie die Schule Texte anpasst. Alles sind reine Funktionen auf unveränderten Daten. Abhängigkeiten: nur `src/core` (Typen, Diagnosen, Strukturprüfung). Gesamtbild: [../../docs/ARCHITEKTUR.md](../../docs/ARCHITEKTUR.md), Entscheidungen: [../../docs/ENTSCHEIDUNGEN.md](../../docs/ENTSCHEIDUNGEN.md).

Hinweis zur Schichtung: `core/loader.ts` ruft `model` auf (Rechte, Anpassung, Auswahl), weil das Laden die Anfangsauswahl und die Auswahl eines Projekts beurteilt. `model` greift sonst nur auf Typen, Diagnosen und `core/structure` zurück.

## Dateien

| Datei | Aufgabe |
|---|---|
| `selection.ts` | Auswahlmodell. Wirksame Pflichtmenge (`mandatorySet`: `inclusionRequired`-Items plus alle Items eines verpflichtenden allOrNothing-Moduls), Anfangsauswahl, `setItem`/`setModule`/`clearOptional`, Prüfung einer Auswahl (`checkSelection`: fehlende Pflichtitems, teilweise Skalen und Module, Abhängigkeiten), Übersicht nach Skala, dokumentierte Dauer, verfügbare Scores, `applyProject`. |
| `rights.ts` | Rechte und Handlungsmatrix. `evaluateAction(catalog, action, {selection})` entscheidet je Handlung (`displayItems`, `saveProject`, `saveCheckReport`, `codebookWithTexts`, `nativeExport`, `devTestExport`), ob sie vollständig laufen darf. Löst wirksame Rechte je Item auf (Item, sonst Instrument, sonst unbekannt) und wendet die Katalogstatus-Regeln an. |
| `project.ts` | Projektdatei schreiben: `createProject`, `serializeProject`, `projectFileName`. Gelesen wird sie von `core/loader.loadProject`. |
| `customize.ts` | Anpassungen der Schule (ADR-009). `applyCustomization(base, customization)` baut daraus im Speicher einen abgeleiteten Katalog: angepasste Texte, angepasste Textblöcke, neue Reihenfolge, eigene Textblöcke. |

## Datenfluss

```
Katalog (core/loader) ──► initialSelection ──► Auswahl im Zustand (ui/state)
                                   │
Projekt-JSON ──► core/loader.loadProject ──► applyCustomization ──► applyProject (nur fehlende Pflichtitems ergänzen)
                                                   │
                                                   ▼
                                abgeleiteter Katalog (loaded.catalog) ──► Ansichten, Exporte
                                                   │
                       evaluateAction(…) ◄──────── output/adapterBase.openAdapter, ui/content.displayDecision
```

## Regeln und Invarianten

- **Ein Pflichtmengen-Begriff überall.** `mandatorySet` gilt beim Start, bei Sammelaktionen, beim Laden eines Projekts und vor jedem Export. «Alles abwählen» (`clearOptional`) behält die Pflichtmenge (T10).
- **Auswahl in Fragebogenreihenfolge.** `orderedSelection` liefert nie die Klickreihenfolge.
- **Nichts still reparieren.** Beim Laden eines Projekts werden nur fehlende Pflichtitems ergänzt, und zwar gemeldet (`addedMandatory`). Jeder andere Widerspruch bleibt als bearbeitbarer Zwischenstand mit Befund stehen.
- **Rechte sind eine Produktregel, keine Rechtsauskunft.** Ohne bestätigtes `permitted` und geprüftes Profil bleibt der Text gesperrt und der Export gesperrt; «unbekannt» gilt nie als erlaubt. Ein Recht, das eine Handlung nicht braucht, blockiert sie auch nicht (`modification: prohibited` verhindert die unveränderte Nutzung nicht).
- **Katalogstatus.** Regulärer Export nur bei `released`; `draft` bekommt einen Entwurfsvermerk; `withdrawn` sperrt Exporte und verlangt einen Rückzugshinweis. Ein Entwicklungs-Testexport umgeht nie ein Verbot.
- **Projektdatei enthält nur Verweise.** Exakte Katalog-ID und -Version, Fragebogen-ID, Sprache, ausgewählte Item-IDs, optional Schulbezeichnung, Notizen und die eigenen Texte der Schule. Nie den Wortlaut des Katalogs. Der Dateiname enthält nur Katalog-ID und Version, nie Schulbezeichnung oder Notizen (C10).
- **Der Katalog wird nie verändert.** `applyCustomization` arbeitet auf einer tiefen Kopie und liefert ohne Anpassung dasselbe Objekt zurück. Gesperrte Texte (`lockedTexts`, `lockedNotes`) werden nicht angepasst, sondern gemeldet (`CUSTOM_TEXT_LOCKED`, `CUSTOM_NOTE_LOCKED`). Fragen und Antwortoptionen sind nie anpassbar.
- **Reihenfolge nur, wo der Katalog es erlaubt** (`Section.reorder`, standardmässig falsch). Eine Verschiebung, die den Auslöser einer Bedingung hinter das abhängige Item setzt, wird abgelehnt (`CUSTOM_ORDER_CONDITION`).
- **Eigene Blöcke** sind `note`-Items mit `origin: "own"` und eigenem Rechteprofil `rights_custom_text`. Ein Block mit unbekanntem Abschnitt oder belegter ID wird übersprungen und gemeldet; ein unbekannter Ankerpunkt setzt ihn an den Abschnittsanfang, mit Warnung.
- **Dauer und Scores werden nie geschätzt.** Nur dokumentierte Zeiten vollständig gewählter Instrumente zählen, der Rest ist «unbekannt», nicht null. Ein Score gilt nur als verfügbar, wenn alle seine Items gewählt sind.

## Etwas ergänzen

- **Neue Handlung in der Rechtematrix:** in `rights.ts` den Typ `Action` und die Tabelle `NEEDS` (nötige Rechte) ergänzen und im Test `tests/unit/rights.test.ts` festhalten. Danach in den Ausgaben (`src/output`) verwenden.
- **Neuer anpassbarer Text:** Schlüssel in `CUSTOMIZABLE_TEXTS` (`core/types.ts`) aufnehmen, `baseText` und `setOverride` in `customize.ts` ergänzen, Schema `0.4.0` (Projekt) und die Ansicht `ui/views/texts.ts` nachziehen.
- **Neue Auswahlregel:** in `checkSelection` einen Befund mit stabilem Code ergänzen und in [../../docs/DIAGNOSECODES.md](../../docs/DIAGNOSECODES.md) eintragen.

## Tests

`tests/unit/selection.test.ts` (Pflichtmenge, Anfangsauswahl, Aktionen, Regeln, Scores, Projekte), `tests/unit/rights.test.ts` (Rechtematrix, T35, T36), `tests/unit/project.test.ts` (Projektdatei, Rundlauf, Dateiname), `tests/unit/customize.test.ts` (Anpassung, Textblöcke, Reihenfolge, Projektdatei und Paket mit Anpassung), `tests/unit/overview.test.ts` (Übersicht nach Skala, Dauer).
