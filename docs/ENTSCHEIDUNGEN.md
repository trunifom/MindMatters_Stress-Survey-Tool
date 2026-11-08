# Entscheidungsprotokoll

Jeder Eintrag: Kontext, Entscheidung, Alternativen, Folgen. Neue Entscheidungen werden angehängt, alte nicht umgeschrieben, sondern als «ersetzt durch» markiert.

## ADR-001: Ein universelles HTML statt Varianten pro Schule
- **Datum:** 2026-11-07, **Status:** angenommen
- **Kontext:** Das Tool geht an hunderte Schulen, einzelne wünschen Anpassungen.
- **Entscheidung:** Ein HTML für alle. Anpassungen über Daten (Katalog, Projekt, später Profil-JSON).
- **Alternativen:** Streamlit-Generator pro Schule (verworfen: Varianten- und Versionschaos, zweiter Stack, Fixes müssten an alle Schulen); handgepflegte HTML-Kopien (verworfen).
- **Folgen:** Ein Profil-Schema ist nötig. Sonderbuilds nur per Build-Flag für echte Code-Unterschiede.

## ADR-002: TypeScript mit Build zu einer Datei, nur Entwicklungs-Python
- **Datum:** 2026-11-07, **Status:** angenommen (Bestätigung durch Projektleitung steht aus, Arbeit begonnen auf deren Auftrag)
- **Kontext:** Der Validator muss im Browser laufen. Eine Python-Variante wäre eine zweite Implementierung.
- **Entscheidung:** Quellcode in TypeScript, Vitest für Tests, Vite-Build mit Einzeldatei-Ausgabe, `ajv` (2020-12) für Schema-Prüfung. Python nur für Entwicklungswerkzeuge und den Konformanz-Gegencheck.
- **Alternativen:** Streamlit/Python-Generator (siehe ADR-001); grosses Frontend-Framework (verworfen für minimale Abhängigkeiten, Urteilsfrage).
- **Folgen:** Node ≥ 20 in der Entwicklung. Auslieferung braucht nur einen Browser.

## ADR-003: Schema additiv versionieren, nie still migrieren
- **Datum:** 2026-11-07, **Status:** angenommen
- **Entscheidung:** `schema/0.3.0/` bleibt unverändert, `schema/0.4.0/` erweitert nur additiv (neue Felder optional). Migration 0.3.0 → 0.4.0 ist eine ausdrückliche Funktion.
- **Folgen:** Das Original-Datenvertragsprinzip «keine stille Migration» bleibt erhalten. Jede inkompatible Änderung braucht eine neue Hauptversion und einen Migrationsvertrag.

## ADR-004: Fixtures ins Repo, Ausgangsunterlagen nicht
- **Datum:** 2026-11-07, **Status:** angenommen
- **Kontext:** `Dokumente_Start/` (Pflichtenheft, Datenvertrag 0.3, Testdateien) soll nicht auf GitHub.
- **Entscheidung:** Der Ordner steht im `.gitignore`. Die 11 JSON-Testdateien, auf die Tests angewiesen sind, liegen unverändert unter `tests/fixtures/v0.3.0/`. Prüfbericht und Manifest der Ausgangsunterlagen wurden nicht übernommen.
- **Folgen:** Die normativen Textdokumente (02, 03) liegen nur lokal. Ihr Inhalt fliesst in `schema/README.md`, `docs/` und die Validatorregeln ein. Falls sie später öffentlich sein sollen, gehören sie nach `docs/spezifikation/`.

## ADR-005: Entwicklungsregeln für Commits
- **Datum:** 2026-11-07, **Status:** angenommen
- **Entscheidung:** Ein Commit pro abgeschlossener Funktion, mit Code, Tests, Dokumentation und Changelog-Eintrag. Ausführliche Commit-Texte (Was, Warum, Tests, Grenzen). Details in [../CONTRIBUTING.md](../CONTRIBUTING.md).

## ADR-006: Textabschnitte als `note`-Items mit `style`
- **Datum:** 2026-11-07, **Status:** angenommen
- **Kontext:** Neben Fragen sollen Titel und Textabschnitte erscheinen können (Ziel der Umfrage, Anonymität, Freiwilligkeit).
- **Entscheidung:** Es gibt keinen neuen Registertyp. Das vorhandene `note`-Item (reiner Text, keine Antwort) bekommt `style`: `text`, `title`, `subtitle`, `notice`. Inhalt ist reiner Text: Absätze durch Leerzeile, Zeilen mit `- ` als Liste, kein HTML. Dazu kommen die vorhandenen Felder `introduction`, `closingText`, `consent`, `privacyNotice`, `helpResources` am Fragebogen.
- **Gründe:** Notizen sind frei zwischen Fragen platzierbar, über die Vorlage geordnet, als Pflicht oder wählbar deklarierbar und werden vom Auswahlmodell, Projekt und Validator bereits korrekt behandelt. Alle Zielsysteme kennen Textblöcke (LimeSurvey Typ `X`, REDCap `descriptive`, Qualtrics `DB`, Google `textItem`, SurveyMonkey `descriptive_text`). Kein HTML schliesst Skript-Einschleusung aus.
- **Alternativen:** eigenes Register `textBlocks` (verworfen: doppelte Ordnungs- und Auswahllogik); HTML/Markdown in Texten (verworfen: Sicherheit, Zielsysteme unterstützen es unterschiedlich).
- **Folgen:** Schema 0.4.0 wurde vor der ersten Auslieferung erweitert (ADR-003 bleibt unberührt, weil 0.4.0 noch nirgends verwendet wird). Exporter ignorieren `variableName` von Notizen und erzeugen keine Datenspalte.

## ADR-007: Exporter schreiben, was sie belegen können, und ändern nichts still
- **Datum:** 2026-11-07, **Status:** angenommen
- **Kontext:** Zielsysteme haben eigene Regeln für Codes und Namen (LimeSurvey: Antwortcodes höchstens 5 Zeichen, Fragecodes ohne Unterstrich). Die Katalogcodes (`refused`, `demo_01`) entsprechen dem nicht. Die Herstellerseite des TSV-Formats lässt Escape-Regeln, Typbuchstaben und Limits offen.
- **Entscheidung:**
  1. Jeder Adapter liefert neben der Datei einen **Zuordnungsbericht** (`exact | transformed | manual | unsupported`) und die Liste seiner **ungeprüften Annahmen**. Beides sieht die Schule im Konfigurator.
  2. Codes werden **nie abgeleitet**. Ein unzulässiger Code ist ein Fehler mit Hinweis. Abhilfe ist ein Eintrag im Katalog: `Item.exportHints.<plattform>.variableName` (vorhanden) und neu `Option.exportHints.<plattform>.code`. Der Katalogcode bleibt die Identität der Option, Bedingungen werden beim Schreiben auf den Exportcode abgebildet.
  3. Eine Bedingung, die das Zielsystem nicht ausdrücken kann, ist ein Fehler. Sie wird nicht weggelassen.
  4. Texte werden so maskiert, dass keine Zelle Tabulator, Zeilenumbruch oder doppelte Anführungszeichen enthält. Dadurch braucht der Adapter keine Escape-Regel, die nicht belegt ist.
  5. Der Adapter heisst «ungetestet», bis ein Importtest an einer echten Instanz in `docs/LIMESURVEY.md` protokolliert ist.
- **Alternativen:** Codes automatisch kürzen (verworfen: Kollisionen und stille Änderung der Identität); Export mit Warnung trotz unzulässigem Code (verworfen: die Datei wäre im Zielsystem falsch oder nicht importierbar).
- **Folgen:** Qualtrics (TXT) kann weder Bedingungen noch Slider. Nach Punkt 3 sind beide dort Fehler. Ein Katalog mit Bedingungen ist dort ohne Weiteres nicht exportierbar, bis ein Verfahren mit ausdrücklicher Zustimmung der Schule (Bedingung von Hand nachbauen) vorliegt. Schema 0.4.0 erhält `Option.exportHints` (additiv, 0.4.0 ist noch nicht ausgeliefert, ADR-003 bleibt unberührt). Kataloge für LimeSurvey brauchen kurze Exportcodes für Optionen mit langen Codes.

## ADR-008: Alle Zielsysteme bedienen, in drei klar benannten Stufen
- **Datum:** 2026-11-08, **Status:** angenommen
- **Kontext:** Es gibt derzeit keine Testinstanz für LimeSurvey, Qualtrics, REDCap, SurveyMonkey, Google Forms oder Unipark. Trotzdem soll jedes Zielsystem bedient werden. Für REDCap fehlt eine öffentliche Quelle der Kopfzeile, Unipark und SurveyMonkey lesen keine Fragebogendatei, Google Forms hat keinen Dateiimport.
- **Entscheidung:** Jede Ausgabe trägt eine Stufe, die im Konfigurator neben dem Namen steht:
  1. **Adapter** (LimeSurvey, Qualtrics): erzeugt eine Datei, die das System importiert, nach den Angaben der Herstellerseite, an keiner echten Instanz getestet.
  2. **Prototyp** (REDCap, Google Forms; Unipark und SurveyMonkey als Bauplan): aus allgemeinem Wissen oder sekundären Quellen geschrieben, nie gegen das echte System gelaufen, oder ein Dokument zum Nachbauen, weil das System nichts importiert.
  3. **Tabelle** (neutrale CSV): für Menschen, kein Import.
  Alle Stufen gelten dieselben Regeln aus ADR-007 (Rechte, Katalogstatus, eine Sprache, nichts still geändert, nichts weggelassen) und führen ihre Annahmen offen.
- **Änderung gegenüber dem Stand vom 7. November:** REDCap wurde dort wegen der unbelegten Kopfzeile zunächst nicht gebaut. Mit der Vorgabe «möglichst alles, auch als Prototyp» entsteht es jetzt als Prototyp. Die Kopfzeile bleibt unbelegt und ist in der Annahmenliste und im Zuordnungsbericht (`prototype`) genannt.
- **Gründe:** Schulen sollen einen Stand bekommen, an dem sie arbeiten können. Das Risiko liegt in einem still falschen Import, deshalb bleibt die Stufe sichtbar und der Weg zu «getestet» ist in [PROTOTYPEN.md](PROTOTYPEN.md) beschrieben.
- **Folgen:** Eine Stufe wird nur nach einem protokollierten Test angehoben. Der gemeinsame Start jedes neuen Adapters liegt in `src/output/adapterBase.ts`.

## ADR-009: Anpassbare Texte und eigene Textblöcke, Darstellung ohne Speicherung, Deutsch als Standard

**Entscheidung.**
1. **Texte anpassen.** Eine Schule kann Titel, Einleitung, Schlusstext, Datenschutzhinweis, Hilfsangebote und die Einwilligungstexte ändern und eigene Textblöcke (Titel, Zwischentitel, Text, Hinweis) an beliebiger Stelle einfügen. Das gespeicherte Ergebnis heisst `customization` und steht in der **Projektdatei** (Schema 0.4.0, rein additiv). Der Katalog wird nie verändert.
2. **Gesperrte Texte.** Der Katalog kann Texte als standardisiert markieren (`questionnaire.lockedTexts`, zum Beispiel Wortlaut eines Originalinstruments oder eine vorgeschriebene Einwilligung). Eine Anpassung davon wird nicht angewendet und mit `CUSTOM_TEXT_LOCKED` gemeldet, in der Oberfläche ist das Feld gesperrt. Fragen und Antwortoptionen sind nie anpassbar.
3. **Abgeleiteter Katalog.** `applyCustomization` baut im Speicher einen abgeleiteten Katalog (angepasste Texte, eigene Blöcke als `note`-Items mit `origin: own` und eigenem Rechteprofil `rights_custom_text`). Liste, Vorschau, Prüfung und **alle Exporte** arbeiten auf diesem einen Katalog. So kann der Wortlaut in Vorschau und Export nie auseinanderlaufen. Der abgeleitete Katalog besteht die volle Validierung (Test).
4. **Nichts wird still verschoben.** Ein Block mit unbekanntem Abschnitt oder belegter ID wird übersprungen und gemeldet. Ein unbekannter Ankerpunkt setzt den Block an den Abschnittsanfang, mit Warnung.
5. **Darstellung ohne Speicherung.** Hell/Dunkel und zwei Schriftgrössen gelten für die ganze Seite. Sie werden **bewusst nicht im Browser gespeichert**: Das Tool verspricht, nichts zu speichern, und ein statischer Test (T41) verbietet `localStorage`, `sessionStorage` und IndexedDB unter `src/ui`. Das Thema folgt zu Beginn der Systemeinstellung.
6. **Deutsch als Standard.** Oberfläche immer Deutsch (umschaltbar). Die Fragensprache ist Deutsch, sobald der Katalog `de` oder `de-*` führt, sonst die Standardsprache des Katalogs.
7. **Textblöcke des Katalogs anpassbar (Nachtrag 8. November 2026).** Auch die `note`-Items des Katalogs (Titel, Untertitel, Übergangstexte, Abschlussseite) kann die Schule ändern: `customization.noteOverrides` (ID → Text). Gesperrt wird ein Block über `questionnaire.lockedNotes` (Liste von Item-IDs), eine Anpassung davon wird mit `CUSTOM_NOTE_LOCKED` gemeldet. Eine ID, die kein Textblock ist, wird mit `CUSTOM_NOTE_NO_TARGET` ignoriert, so lässt sich über diesen Weg nie eine Frage ändern.
8. **Beispielkataloge enthalten die Textbausteine.** Ein Beispielkatalog bringt immer Titel, Untertitel, Einleitung, Einwilligung, Datenschutzhinweis, Übergangstexte zwischen Skalen und eine Abschlussseite mit Dank als fertige Beispieltexte mit. Die Schule passt sie an, statt sie von Grund auf zu schreiben. Gesperrt ist nur, was der Herausgeber ausdrücklich als standardisiert markiert (hier die Einwilligungstexte).
9. **Reihenfolge nur, wenn der Katalog es erlaubt (Nachtrag 8. November 2026).** Jeder Abschnitt (Block, zum Beispiel eine Skala) trägt `reorder.movable` (ganzer Block verschiebbar) und `reorder.itemsReorderable` (Fragen einzeln verschiebbar). Beides ist **standardmässig falsch**, weil standardisierte Instrumente in der veröffentlichten Reihenfolge gefragt werden. Persönliche Angaben wie Alter oder Geschlecht stehen in einem Abschnitt mit `itemsReorderable: true`. Die Schule speichert `customization.sectionOrder` (nur die verschiebbaren Blöcke, feste behalten ihren Platz) und `customization.itemOrder` (je Abschnitt). Eine Reihenfolge, die den Auslöser einer Bedingung hinter die abhängige Frage setzt, wird nicht angewendet (`CUSTOM_ORDER_CONDITION`), in der Oberfläche bleibt die Verschiebung aus und ein Hinweis erscheint. Eigene Textblöcke behalten ihren Ankerpunkt. Neuer Schritt «Reihenfolge» (zweiter von fünf). Nach dem Import kann die Reihenfolge im Umfragetool ohnehin nochmals geändert werden.

**Folgen.** Ein Projekt ohne Anpassungen sieht aus wie bisher (kein neuer Schlüssel). Wer die Projektdatei weitergibt, gibt die eigenen Texte der Schule weiter, aber keinen Katalogwortlaut. Exporte in einer Sprache ohne den eigenen Text melden den fehlenden Text wie bei jedem anderen Text (`EXPORT_TEXT_MISSING`).

## Offene Entscheidungen
- Lizenz des Repositories.
- Erste Plattform-Reihenfolge der Adapter (Vorschlag: LimeSurvey, REDCap, Qualtrics).
- Unipark: Importformat bei Tivian erfragen.
- Ressourcenlimits (Dateigrösse, Verschachtelung, Itemzahl) und Referenzgerät für das Leistungsziel.
- Zahlenvergleiche in Bedingungen auf ordinalen Einfachauswahlen (z. B. «trifft eher zu oder mehr»): Vergleich über Code oder `ordinalPosition`? Bis zur Entscheidung sind `greaterThan` usw. nur für Ganzzahl, Dezimalzahl und Slider erlaubt (`CONDITION_OPERATOR_TYPE`).
