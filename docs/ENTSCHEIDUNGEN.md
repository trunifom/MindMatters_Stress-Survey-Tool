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

## Offene Entscheidungen
- Lizenz des Repositories.
- Erste Plattform-Reihenfolge der Adapter (Vorschlag: LimeSurvey, REDCap, Qualtrics).
- Unipark: Importformat bei Tivian erfragen.
- Ressourcenlimits (Dateigrösse, Verschachtelung, Itemzahl) und Referenzgerät für das Leistungsziel.
- Zahlenvergleiche in Bedingungen auf ordinalen Einfachauswahlen (z. B. «trifft eher zu oder mehr»): Vergleich über Code oder `ordinalPosition`? Bis zur Entscheidung sind `greaterThan` usw. nur für Ganzzahl, Dezimalzahl und Slider erlaubt (`CONDITION_OPERATOR_TYPE`).
