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
src/core/       Laden (Syntax, doppelte Schlüssel, Grössenlimits), Schema-Prüfung (ajv, im Browser vorab erzeugt),
                semantische Prüfung, Migration, Diagnosen
src/model/      Auswahlzustand, wirksame Pflichtmenge, Exportmodell
src/adapters/   je Zielsystem ein Ordner, reine Funktion: Exportmodell → {artifacts, diagnostics, mapping}
src/ui/         Ansichten (Liste, Info-Fenster, Vorschau, Prüfung/Ausgabe), Zustand, Texte (de/en)
src/i18n/       UI-Texte (später)
```

Abhängigkeitsrichtung: `ui → model → core`. `adapters` hängen nur von `model` und `core` ab. `core` kennt weder DOM noch Browser, läuft also identisch in Node (Tests) und im Browser.

## Build zur Einzeldatei (`tools/build.mjs`)

`npm run build` bündelt `src/ui/main.ts` mit esbuild (IIFE, minifiziert, Syntax auf ES2019 abgesenkt), fügt CSS und JavaScript in die Vorlage `src/ui/index.html` ein und schreibt `dist/mindmatters.html` samt `.sha256`. Der Build ist reproduzierbar (zweimal gebaut, gleiche Prüfsumme).

- **Kein Netzwerk:** keine externen Skripte, Stylesheets, Schriften, Bilder oder Frames. Im Bundle kommt keine Netzwerk-API vor (`fetch`, `XMLHttpRequest`, `WebSocket`, `sendBeacon` …). Ein Test prüft das.
- **Content-Security-Policy** als zweite Verteidigungslinie (Meta-Tag): `default-src 'none'`, `connect-src 'none'`, `frame-src 'none'`, `object-src 'none'`, `base-uri 'none'`, `form-action 'none'`. Verbindungen wären damit auch bei einem Fehler im Code verboten.
- **Kein `unsafe-eval`:** Die Schema-Prüfer werden beim Build mit ajv standalone als reines JavaScript erzeugt (`tools/gen-validators.mjs`), der Build tauscht `src/core/schemas.ts` gegen `src/core/schemas.standalone.ts`. Die Seite führt keinen Code aus Zeichenketten aus, die CSP erlaubt nur `script-src 'unsafe-inline'`. Ein Test vergleicht die erzeugten Prüfer mit den zur Laufzeit übersetzten (`tests/unit/standalone.test.ts`), ein weiterer prüft, dass Bundle und CSP kein `eval` enthalten. Die Unit-Tests selbst laufen weiter mit den Laufzeit-Prüfern in Node.
- **Browser:** Syntaxziel ES2019. `structuredClone` und `<dialog>` werden bewusst nicht verwendet. Welche Browser tatsächlich geprüft sind, steht in [BROWSER.md](BROWSER.md); alles dort nicht Genannte ist nur ein Ziel.
- **Typprüfung:** `core`, `model` und `output` werden zusätzlich mit einer Konfiguration ohne DOM-Bibliothek geprüft (`tsconfig.core.json`), damit sie nie versehentlich den Browser voraussetzen.

## Lade-Pipeline (`src/core/loader.ts`)

```
Text → strikter JSON-Leser (Syntax, doppelte Schlüssel, Limits)
     → [ausdrückliche Migration 0.3.0 → 0.4.0, nur mit migrate=true]
     → Versions-/Typ-Gate → JSON Schema
     → Register, Verweise, Sprachen, Features, Antworten, Vorlage, Bedingungen, Module, Scoring
     → Anfangsauswahl des Katalogs
     → nutzbarer Katalog
```

- **Alles oder nichts:** Ein Katalog wird nur zurückgegeben, wenn keine Stufe einen Fehler meldet. Die Diagnosen aller gelaufenen Stufen kommen immer mit, damit eine fehlerhafte Datei trotzdem analysiert werden kann.
- **Anfangsauswahl:** Sie wird nur beurteilt, wenn die Verweise des Katalogs stimmen. Ein Widerspruch dort ist ein Konfigurationsfehler des Katalogs (Diagnose mit `context: "initial"`) und nie erst ein späterer Exportfehler.
- **Transaktional:** `replaceCatalog` ersetzt den Zustand nur bei Erfolg. Bei einem Fehler bleibt der alte gültige Zustand dasselbe Objekt (Diagnose `PREVIOUS_STATE_KEPT`).
- **Getrennte Prüfstatus** (`pass | warning | fail | notRun`): technische Gültigkeit, Auswahl, Rechte, Export. Rechte und Export sind noch `notRun`.
- **Projekte:** `loadProject` verlangt die exakte Katalog-ID und -Version. Fehlende Pflichtitems werden ergänzt und gemeldet, alle anderen Konflikte bleiben als bearbeitbarer Zwischenstand sichtbar.

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
├── src/               core/  model/  output/ (Codebuch, Bericht, Adapter, ZIP)  ui/
├── tests/
│   ├── unit/          Vitest, läuft in Node
│   ├── e2e/           Browser-Tests gegen das gebaute HTML (playwright-core, installierter Edge/Chrome)
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
