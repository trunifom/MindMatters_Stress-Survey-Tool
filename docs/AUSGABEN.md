# Ausgaben: Projektdatei, Prüfbericht, Codebuch

Vier verschiedene Aktionen, die nicht verwechselt werden dürfen (Spec A12). Welche wann möglich ist, regelt die Rechte-Handlungsmatrix in [DIAGNOSECODES.md](DIAGNOSECODES.md#stufe-rights-rechte-und-handlungsmatrix).

| Ausgabe | Datei | Enthält | Enthält nie | Zweck |
|---|---|---|---|---|
| Projektdatei | `<katalog>_<version>_project.json` | exakte Katalog-ID und -Version, Auswahl, Sprache, optional Schulbezeichnung und Notizen | Itemtexte, Regelüberschreibungen | Auswahl später weiterbearbeiten |
| Prüfbericht | `<katalog>_<version>_check-report.json` | IDs, Pfade, Codes, Befunde, Rechtefolgen je Handlung | Wortlaut von Items, Antworten, Abschnitten | technisches Protokoll |
| Codebuch | Markdown | Beschreibung der Auswahl mit Wortlaut, Antwortcodes, Einschränkungen, Quellen | HTML, gesperrte Wortlaute, Schulnotizen (ausser auf ausdrückliche Wahl) | Dokumentation für Verantwortliche, **kein Import** |
| Nativer Export | je Zielsystem | (folgt mit den Adaptern) | | Umfrage im Zielsystem aufbauen |

Dateinamen enthalten nur Katalog-ID und Version, nie Schulbezeichnung oder Notizen.

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
