# src/ui: Oberfläche

Die Oberfläche des Konfigurators. Sie zeichnet den Zustand der Anwendung als DOM und übersetzt Klicks in Aktionen. Sie entscheidet **nichts** selbst: Auswahlregeln kommen aus `src/model`, Prüfungen aus `src/core`, Dateien aus `src/output`. Aus `src/ui/main.ts` entsteht per Build (`tools/build.mjs`) die eine Datei `dist/mindmatters.html`. Gesamtbild: [../../docs/ARCHITEKTUR.md](../../docs/ARCHITEKTUR.md).

## Dateien

| Datei | Aufgabe |
|---|---|
| `main.ts` | Einstiegspunkt des Browser-Builds: Store anlegen, App einhängen, globale Fehlerbehandlung, Rückfrage beim Schliessen mit ungespeicherten Änderungen (T42). Enthält keine Logik. |
| `app.ts` | Rahmen: zeichnet Kopf, Statusanzeige, Meldungen und den aktiven Tab bei jeder Zustandsänderung neu, erhält Fokus und Cursor, hält den Fokus im Info-Fenster. Fängt eine Ansicht ab, die beim Zeichnen wirft (Absturzpanel). |
| `state.ts` | Zustand (`AppState`) und alle Aktionen als Funktionen `(store, …) => void`. Hier lebt die Auswahl, nie in den Checkboxen. Lädt Kataloge und Projekte über `core/loader` und baut bei Textanpassungen den abgeleiteten Katalog neu. Kein DOM, in Node testbar. |
| `content.ts` | Darstellungslogik für alle Ansichten: welcher Text zu einem Item gezeigt werden darf (gesperrt, Text, fehlt), Bedingungen als Zeile, Suche und Filter. Kein DOM. |
| `dom.ts` | Kleine DOM-Helfer (`h`, `richText`, Download, sicherer Datei-Leser). Bietet bewusst keinen Weg, HTML einzufügen. |
| `components.ts` | Wiederverwendete Bausteine: Statuschips, Schweregrad-Badge, Befundliste, Banner. Status wird immer mit Text **und** Symbol gezeigt. |
| `errors.ts` | Fehlerbehandlung in drei Schichten (`guarded`, globale Handler, Absturzpanel) und `FileProblem` für unlesbare Dateien. Beschreibung für Nutzer: [../../docs/FEHLERBEHANDLUNG.md](../../docs/FEHLERBEHANDLUNG.md). |
| `i18n.ts` | Texte der Oberfläche auf Deutsch und Englisch (siehe auch [../i18n/README.md](../i18n/README.md)). |
| `prefs.ts` | Hell/Dunkel und Schriftgrösse, mit Systemvorgabe. Wird nirgends gespeichert. |
| `index.html`, `styles.css` | Vorlage der Seite (mit Content-Security-Policy) und das Stylesheet; beides wird in den Build eingebettet. |
| `views/registry.ts` | Die Tabs als Daten (`VIEWS`). |
| `views/start.ts` | Startbildschirm vor dem Laden: Zweck, Grenzen, vier Schritte, unterstützte Zielsysteme mit Stufe, Dateiablage, Ergebnis eines fehlgeschlagenen Imports und Migrationsangebot. |
| `views/items.ts` | Tab «Fragen und Module»: Suche, Filter, Auswahl, Modulgruppen, Antwortvorschau, Info-Knöpfe. |
| `views/structure.ts` | Tab «Reihenfolge»: Blöcke und Fragen verschieben, nur wo der Katalog es erlaubt. |
| `views/texts.ts` | Tab «Texte anpassen»: Texte und Textblöcke des Katalogs anpassen, eigene Textblöcke einfügen. |
| `views/preview.ts` | Tab «Vorschau»: Fragebogen in Fragebogenreihenfolge, alle Steuerelemente deaktiviert. Liefert auch die Antwortvorschau für die Fragenliste. |
| `views/check.ts` | Tab «Prüfung und Ausgabe»: Befunde, Übersicht nach Skala, Projektangaben, Download von ZIP-Paket, Projektdatei, Prüfbericht und Codebuch, Rechte je Handlung, Exportübersicht je Zielsystem mit Zuordnungsbericht. Einzige Stelle der Oberfläche, die Dateien erzeugt. |
| `views/info.ts` | Info-Fenster zu Item, Modul, Skala oder Konstrukt (A09). |

## Datenfluss

```
Datei (Katalog/Projekt)
  → app.ts / start.ts (File-Input, Ablage)  → dom.readFileText (Prüfung auf Text, UTF-8, Grösse)
  → state.loadCatalogText / loadProjectText → core/loader (strikter Leser, Schema, Semantik, Anfangsauswahl)
  → Store (AppState)                         ← Aktionen der Ansichten (toggleItem, setCustomText, moveItem, …)
  → app.render() → Ansicht aus VIEWS → DOM
  → check.ts → output/* (nur nach model/rights.evaluateAction) → Download
```

Der Zustand hält **zwei Kataloge**: `loaded.base` (genau wie gelesen) und `loaded.catalog` (mit den Anpassungen der Schule, abgeleitet durch `model/customize.applyCustomization`). Ansichten und Exporte lesen nur `loaded.catalog`, so kann der Wortlaut in Vorschau und Export nicht auseinanderlaufen. `base` wird nie verändert.

## Regeln und Invarianten

- **Nie HTML einfügen.** Katalogtext geht immer als Textknoten in die Seite. Ein Test verbietet `innerHTML`, `outerHTML`, `insertAdjacentHTML`, `document.write` und `eval` unter `src/ui` (T41).
- **Nichts speichern.** Kein `localStorage`, `sessionStorage`, IndexedDB; Hell/Dunkel und Schrift gelten nur für den Besuch (ADR-009). Ebenso kein Netzwerkzugriff; der Build prüft das.
- **Gesperrte Texte bleiben gesperrt.** Wortlaut eines Items nur, wenn `displayItems` erlaubt ist (`content.itemText`). Auch die Suche darf gesperrten Text nicht verraten.
- **Fehlende Sprache nicht still ersetzen.** Die Vorschau markiert sie (`fallback`), Exporte brechen ab.
- **Die Auswahl lebt im Zustand.** Checkbox und DOM zeigen sie nur an. Auswahländerungen laufen über `model/selection` (Pflichtmenge, allOrNothing-Module).
- **Fehler nie verschlucken.** Jede Nutzeraktion mit möglichem Fehler läuft in `guarded`; ein Fehler wird zur sichtbaren Meldung, der Zustand bleibt unverändert. Ein misslungener Import lässt den alten gültigen Zustand stehen (T04, T42).
- **Ansichten ohne Geschäftslogik.** Was eine Ansicht berechnet, gehört in `content.ts`, `state.ts` oder `src/model`.
- **Status nie nur mit Farbe.** Immer Text und Symbol (Barrierefreiheit).
- Die Abhängigkeit geht von `ui` nach `model`, `core` und `output`, nie umgekehrt.

## Etwas ergänzen

- **Neuer Tab:** `views/<name>.ts` mit `render<Name>(ctx: ViewContext)`, Id in `View` (`state.ts`) aufnehmen, Texte `tab.<id>` und `view.<id>.intro` in `i18n.ts` in beiden Sprachen, eine Zeile in `VIEWS` (`views/registry.ts`). Der Rahmen bleibt unverändert.
- **Neue Aktion:** Funktion in `state.ts`, die nur `store.set(...)` aufruft (Regeln gehören nach `src/model`). Verändert sie die Projektdatei, `dirty: true` setzen.
- **Neuer Text:** Schlüssel in `DE` und `EN` von `i18n.ts`. Fehlt eine Sprache, übersetzt der Code nicht.
- **Neues Steuerelement mit Fokus:** `data-focus="<eindeutige id>"` setzen, damit `app.ts` Fokus und Cursor nach dem Neuzeichnen wiederherstellt.
- **Neuer Export in der Oberfläche:** nichts hier ändern; er erscheint automatisch, sobald er in `src/output/registry.ts` steht (siehe [../output/README.md](../output/README.md)).

## Tests

`tests/unit/ui/` (Vitest mit jsdom): `shell.test.ts` (Start, Laden, Migration, Schliessen, Sprache), `items.test.ts` (Liste, Filter, Sperrtexte, Info-Fenster), `preview.test.ts`, `newfeatures.test.ts` (Startseite, Darstellung, Textanpassung, Reihenfolge), `output.test.ts` (Ausgabe-Tab), `errors.test.ts` (Fehlerbehandlung). Gemeinsame Helfer: `tests/unit/ui/helpers.ts`. Echter Browser gegen das gebaute HTML: `tests/e2e/browser.test.ts`.
