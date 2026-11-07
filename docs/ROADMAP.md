# Roadmap

| # | Meilenstein | Inhalt | Stand |
|---|---|---|---|
| M0 | Fundament | Repo-Struktur, Schema 0.3.0/0.4.0, Fixtures, Konformanztest, Recherche, Architektur | erledigt |
| M1 | Validierungskern | TypeScript-Gerüst, strikter JSON-Leser, Schema-Prüfung (ajv), semantischer Validator, Migration 0.3→0.4, Diagnosecodes, Lade-Pipeline | erledigt |
| M2a | Rechte-Handlungsmatrix | Auflösung je Item, Politik je Handlung, Katalogstatus draft/reviewed/released/withdrawn | erledigt |
| M2 | Auswahlkern | wirksame Pflichtmenge, Projekt laden/speichern, Initialauswahl, Sammelaktionen | erledigt (Datenseite) |
| M3 | Oberfläche | Einzeldatei-Build, Katalogansicht, Suche/Filter, Info-Panel, Vorschau, Ausgaben | erledigt (jsdom und Edge 156 getestet) |
| M4 | Ausgaben | Codebuch (Markdown), Prüfbericht (JSON) | erledigt (Datenseite) |
| M5 | Erster Adapter | LimeSurvey (TSV), Test an echter Instanz | Adapter umgesetzt und getestet (Struktur, Gates, Browser-Download); **Importtest an echter Instanz offen** |
| M6 | Weitere Adapter | REDCap, Qualtrics, danach SurveyMonkey, Google Forms (Skript), Unipark | Qualtrics (TXT) umgesetzt, Importtest offen; die übrigen offen |
| M7 | Profil-JSON | Schulanpassung ohne Code-Varianten | offen |
| M8 | Autorenmodus / CSV-Pflege | eigene Fragen, CSV-Import | offen |

Jeder Meilenstein endet mit Tests, Dokumentation, Changelog-Eintrag und Commit.

Stand der Abnahmetests: [ABNAHMETESTS.md](ABNAHMETESTS.md).

## Nächste Schritte
1. Importtest des LimeSurvey-Exports an einer echten Instanz (Anleitung in [LIMESURVEY.md](LIMESURVEY.md)); danach Annahmenliste und Adapter korrigieren.
2. Importtest des Qualtrics-Exports ([QUALTRICS.md](QUALTRICS.md)).
3. REDCap-Adapter: **blockiert**, bis die Kopfzeile des Datenwörterbuchs aus einem echten REDCap-Projekt vorliegt (siehe [RECHERCHE_Zielsysteme.md](RECHERCHE_Zielsysteme.md), offener Punkt 3). Danach SurveyMonkey, Google Forms, Unipark.
4. Browsernachweis über Edge hinaus (Firefox, Safari), Screenreader-Prüfung.
