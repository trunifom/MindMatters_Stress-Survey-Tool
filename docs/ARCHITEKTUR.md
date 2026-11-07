# Architektur

Stand: 7. November 2026. Entscheidungsgründe: [ENTSCHEIDUNGEN.md](ENTSCHEIDUNGEN.md).

## Ziel

Eine eigenständige HTML-Datei, die ohne Installation und ohne Netzwerk einen Fragekatalog (JSON) lädt, darstellt, auswählen lässt und in Formate für gängige Umfragetools exportiert. Dieselbe Datei geht an hunderte Schulen.

## Kernprinzip: ein HTML, Anpassung über Daten

| Ebene | Datei | Verantwortung |
|---|---|---|
| Anwendung | `mindmatters.html` | Logik, Oberfläche, Validierung, Adapter. Identisch für alle |
| Inhalt und Regeln | Katalog-JSON | Items, Antworten, Skalen, Quellen, Rechte, Bedingungen |
| Auswahl | Projekt-JSON | Auswahl einer Schule, referenziert genau einen Katalog |
| Anpassung (geplant) | Profil-JSON (`appProfile`) | Logo, Farben, Texte, Sprache, erlaubte Exportziele, ausgeblendete Funktionen |

Sonderbuilds aus demselben Quellcode (Build-Flag) sind nur für echte Code-Unterschiede vorgesehen, etwa eine gehärtete Version ohne Export. Nie eine Kopie des Codes pro Schule.

## Quellcode ≠ Auslieferung

Das HTML ist ein **Build-Ergebnis**. Gepflegt wird modularer TypeScript-Code mit Tests. Ein Build-Schritt erzeugt daraus eine Datei mit eingebettetem CSS, JavaScript und JSON-Schema. Es gibt kein CDN, keine externen Schriften und keine versteckten Netzwerkzugriffe. Releases tragen eine Version und eine Prüfsumme.

## Schichten

```
src/core/       Laden (Syntax, doppelte Schlüssel, Grössenlimits), Schema-Prüfung (ajv),
                semantische Prüfung, Migration, Diagnosen
src/model/      Auswahlzustand, wirksame Pflichtmenge, Exportmodell
src/adapters/   je Zielsystem ein Ordner, reine Funktion: Exportmodell → {artifacts, diagnostics, mapping}
src/ui/         Ansichten, Info-Panel, Vorschau (später)
src/i18n/       UI-Texte (später)
```

Abhängigkeitsrichtung: `ui → model → core`. `adapters` hängen nur von `model` und `core` ab. `core` kennt weder DOM noch Browser, läuft also identisch in Node (Tests) und im Browser.

## Validierung in zwei Stufen

1. **Struktur** durch JSON Schema (Draft 2020-12), geladen aus `schema/<version>/`. Geschlossene Objekte, Typen, Enums, bedingte Felder.
2. **Semantik** in TypeScript: Referenzen, Eindeutigkeit, Auswahlregeln, Bedingungen, Skalen, Scoring, Features. Ergebnis sind Diagnosen mit Code, Schweregrad und JSON-Pfad ([DIAGNOSECODES.md](DIAGNOSECODES.md)).

Ein Python-Test (`tests/conformance/`) prüft die Schemas unabhängig vom TypeScript-Code und dient als Gegencheck. Python gehört nicht zur ausgelieferten Anwendung.

## Versionierung der Daten

- Jede `schemaVersion` hat einen eigenen Ordner unter `schema/`. Alte Versionen bleiben unverändert.
- Die Anwendung nennt ihre unterstützten Versionen. Andere Versionen werden mit Diagnose `SCHEMA_VERSION_UNSUPPORTED` abgelehnt.
- Migration ist ein ausdrücklicher Schritt (`src/core/migrate.ts`), nie implizit. 0.3.0 → 0.4.0 ist rein additiv.

## Repo-Struktur

```
.
├── README.md  CHANGELOG.md  CONTRIBUTING.md  CLAUDE.md
├── schema/            0.3.0/  0.4.0/  README.md
├── docs/              Dokumentation, Index in docs/README.md
├── examples/          Beispielkataloge
├── src/               core/  model/  adapters/  ui/  i18n/
├── tests/
│   ├── unit/          Vitest, läuft in Node
│   ├── e2e/           Playwright gegen das gebaute HTML (später)
│   ├── conformance/   Python-Schema-Gegencheck
│   └── fixtures/      v0.3.0/ (11 Dateien, wie ursprünglich geliefert)
└── tools/             Build und Hilfsskripte
```

Nicht versioniert (`.gitignore`): `Dokumente_Start/` (lokale Ausgangsunterlagen), `node_modules/`, `dist/`, Coverage, lokale Editor- und Werkzeugdateien.

## Auslieferung an Schulen

- Als ZIP: HTML, Katalog, optional Profil. Viele Mail-Gateways blockieren `.html`-Anhänge.
- `file://`: Dateiauswahl und Download per Blob funktionieren, automatisches Nachladen von Nachbardateien nicht.
- Das HTML zeigt Version und unterstützte `schemaVersion`-Werte an.

## Adapter-Vertrag (Kurzfassung)

Jeder Adapter nennt ID, Version, Zielsystem, Importweg und bekannte Grenzen. Er liefert pro Feature einen Abbildungsstatus `exact | transformed | manual | unsupported | blocked | untested`. Pflichtitems werden nie wegen Adaptergrenzen weggelassen. Grundlage: [RECHERCHE_Zielsysteme.md](RECHERCHE_Zielsysteme.md).
