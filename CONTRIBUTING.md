# Arbeitsweise

## Grundsätze
- Ein Commit pro abgeschlossener Funktion. Jeder Commit enthält Code, Tests, betroffene Dokumentation und den Eintrag im [CHANGELOG.md](CHANGELOG.md).
- Keine Funktion ohne Test. Keine Regel ohne Diagnosecode im [Register](docs/DIAGNOSECODES.md).
- Schemas älterer Versionen werden nicht verändert (siehe [ADR-003](docs/ENTSCHEIDUNGEN.md)).
- Nicht verifizierte Angaben zu Zielsystemen werden als solche markiert, nicht als gesichert dargestellt.

## Commit-Nachrichten
Aufbau:

```
<typ>(<bereich>): <knappe Zusammenfassung im Imperativ, max. 72 Zeichen>

Was:      Welche Änderung wurde gemacht (Dateien, Verhalten).
Warum:    Hintergrund und Entscheidung, Verweis auf ADR/Dokument.
Tests:    Welche Tests neu sind, was sie abdecken, Ergebnis.
Grenzen:  Was bewusst nicht enthalten ist oder offen bleibt.
```

Typen: `feat`, `fix`, `docs`, `test`, `refactor`, `build`, `chore`, `schema`.
Bereiche z. B.: `core`, `model`, `adapters`, `ui`, `schema`, `docs`, `repo`.

## Tests
```bash
npm test                                         # Vitest (Unit)
npm run typecheck                                # tsc (mit und ohne DOM für den Kern)
npm run build                                    # dist/mindmatters.html
npm run test:e2e                                 # echter Browser (Edge/Chrome, MM_BROWSER_PATH wählbar)
python -I tests/conformance/validate_schema.py   # Schema-Konformanz (Gegencheck)
```

## Versionierte und nicht versionierte Dateien
Versioniert: Quellcode, Schemas, Dokumentation, Beispiele, Test-Fixtures. Nicht versioniert: `Dokumente_Start/`, `node_modules/`, `dist/`, Coverage, lokale Editordateien (siehe `.gitignore`).

## Sprache
Dokumentation und Commit-Nachrichten auf Deutsch. Code, Bezeichner und Diagnosecodes auf Englisch.

## Hinweis zum Build
`npm run build` erzeugt zuerst die Schema-Prüfer als JavaScript (`tools/gen-validators.mjs`, Ablage `dist/.gen/`, nicht versioniert) und bündelt dann die Einzeldatei. Ändert sich ein Schema, genügt ein neuer Build; `tests/unit/standalone.test.ts` stellt sicher, dass die erzeugten Prüfer wie die Laufzeit-Prüfer urteilen.
