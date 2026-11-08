# Ausgaben: Projektdatei, Prüfbericht, Codebuch

Vier verschiedene Aktionen, die nicht verwechselt werden dürfen (Spec A12). Welche wann möglich ist, regelt die Rechte-Handlungsmatrix in [DIAGNOSECODES.md](DIAGNOSECODES.md#stufe-rights-rechte-und-handlungsmatrix).

| Ausgabe | Datei | Enthält | Enthält nie | Zweck |
|---|---|---|---|---|
| Projektdatei | `<katalog>_<version>_project.json` | exakte Katalog-ID und -Version, Auswahl, Sprache, optional Schulbezeichnung und Notizen | Itemtexte, Regelüberschreibungen | Auswahl später weiterbearbeiten |
| Prüfbericht | `<katalog>_<version>_check-report.json` | IDs, Pfade, Codes, Befunde, Rechtefolgen je Handlung | Wortlaut von Items, Antworten, Abschnitten | technisches Protokoll |
| Codebuch | Markdown | Beschreibung der Auswahl mit Wortlaut, Antwortcodes, Einschränkungen, Quellen | HTML, gesperrte Wortlaute, Schulnotizen (ausser auf ausdrückliche Wahl) | Dokumentation für Verantwortliche, **kein Import** |
| Export | je Zielsystem | die Auswahl in dessen Importformat, Bauplan oder Skript (siehe [LIMESURVEY.md](LIMESURVEY.md), [QUALTRICS.md](QUALTRICS.md), [PROTOTYPEN.md](PROTOTYPEN.md)) | Wortlaut nur nach Rechteprüfung | Umfrage im Zielsystem aufbauen |

Dateinamen enthalten nur Katalog-ID und Version (das Codebuch zusätzlich die Sprache), nie Schulbezeichnung oder Notizen.

In der Oberfläche stehen die drei Dateien im Tab «Prüfung und Ausgabe». Darunter zeigt eine Übersicht je Handlung (Anzeige, Codebuch, regulärer Export, Entwicklungs-Testexport), ob sie nach der Rechtepolitik möglich ist, und die Gründe. Darunter steht je Ziel ein Block mit Export- und Testexport-Knopf, den Gründen, warum etwas nicht möglich ist, und der Zuordnung (`exact`, `transformed`, `manual`, `unsupported`). Was bei Fehlern geschieht: [FEHLERBEHANDLUNG.md](FEHLERBEHANDLUNG.md).

## Prüfbericht (`questionnaireCheckReport`, Version 1.0.0)

```json
{
  "reportType": "questionnaireCheckReport",
  "reportVersion": "1.0.0",
  "generatedAt": "2026-11-07T12:00:00.000Z",
  "tool": { "name": "MindMatters", "version": "0.0.1" },
  "catalogRef": { "id": "...", "version": "1.0.0", "status": "draft" },
  "questionnaireRef": "...",
  "language": "en",
  "stateFingerprint": "…",
  "validity": "valid | hasConflicts",
  "notice": "nur bei hasConflicts",
  "selection": { "itemIds": [], "count": 0, "mandatoryCount": 0 },
  "status": { "technical": "pass", "selection": "pass", "rights": "pass", "export": "notRun" },
  "counts": { "errors": 0, "warnings": 0, "infos": 0 },
  "diagnostics": [],
  "rights": [ { "action": "displayItems", "allowed": true, "blockedItemIds": [], "flags": {}, "diagnostics": [] } ]
}
```

- **Veraltet:** `stateFingerprint` kennzeichnet den Zustand (Katalog, Version, Fragebogen, Sprache, Plattform, Auswahl in Fragebogenreihenfolge). Ändert sich eines davon, ist der Bericht veraltet (`isReportStale`). Es ist ein einfacher 53-Bit-Hash zur Zustandserkennung, keine Sicherheitsfunktion.
- **Konflikte:** Eine Auswahl mit ungelösten Konflikten kann protokolliert werden. Der Bericht trägt dann `validity: "hasConflicts"` und einen Hinweis, damit er nicht als gültiger Fragebogen gelesen wird.
- **Statuswerte:** `technical` (Datei, Struktur, Verweise, Inhalt), `selection`, `rights`, `export` getrennt. `export` bleibt `notRun`, bis ein Adapter geprüft hat.

## Codebuch

Aufbau: Kopf (Katalog, Version, Status, Sprache, Datum, Anzahl), Entwurfs- bzw. Rückzugsvermerk, erforderliche Quellenangaben, Quellen, Dimensionen (Hierarchie), Instrumente, Skalen, Fragebogen (Einleitung, Einwilligung, Datenschutz, Hilfsangebote, versteckte Felder), Abschnitte und Items in Fragebogenreihenfolge, dokumentierte Auswertung.

Regeln:
- **Rechte:** Der Wortlaut eines Items steht nur im Codebuch, wenn das wirksame Profil `reviewed` ist und `export`, `redistribution`, `electronicDisplay` `permitted` sind. Sonst erscheinen ID, Variable und Typ, dazu der Hinweis «Wortlaut gesperrt».
- **Entwurf/Rückzug:** `draft` trägt «Entwurf – nicht für produktive Durchführung freigegeben», `withdrawn` einen deutlichen Rückzugshinweis.
- **Sprache:** Es wird nichts automatisch übersetzt. Fehlt ein Teilnehmertext in der gewählten Sprache, wird der Text der Standardsprache angezeigt und ausdrücklich als solcher markiert.
- **Textblöcke:** `note`-Items erscheinen als «Textblock» mit ihrem Stil.
- **Sicherheit:** Alle Katalogtexte werden maskiert (Markdown-Zeichen, `<`, `>`, `|`). Es entsteht kein HTML.
- **Auswertung:** Nur dokumentiert, nie berechnet. Unvollständige Auswahl bei einer Definition wird als «nicht verfügbar» vermerkt.
- **Schulnotizen:** nur wenn der Aufrufer sie ausdrücklich übergibt.
- **Verwaltungsinformationen** sind als solche gekennzeichnet.

Sprachen der Beschriftungen im Codebuch: Deutsch bei Sprachen, die mit `de` beginnen, sonst Englisch.

## ZIP-Paket

Der Knopf *Alles als ZIP-Paket speichern* (Tab «Prüfung und Ausgabe») erzeugt `<katalog>_<version>_paket.zip` mit:

| Datei | Inhalt |
|---|---|
| `LIESMICH.txt` | Katalog, Version, Status, Sprache, Datum; Liste der Dateien mit Stufe (Adapter, Prototyp, Tabelle) und Kennzeichnung von Testexporten; **Liste der nicht enthaltenen Ausgaben mit Diagnosecodes**; Hinweis, dass nichts an einem echten Zielsystem getestet ist |
| Projektdatei, Prüfbericht, Codebuch | wie bei den Einzel-Downloads, mit denselben Regeln für Rechte und Schulnotizen |
| `export/…` | je Ziel die reguläre Ausgabe, sonst (nur bei Entwurf und ähnlichem) der gekennzeichnete Testexport. Was nicht möglich ist, fehlt hier und steht in `LIESMICH.txt` |

Das Paket ist ein ZIP ohne Kompression (Methode «stored», UTF-8-Dateinamen), erzeugt im Browser ohne Bibliothek (`src/output/zip.ts`). Es wird ohne Pfadtricks gebaut: doppelte, leere, absolute Namen und `..` werden abgelehnt. Getestet mit einem eigenen Leser samt CRC-Prüfung und mit Pythons `zipfile` als unabhängigem Leser.

## Auswahl nach Skala und dokumentierte Bearbeitungszeit

Im Tab «Prüfung und Ausgabe» zeigt die Übersicht je Skala `n von m Items`, Zustand (vollständig, Teilauswahl, nicht gewählt) und Auswahlregel. Sie ändert nie die Auswahl.

Die **Bearbeitungszeit** wird nie geschätzt. Gezählt werden nur Instrumente, die vollständig gewählt sind und eine dokumentierte `administrationTime` mit Quelle tragen. Items ohne belegte Zeit werden als «nicht dokumentiert» genannt, das ist nicht null. Sonst steht «für Ihre Auswahl ist keine Zeit dokumentiert».

## Lesbare und maschinenlesbare Ausgaben

Fünf weitere Ausgaben liegen neben den Umfragetool-Exporten. Sie laufen wie jeder Export durch dieselbe Rechteprüfung (`openAdapter`): Wortlaut nur, wenn die Rechte ihn erlauben, ein Entwurf nur als gekennzeichneter Testexport, nur gültige Auswahl, nur eine Sprache pro Datei, **nie eine Ersatzsprache** (fehlender Text = `EXPORT_TEXT_MISSING`). Keine davon ist ein Import für ein Umfragetool.

| Ausgabe | Datei | Zweck | Stufe |
|---|---|---|---|
| Druckansicht | `<katalog>_<version>_html_print.html` | Fragebogen wie auf Papier, im Browser als PDF speicherbar; für Ethikantrag, Elterninformation, Kontrolle | Lesbar |
| Textdokument | `…_markdown_questionnaire.md` | Fragebogen als Markdown, zum Einfügen in Dokumente und E-Mails | Lesbar |
| Neutrales JSON | `…_json_neutral.json` | aufgelöste Kopie für eigene Skripte | Lesbar |
| SPSS-Syntax | `…_spss_labels.sps` | Variablen- und Wertelabels für die Auswertung | Prototyp |
| R-Skript | `…_r_labels.R` | dasselbe als Basis-R | Prototyp |

Alle fünf entstehen aus **einem** aufgelösten Modell (`buildDocModel` in `src/output/document.ts`). Wortlaut, Reihenfolge, Nummerierung und Antwortoptionen können deshalb nicht auseinanderlaufen.

### Druckansicht (HTML)

- Eine einzige Datei ohne Skript, ohne Ereignisbehandler, ohne externe Ressource. Eine `Content-Security-Policy` im Kopf (`default-src 'none'`) erzwingt das auch im Browser.
- Aller Katalogtext wird maskiert (`& < > " '`), er kann nie zu HTML werden. Absätze (Leerzeile) und Listen (`- `) aus Textblöcken werden übernommen.
- Fragen sind durchnummeriert, Textblöcke nicht. Pflichtfragen tragen ein Sternchen, Bedingungen stehen als «Nur wenn …» über der Frage.
- Antworten: Einzelwahl ○, Mehrfachwahl ☐, Rangfolge ▢, Regler als Skala mit Endbeschriftung, Zahl/Text/Datum als Linie oder Feld. Ein Block mit gemeinsamer Antwortliste und Layout `matrix` oder `table` wird als **Tabelle** gedruckt.
- Seitenumbrüche folgen `pageBreakBefore` der Abschnitte. Das Druckformat ist für A4 eingerichtet.

### Markdown-Dokument

Gleicher Inhalt als Text. Markdown-Zeichen und rohes HTML in Katalogtexten werden maskiert, damit der Text nicht als Formatierung gelesen wird.

### Neutrales JSON

```json
{
  "format": "mindmatters-neutral-questionnaire",
  "formatVersion": "1.0.0",
  "catalog": { "id": "…", "version": "1.0.0", "status": "released" },
  "language": "de-CH",
  "testArtifact": false,
  "title": "…", "statusLabel": "", "introduction": "…", "consent": { "text": "…" },
  "sections": [
    { "id": "…", "title": "…", "layout": "matrix", "pageBreakBefore": false,
      "items": [
        { "id": "…", "variable": "…", "kind": "singleChoice", "number": 1, "text": "…",
          "required": true, "condition": "…", "limits": "",
          "options": [ { "code": "1", "label": "…", "missing": false } ] }
      ] }
  ]
}
```

`formatVersion` folgt Semantic Versioning: neue optionale Felder erhöhen die Nebenversion, Umbenennungen die Hauptversion.

### SPSS-Syntax und R-Skript

Setzen **Variablenlabels** (`Nummer. Fragetext`) und **Wertelabels** für Einzelwahl und Rangfolge. Codes mit Rolle «keine Angabe» werden in SPSS als fehlende Werte (`MISSING VALUES`) und in R als `NA` behandelt.

- **Annahme, die im Dateikopf steht:** Die Datenspalten heissen wie die Variablennamen des Katalogs. Ein Umfragetool kann Variablen umbenennen oder Mehrfachwahl in eine Spalte je Antwort aufteilen. Mehrfachwahl erhält daher nur das Label der Frage.
- **Namensprüfung:** Ein Variablenname, den SPSS nicht verwenden kann (Anfang, Zeichen, Länge 64, reserviertes Wort), ist ein Fehler `EXPORT_VARIABLE_NAME_INVALID` mit der betroffenen Frage. Doppelte Namen sind ein Fehler `EXPORT_VARIABLE_NAME_DUPLICATE`.
- **Maskierung:** SPSS-Texte mit `'` verdoppeln das Zeichen, Zeilenumbrüche werden Leerzeichen, Labels sind auf 256 (Variable) und 120 Zeichen (Wert) begrenzt. R-Texte maskieren `\`, `"` und Zeilenumbrüche.
- Das R-Skript warnt beim Anwenden vor Spalten, die in den Daten fehlen (`Spalten nicht gefunden`), statt sie zu übergehen.
- Beide Dateien wurden **nicht in SPSS oder R ausgeführt** (Stufe Prototyp).
