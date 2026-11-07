# Roadmap

| # | Meilenstein | Inhalt | Stand |
|---|---|---|---|
| M0 | Fundament | Repo-Struktur, Schema 0.3.0/0.4.0, Fixtures, Konformanztest, Recherche, Architektur | erledigt |
| M1 | Validierungskern | TypeScript-Gerüst, strikter JSON-Leser, Schema-Prüfung (ajv), semantischer Validator, Migration 0.3→0.4, Diagnosecodes, Lade-Pipeline | erledigt |
| M2 | Auswahlkern | wirksame Pflichtmenge, Projekt laden/speichern, Initialauswahl, Sammelaktionen | erledigt (Datenseite) |
| M3 | Oberfläche | Einzeldatei-Build, Katalogansicht, Suche/Filter, Info-Panel, Vorschau | offen |
| M4 | Ausgaben | Codebuch (Markdown), Prüfbericht (JSON) | offen |
| M5 | Erster Adapter | LimeSurvey (TSV), Test an echter Instanz | offen |
| M6 | Weitere Adapter | REDCap, Qualtrics, danach SurveyMonkey, Google Forms (Skript), Unipark | offen |
| M7 | Profil-JSON | Schulanpassung ohne Code-Varianten | offen |
| M8 | Autorenmodus / CSV-Pflege | eigene Fragen, CSV-Import | offen |

Jeder Meilenstein endet mit Tests, Dokumentation, Changelog-Eintrag und Commit.

Stand der Abnahmetests: [ABNAHMETESTS.md](ABNAHMETESTS.md).

## Nächste Schritte
1. Rechte-Handlungsmatrix (Anzeige, Codebuch, Export je Item), Status `draft`/`withdrawn` (T35, T36, T45).
2. Einzeldatei-Build und Oberfläche (M3).
3. Codebuch und Prüfbericht (M4).
