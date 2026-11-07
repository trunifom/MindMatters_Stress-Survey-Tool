# MindMatters Stress-Survey-Tool

Offline-Konfigurator für psychometrische Fragebogen. Eine **einzige, eigenständige HTML-Datei** lädt einen Fragekatalog (JSON), zeigt Items samt Hintergrundinformationen (Quelle, Skala, Dimension, Messziel) an, lässt Schulen und Organisationen per Checkbox ihre Zusatzfragen neben den Pflichtfragen wählen und exportiert die Auswahl für gängige Umfragetools (LimeSurvey, REDCap, Qualtrics, SurveyMonkey, Google Forms, Unipark).

Kein Server, keine Installation, kein Konto, keine Internetverbindung. Das Tool erhebt **keine** Teilnehmerantworten.

> **Status: frühe Entwicklung.** Fertig sind das JSON-Schema (0.4.0), der Validierungskern (strikter Leser, Schema- und semantische Prüfung, Migration), das Auswahlmodell mit Pflichtmenge und Projekten sowie die Dokumentation. **Noch nicht vorhanden:** Benutzeroberfläche, Einzeldatei-Build, Rechtematrix, Codebuch und alle Export-Adapter. Das Tool ist heute also nicht benutzbar. Details: [docs/ABNAHMETESTS.md](docs/ABNAHMETESTS.md) (14 von 45 Abnahmetests abgedeckt), [docs/ROADMAP.md](docs/ROADMAP.md), [CHANGELOG.md](CHANGELOG.md).

## Grundidee

| Ebene | Datei | Zweck |
|---|---|---|
| Anwendung | `mindmatters.html` (Build-Ergebnis) | ein HTML für alle Schulen |
| Inhalt und Regeln | Katalog-JSON | Items, Antworten, Skalen, Quellen, Rechte, Logik |
| Auswahl | Projekt-JSON | was eine Schule angekreuzt hat |
| Anpassung (geplant) | Profil-JSON | Logo, Farben, Texte, erlaubte Exporte je Schule |

Schulspezifische Wünsche werden über **Daten** gelöst, nicht über eigene HTML-Varianten. Begründung: [docs/ARCHITEKTUR.md](docs/ARCHITEKTUR.md).

## Ordnerstruktur

```
schema/        JSON-Schemas, versioniert (0.3.0 unverändert, 0.4.0 aktuell)
docs/          Dokumentation (Index: docs/README.md)
examples/      Beispielkataloge für Entwickler und Katalogpfleger
src/           Anwendungscode (TypeScript): core, model, adapters, ui
tests/         Unit-Tests (Vitest), Konformanztests (Python), Fixtures
tools/         Build- und Hilfsskripte
```

## Schnellstart für Entwickler

Voraussetzungen: Node.js ≥ 20, Python ≥ 3.10 (nur für den Konformanz-Gegencheck, Paket `jsonschema`).

```bash
npm install
npm test                                         # Unit-Tests (Vitest, 268 Tests)
npm run typecheck                                # TypeScript-Prüfung
python -I tests/conformance/validate_schema.py   # Schema-Konformanz
```

## Dokumentation

Alles liegt unter [docs/](docs/README.md): Architektur, Entscheidungsprotokoll, Recherche zu den Zielsystemen, Diagnosecodes, Abnahmetests, Roadmap. Das JSON-Format ist unter [schema/README.md](schema/README.md) beschrieben.

## Versionierung

- **Schema** (`schemaVersion`): aktuell 0.4.0. Jede Version liegt in einem eigenen Ordner, ältere Dokumente werden nie still migriert.
- **Anwendung**: Semantic Versioning, Änderungen im [CHANGELOG.md](CHANGELOG.md).
- **Commits**: ausführliche Beschreibung von Änderung, Begründung und Tests, siehe [CONTRIBUTING.md](CONTRIBUTING.md).

## Lizenz

Noch nicht festgelegt. Bis zur Entscheidung gilt: alle Rechte vorbehalten.
Hinweis zu Inhalten: Katalogdateien können Items mit eigenen Nutzungsbedingungen enthalten. Die Rechte werden pro Item im Katalog deklariert, das Tool beweist sie nicht.
