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

### Hinzugefügt (Oberfläche, Teil 3)
- Vorschau: gewählte Items in Fragebogenreihenfolge mit Einleitung, Einwilligung, Datenschutz, Hilfsangeboten und Schlusstext. Textblöcke (Titel, Untertitel, Text, Hinweis mit Aufzählung) als echte Elemente. Alle Antworttypen mit ihren Grenzen (Auswahl, Mehrfachauswahl mit Hinweis, Zahl, Text, Datum, Slider, Ranking, Dropdown), Pflicht- und Freiwillig-Kennzeichnung, Bedingungen als Strukturhinweis, Zufallsreihenfolge als Hinweis, Warnung und Hilfe bei sensiblen Items, Matrix für Items mit gemeinsamen Antworten.
- Alle Steuerelemente sind gesperrt, es gibt kein Formular: Es werden keine Antworten erfasst oder gespeichert.
- Leere Abschnitte entfallen mit ihrer Anweisung. Gesperrte Items erscheinen nur als Platzhalter mit ID. Fehlende Übersetzungen werden markiert statt still gemischt.

### Behoben
- Die Matrixdarstellung konnte Inhalte eines Items verschlucken (Warnung eines sensiblen Items, Anweisung, Hilfe, Bedingung). Solche Items werden jetzt als Liste gezeigt.
- Beispielkatalog: Matrixabschnitt mit drei gleichartigen Items, das sensible Item steht eigenständig.

### Hinzugefügt (Oberfläche, Teil 4: Ausgaben)
- Tab «Prüfung und Ausgabe»: Angaben zum Projekt (Schulbezeichnung, Zielsystem-Vermerk, interne Notizen, ausdrücklich «nur lokal»), Projekt speichern (auch mit Konflikten, ohne Reparatur), Prüfbericht speichern (ohne Wortlaut, mit Erkennung eines veralteten Berichts, Konfliktkennzeichnung), Codebuch speichern (Sprache der Fragen, Entwurfs- und Rückzugsvermerk, gesperrte Wortlaute fehlen und werden benannt, Schulnotizen nur auf ausdrückliche Wahl).
- Übersicht der Rechtefolgen je Handlung mit Begründung; Export-Übersicht mit allen geplanten Zielsystemen. Die Export-Tasten sind gesperrt, bis ein geprüfter Adapter existiert.
- Hinweis «Ungesicherte Änderungen» im Kopfbereich und Warnung des Browsers beim Schliessen oder Neuladen mit ungesicherten Änderungen.
- `docs/BENUTZERHANDBUCH.md`.

### Hinzugefügt (Browsernachweis)
- Browser-Tests (`tests/e2e/browser.test.ts`, `npm run test:e2e`): die gebaute Datei per `file://` in einem installierten Chromium-Browser (Edge 156 geprüft), ohne Download eines Browsers. 11 Tests: offline und ohne Netzwerkanfrage, Content-Security-Policy greift, Tastaturablauf mit sichtbarem Fokus, echte Downloads von Projekt, Prüfbericht und Codebuch, Projekt wieder laden, Rückfrage bei ungesicherten Änderungen, inerte Skripte in Katalogtexten, Handybreite ohne horizontales Scrollen, Hell/Dunkel, 5 MB und 1.010 Items nach 749 ms.
- `docs/BROWSER.md`: trennt belegte von nicht belegten Browsern.

### Behoben
- Auf einem Handy (375 px) verbreiterte die Matrix der Vorschau die ganze Seite um 152 px. Die Tabelle scrollt jetzt in einem eigenen, per Tastatur erreichbaren Bereich.

### Hinzugefügt (M5: LimeSurvey-Export)
- Adapter `src/output/limesurvey.ts`: tab-getrennte Strukturdatei (14 Spalten, Klassen S, SL, G, Q, SQ, A, Attributspalten), regulärer Export und gekennzeichneter Testexport. Gesperrt durch Rechtematrix, Katalogstatus und Auswahlkonflikte. Eine Sprache pro Datei; fehlender Text, unzulässiger oder doppelter Code, nicht ausdrückbare Bedingung sind Fehler, nie stille Änderungen. Texte werden so maskiert, dass keine Zelle Escape-Regeln braucht.
- Gemeinsamer Zuordnungsbericht (`src/output/mapping.ts`): je Merkmal `exact`, `transformed`, `manual` oder `unsupported`, dazu die Liste ungeprüfter Annahmen über das Zielsystem.
- Oberfläche: Tasten für regulären und Testexport, Begründung bei gesperrtem Export, aufklappbare Zuordnung mit Annahmen. Die Übersicht trennt «Adapter vorhanden, an echter Instanz ungetestet» von «geplant».
- Schema 0.4.0: `Option.exportHints.<plattform>.code` für Zielsysteme mit anderen Coderegeln (ADR-007). Das Beispiel enthält LimeSurvey-Namen und -Codes.
- Diagnosecodes der Stufe `export`, `docs/LIMESURVEY.md` (Zuordnung, Regeln, belegte und unbelegte Annahmen, Importtest), ADR-007.
- Tests: 29 neue Unit-Tests (Adapter, UI), 1 Browser-Test (echter Download mit Byte-Order-Mark), 2 Schema-Mutationen.
- **Nicht belegt:** Import in eine echte LimeSurvey-Instanz.

### Hinzugefügt (M6: Qualtrics-Export)
- Adapter `src/output/qualtrics.ts`: TXT im Advanced Format (Blöcke je Abschnitt, Einfach- und Mehrfachauswahl mit ganzzahligen Recodes, Rangfolge, Text, Textblöcke, Embedded Data aus versteckten Feldern). Dieselben Zugangsregeln und Grundsätze wie bei LimeSurvey. Das Format kann keine Bedingungen und keinen Slider: beide sind Fehler (`EXPORT_CONDITION_UNSUPPORTED`, `EXPORT_RESPONSE_UNSUPPORTED`), Pflichtantworten und Validierung stehen als «von Hand» im Zuordnungsbericht.
- `docs/QUALTRICS.md` mit belegten und unbelegten Quellenaussagen und Importtest-Anleitung. Neue Diagnosecodes `EXPORT_TEXT_RESERVED`, `EXPORT_RESPONSE_UNSUPPORTED`, `EXPORT_HIDDEN_FIELD_INVALID`.
- Oberfläche: Exportbereich je Plattform mit eigenen Element-IDs. Bei gesperrtem regulärem Export werden auch die Gründe des Testexports gezeigt. `Option.exportHints.qualtrics.code` im Beispielkatalog.
- 20 neue Unit-Tests. **Nicht belegt:** Import in eine echte Qualtrics-Instanz.

### Hinzugefügt (M6, Fortsetzung: Prototypen für alle Zielsysteme, ADR-008)
- Prototypen, in der Oberfläche als «Prototyp, ungeprüft» gekennzeichnet: **REDCap** (Datenwörterbuch-CSV, 18 Spalten, Verzweigungslogik, Slider nur 0 bis 100), **Google Forms** (Apps-Script, Katalogtexte nur in Zeichenkettenliteralen), **Unipark** und **SurveyMonkey** (Bauplan als Markdown mit Typnamen, Codes, Grenzen und Bedingungen als Satz, SurveyMonkey mit Einfügetext). Dazu die **neutrale Tabelle** (CSV, Schutz vor Formeleinschleusung).
- `src/output/adapterBase.ts` (gemeinsamer Start: Rechte, Auswahl, Sprache, Fehlerhilfe), `src/output/plain.ts`, `docs/PROTOTYPEN.md`, ADR-008.
- Oberfläche: sieben Exportblöcke mit Stufenangabe je Ziel und Begründung, warum ein Export nicht möglich ist.
- 27 neue Tests, darunter ein Ausführungstest des Google-Skripts mit feindlichem Text. **Nicht belegt:** jedes Zielsystem.

### Hinzugefügt (Verbesserungen, siehe docs/IDEEN.md)
- **ZIP-Paket** (`src/output/zip.ts`, `package.ts`, `registry.ts`): Projekt, Prüfbericht, Codebuch, alle möglichen Ausgaben und `LIESMICH.txt` mit den nicht möglichen Ausgaben samt Gründen. ZIP ohne Bibliothek (stored, UTF-8-Namen, CRC32), gegen Pythons `zipfile` geprüft.
- **Auswahl nach Skala** und **dokumentierte Bearbeitungszeit** (nur belegte Werte, nie geschätzt) im Tab «Prüfung und Ausgabe».
- **Druckansicht** (`@media print`): ohne Bedienelemente, Links mit Adresse.
- **Kein `unsafe-eval` mehr:** Schema-Prüfer werden beim Build erzeugt (`tools/gen-validators.mjs`, ajv standalone). Die Content-Security-Policy erlaubt nur noch `script-src 'unsafe-inline'`. Paritätstest gegen die Laufzeit-Prüfer, Test auf `eval` in Bundle und Richtlinie, Browser-Tests grün.
- `docs/IDEEN.md`: alle Ideen mit Nutzen, Aufwand und Stand.
- 25 neue Unit-Tests und 2 Browser-Tests (ZIP-Download, Druckmodus). Die Datei ist von 370 auf rund 525 KiB gewachsen, weil erzeugte Prüffunktionen mehr Platz brauchen als die Laufzeit-Variante (Verbesserung D4 offen).

