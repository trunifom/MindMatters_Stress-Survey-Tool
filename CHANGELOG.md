# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Schema-Versionen und Anwendungsversionen werden getrennt geführt.

## [Unveröffentlicht]

### Hinzugefügt
- Repository-Grundgerüst: `.gitignore`, README, Dokumentationsindex, Architektur, Entscheidungsprotokoll, Roadmap, Beitragsrichtlinien.
- JSON-Schema 0.3.0 (Katalog, Projekt) als strukturelle Umsetzung des ursprünglichen Datenvertrags.
- JSON-Schema 0.4.0: rein additive Erweiterung (Slider, Ranking, Notiz-Items, Textformate, zusammengesetzte Bedingungen, Export-Hinweise je Plattform, Sensitivitätsmarker, Einwilligung/Datenschutz, versteckte Felder u. a.).
- Beispielkatalog `examples/catalog_rich_0_4_0.json`.
- Test-Fixtures (11 Dateien, Schema 0.3.0) unter `tests/fixtures/v0.3.0/`.
- Python-Konformanztest (Fixtures, Beispiel, 35 Mutationen).
- Recherche zu den Importmöglichkeiten der Zielsysteme.
- TypeScript-Gerüst (Vitest, ajv, strict), Versionskonstanten.
- `src/core`: Diagnose-Typen (JSON-Pointer-Pfade), Limits und strikter JSON-Leser (doppelte Schlüssel, Grössen-/Tiefen-/Stringlimits, Zeile/Spalte in Fehlern). Diagnosecode-Register `docs/DIAGNOSECODES.md`.
- `src/core`: Versions-/Typ-Gate, Schema-Prüfung mit ajv (Draft 2020-12) mit stabilen Diagnosecodes, ausdrückliche Migration 0.3.0 → 0.4.0.
- `src/core`: semantische Prüfung Teil 1 – eindeutige IDs und Variablennamen, Verweisauflösung (gebündelt), Konstruktzyklen, Datumsreihenfolge, Sprachen (nicht deklariert, fehlende Übersetzung), Feature-Deklaration. Typmodell `src/core/types.ts`.
- `src/core`: semantische Prüfung Teil 2 – ordinale Antwortlisten, Wertebereiche, Erfüllbarkeit von Antworten (Mehrfachauswahl mit exklusiven Codes, Textlängen), Slider, Ranking, Widget-Kompatibilität.
- `src/core`: semantische Prüfung Teil 3 – Vorlage (jedes Item genau einmal), Bedingungen (Auslöser, Reihenfolge, Operator/Typ, Wert, Zyklen), Module, Scoring-Definitionen.

### Geändert
- `examples/catalog_rich_0_4_0.json`: Zahlenvergleich auf dem Slider statt auf einer Einfachauswahl (Validator-Befund); `mood_slider` ist vorausgewählt, weil ein vorausgewähltes Item davon abhängt.
- `src/model/selection.ts`: wirksame Pflichtmenge (inkl. Pflichtmodule), Anfangsauswahl, Sammelaktionen (Item, Modul, «alles abwählen» behält Pflichtmenge), Auswahlregeln (wholeScale, Teilskalen-Warnung, Module, Abhängigkeiten), Score-Verfügbarkeit, Projekt laden mit Pflichtergänzung und Meldung.
- `src/core/loader.ts`: Lade-Pipeline `loadCatalog`/`loadProject` (alles oder nichts, getrennte Prüfstatus, optionale ausdrückliche Migration) und `replaceCatalog` (transaktional, alter Zustand bleibt bei Fehler). Die Fixtures liefern genau die Befunde des Lieferberichts.
- `src/model/project.ts`: Projekt erzeugen (`createProject`), deterministisch serialisieren (`serializeProject`), neutraler Dateiname (`projectFileName`). Speichern ist trotz Konflikten erlaubt, Konflikte werden dokumentiert.
- Leistungstest T40 (`tests/unit/performance.test.ts`): 1.007 Items bei 5,12 MB werden auf dem Entwicklungsrechner in 1,36 s geladen und geprüft (Ziel 5 s; Referenzgerät offen).
- `docs/ABNAHMETESTS.md`: Rückverfolgbarkeit der 45 Abnahmetests (14 abgedeckt, 14 teilweise, 17 offen).

### Geändert
- Schema 0.4.0 (vor erster Auslieferung): `note`-Items haben `style` (`text`, `title`, `subtitle`, `notice`) für Titel, Untertitel, Textabschnitte und Hinweise (ADR-006). Beispielkatalog um Titel und Anonymitätshinweis erweitert.

### Hinzugefügt (Rechte)
- `src/model/rights.ts`: Rechte-Handlungsmatrix. Rechte werden pro ausgewähltem Item aufgelöst (Item → Instrument → unbekannt), Politik je Handlung (Anzeige, Projekt, Prüfbericht, Codebuch, nativer Export, Test-Export), Katalogstatus-Politik (draft, reviewed, released, withdrawn), Entwurfsvermerk, Rückzugshinweis, Pflicht-Attribution. Der Lader meldet den Rechtestatus; Rechtebeschränkungen machen einen Katalog nicht unbrauchbar.

### Hinzugefügt (Ausgaben)
- `src/output/codebook.ts`: Codebuch als Markdown (Auswahl in Fragebogenreihenfolge, Antwortcodes, Einschränkungen, Bedingungen, Quellen, Dimensionen, Textblöcke, dokumentierte Auswertung). Gesperrte Wortlaute erscheinen nie, Katalogtexte werden maskiert, Entwurfs- und Rückzugsvermerk, Schulnotizen nur auf ausdrückliche Wahl.
- `src/output/report.ts`: technischer Prüfbericht ohne Wortlaut, mit Zustands-Fingerabdruck (Erkennung veralteter Berichte) und Konfliktkennzeichnung.
- `src/core/localized.ts`: Textauflösung ohne stille Übersetzung.
- `docs/AUSGABEN.md`.

### Behoben
- Beschriftungen versteckter Felder galten fälschlich als Teilnehmertext (`MISSING_TRANSLATION`).
- `examples/catalog_rich_0_4_0.json` ist jetzt vollständig zweisprachig (en/de-CH).

### Hinzugefügt (Build)
- `tools/build.mjs`: Einzeldatei-Build `dist/mindmatters.html` (esbuild, ES2019, reproduzierbar, Prüfsumme), Vorlage `src/ui/index.html` mit Content-Security-Policy ohne Verbindungen. `npm run build`.
- `tsconfig.core.json`: Typprüfung von core, model, output ohne DOM.
- `src/core/clone.ts`: `structuredClone` ersetzt (fehlt in älteren Browsern).
- Build-Test (`tests/unit/build.test.ts`): keine externen Ressourcen, keine Netzwerk-API, CSP, ES2019, Prüfsumme, Reproduzierbarkeit.

### Hinzugefügt (Oberfläche, Teil 1)
- `src/ui`: Gerüst der Oberfläche ohne Framework. Sichere DOM-Hilfen (nur Text, nie HTML; nur http(s)-Links auf Klick; Textblöcke ohne HTML), Oberflächensprachen Deutsch/Englisch (vollständigkeitsgeprüft), Zustandsverwaltung ohne DOM (Laden, transaktionales Ersetzen, Migration nur auf ausdrücklichen Klick, Bestätigung vor Verwerfen ungesicherter Änderungen), Startseite, Katalogkopf mit Statuschips (Text und Symbol, nie nur Farbe), Entwurfs- und Rückzugsbanner, Befundliste, Skip-Link, sichtbarer Fokus, Hell/Dunkel.
- `loadProject` gibt das gelesene Projekt mit zurück.
- jsdom-Tests der Oberfläche (`tests/unit/ui`), statische Sicherheitsregel (kein innerHTML, eval, localStorage, fetch in `src/ui`).

### Hinzugefügt (Oberfläche, Teil 2)
- Fragen und Module: Auswahl per Checkbox (Standardumfang gesperrt und beschriftet, Pflichtmodul sperrt alle Mitglieder, optionale Ganzmodule schalten gemeinsam), Modulknöpfe, «Alles abwählen» behält den Standardumfang, Standardauswahl wiederherstellen, Zähler, Hinweise zur Auswahl (Teilskala, Abhängigkeit).
- Suche und Filter (Text, Titel, Tags, Dimension samt Unterdimensionen, Skala, Instrument, Modul; Auswahlumfang) ändern weder Auswahl noch Ausgabereihenfolge. Gesperrte Wortlaute sind nicht durchsuchbar.
- Gesperrte Texte (Rechte) erscheinen nur als ID mit Sperrhinweis, nirgends im DOM.
- Textblöcke (Titel, Untertitel, Text, Hinweis) als wählbare oder verpflichtende Einträge.
- Info-Fenster je Item und Modul: Abschnitte in der Reihenfolge der Spezifikation, «nicht dokumentiert» statt Raten, getrennte direkte und Instrumentquellen, wirksamer Bezugszeitraum mit Herkunft, wirksame Anweisung, Rechte mit Herkunft, Exportbesonderheiten. Modal mit Fokusführung, Escape, Tab-Falle, Fokus zurück zum Auslöser.
- Statuschips im Kopfbereich auf jedem Tab.

### Behoben
- Typmodell um Felder ergänzt, die das Info-Fenster anzeigt (Quellen, Rechte-Details, Instrument- und Item-Zusatzfelder).
