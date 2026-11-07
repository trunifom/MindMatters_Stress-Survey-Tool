# Abnahmetests: Rückverfolgbarkeit

Die 45 Abnahmetests T01–T45 stammen aus den Ausgangsunterlagen (lokal, nicht im Repo). Diese Tabelle zeigt, welcher automatische Test den jeweiligen Punkt belegt. Sie ist die einzige Stelle, die den Stand ehrlich ausweist: **«abgedeckt»** heisst, der Test läuft und besteht auf dem Entwicklungsrechner. **«teilweise»** heisst, die Datenseite (Validator, Modell) ist getestet, die Benutzeroberfläche oder der Export fehlt noch. **«offen»** heisst, nichts davon existiert.

Stand: 7. November 2026 · 439 Unit-Tests (davon UI unter jsdom) · 11 Browser-Tests (Edge 156) (Vitest) · 60 Konformanzprüfungen (Python)

| ID | Test | Stand | Nachweis / fehlender Teil |
|---|---|---|---|
| T01 | HTML ohne Netz öffnen | abgedeckt (Edge) | `tests/e2e/browser.test.ts`: Datei per `file://` bei abgeschaltetem Netz, Katalog laden, alle Ansichten; nur in Edge 156 belegt, siehe BROWSER.md |
| T02 | Netzwerkprotokoll | abgedeckt (Edge) | `tests/e2e/browser.test.ts`: nur `file:`/`data:`/`blob:`-Anfragen aufgezeichnet, CSP weist `fetch` mit `connect-src` ab; nur in Edge 156 belegt |
| T03 | unterstützte Browser | teilweise | nur Edge 156 (Chromium, headless) belegt; Firefox, Safari, Chrome und ältere Versionen nicht getestet, siehe BROWSER.md |
| T04 | Syntaxfehler, doppelte Schlüssel, alter Zustand bleibt | abgedeckt | `strictJson.test.ts`, `pipeline.test.ts` (Transaktion) |
| T05 | ungültige IDs/Referenzen | abgedeckt | `schemaCheck.test.ts`, `semanticRegisters.test.ts`, `ui/shell.test.ts`: Code und Stelle werden im Importergebnis angezeigt |
| T06 | falsche `schemaVersion` | abgedeckt | `schemaCheck.test.ts`, `pipeline.test.ts` |
| T07 | unbekanntes kritisches Feature | teilweise | Validator blockiert (`UNKNOWN_FEATURE`); Sperre der Oberfläche fehlt |
| T08 | unbekannte reine Metadaten | teilweise | bleiben im geladenen Katalog, keine Ausführung; Zusatzansicht fehlt |
| T09 | vier Pflichtkombinationen | teilweise | Aufnahmepflicht im Modell getestet; Antwortpflicht-Verhalten gehört zur Oberfläche |
| T10 | Sammelabwahl mit Filter | abgedeckt | `selection.test.ts`, `ui/items.test.ts`: Pflichtmenge bleibt bei «Alles abwählen» auch mit aktivem Filter |
| T11 | Pflichtmodul mit Item-Flags false | abgedeckt | `selection.test.ts` |
| T12 | Projekt lässt Pflichtmodul weg | abgedeckt | `selection.test.ts`: 10 Items ergänzt und gemeldet |
| T13 | Pflichtitem in optionalem Ganzmodul | abgedeckt | `semanticStructure.test.ts` |
| T14 | ungültige Standardauswahl | abgedeckt | `selection.test.ts`, `pipeline.test.ts` |
| T15 | versteckte antwortpflichtige Frage | teilweise | Vorschau zeigt Pflicht und Sichtbarkeitsbedingung getrennt (`ui/preview.test.ts`); eine Laufzeitlogik gibt es nicht, weil das Tool keine Antworten erfasst. Umsetzung im Zielsystem folgt mit den Adaptern |
| T16 | `allOrNothing` schalten | abgedeckt | `selection.test.ts` |
| T17 | `wholeScale` teilweise | abgedeckt | `selection.test.ts` (`SCALE_PARTIAL_NOT_ALLOWED`) |
| T18 | `partialWithWarning` teilweise | abgedeckt | `selection.test.ts` (`PARTIAL_SCALE`, ohne Scorezusage) |
| T19 | überlappende Skalen | teilweise | Konflikte erkannt und als Hinweise in der Auswahlansicht gezeigt (`ui/items.test.ts`); eigene Anzeige zu überlappenden Skalen im Info-Fenster fehlt |
| T20 | Suche/Filter ändern Auswahl nicht | abgedeckt | `ui/items.test.ts`: Suche und Filter ändern Auswahl und Ausgabereihenfolge nicht |
| T21 | Nullwert, Grenzen, Ganzzahlen | teilweise | Katalogseite (`semanticResponses.test.ts`); Eingabeprüfung fehlt |
| T22 | exklusive Option und Auswahlgrenzen | teilweise | Katalogprüfung vollständig; Eingabeprüfung fehlt |
| T23 | Leerzeichen, Unicode, Minimallänge | offen | Eingabeprüfung fehlt |
| T24 | Missing gegen Neutral, Code 01 | teilweise | Codes bleiben Strings (Strikter Leser), Rollenprüfung im Scoring; Export fehlt |
| T25 | Infoansicht | abgedeckt | `ui/items.test.ts`: Infofenster in der Reihenfolge A09, «nicht dokumentiert» statt Raten |
| T26 | Sprachwechsel, fehlende Übersetzung | teilweise | Sprachwechsel in Liste und Vorschau, fehlende Übersetzung wird markiert statt gemischt (`ui/items.test.ts`, `ui/preview.test.ts`, `output.test.ts`); Export in der Sprache folgt |
| T27 | Projekt speichern/laden | abgedeckt | `project.test.ts`, `ui/output.test.ts`: Speichern, Laden über die Dateiauswahl, gleiche Auswahl und Angaben |
| T28 | falscher Katalog/Version | abgedeckt | `selection.test.ts`, `pipeline.test.ts` |
| T29 | Schulnotizen nicht ungefragt veröffentlicht | abgedeckt | `output.test.ts`, `ui/output.test.ts`: Codebuch ohne Notizen ausser auf ausdrückliche Wahl, Dateinamen und Prüfbericht ohne Notizen |
| T30 | echter Importtest je Adapter | offen | Adapter fehlen (M5/M6) |
| T31 | Namens-/Codeabbildung | offen | Adapter fehlen |
| T32 | nicht übertragbarer Constraint | offen | Adapter fehlen |
| T33 | Bedingungen und Ausblendung | teilweise | Bedingungen im Katalog geprüft und in Liste und Vorschau als Struktur gezeigt; Export-Semantik fehlt |
| T34 | Testantwortdaten exportieren | offen | Adapter fehlen |
| T35 | erlaubte Nutzung, verbotene Änderung | abgedeckt | `rights.test.ts`: `modification=prohibited` blockiert nichts, nicht benötigte Verbote blockieren nicht |
| T36 | unbekannte Darstellungsrechte | abgedeckt | `ui/items.test.ts`: Text gesperrt, nirgends im DOM, nicht durchsuchbar, Katalog nutzbar |
| T37 | Codebuch gegen nativer Export | teilweise | Codebuch und Rechtefolgen je Handlung in Matrix, Codebuch und Oberfläche getestet (`rights.test.ts`, `output.test.ts`, `ui/output.test.ts`); nativer Export folgt mit den Adaptern |
| T38 | CSV-Import | offen | spätere Stufe (M8) |
| T39 | Tastatur, Dialogfokus | teilweise | Tastaturablauf Laden, Auswählen, Info-Fenster inklusive Fokusring, Tab-Falle und Rückfokus in Edge 156 belegt; Screenreader und restliche Ansichten nur über native Bedienelemente, nicht gesondert getestet |
| T40 | 1.000 Items / 5 MB | teilweise | `performance.test.ts` (Kern: 1,36 s) und `tests/e2e/browser.test.ts` (Edge 156: 5,12 MB, 1.010 Items bedienbar nach 749 ms, Ziel 5 s). Referenzgerät noch nicht festgelegt |
| T41 | Skriptzeichenfolge, gefährlicher Link | abgedeckt | `pipeline.test.ts`, `ui/*.test.ts` und in Edge 156 (`tests/e2e/browser.test.ts`): Text bleibt Text, kein Skript läuft, nur http(s)-Links, statische Regel gegen innerHTML/eval |
| T42 | ungesicherter Zustand bei Wechsel | abgedeckt | `ui/shell.test.ts`: Rückfrage vor dem Verwerfen; Edge 156: beforeunload wird bei Änderungen angefordert, nach dem Speichern nicht |
| T43 | doppelte Itemverwendung | abgedeckt | `semanticStructure.test.ts` (`TEMPLATE_ITEM_DUPLICATE`) |
| T44 | Scorevoraussetzungen | abgedeckt | `selection.test.ts` (`scoreAvailability`) |
| T45 | `withdrawn`/`draft` | abgedeckt | `rights.test.ts`, `ui/output.test.ts`: draft, reviewed, released, withdrawn je Handlung und in der Oberfläche |

**Zusammenfassung:** 25 abgedeckt, 14 teilweise, 6 offen (von 45). Browsernachweis nur für Edge 156; Firefox, Safari und weitere Browser sind offen (docs/BROWSER.md).
