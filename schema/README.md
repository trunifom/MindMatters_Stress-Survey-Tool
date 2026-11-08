# JSON-Schemas

| Ordner | Zweck |
|---|---|
| `0.3.0/` | Strukturelle Umsetzung des Datenvertrags in `Dokumente_Start/02_JSON_Datenvertrag.md`, unverändert. |
| `0.4.0/` | Rein additive Erweiterung (alle neuen Felder optional). Ein 0.3.0-Dokument wird mit der Änderung von `schemaVersion` auf `0.4.0` gültig. Begründung der Felder: `docs/RECHERCHE_Zielsysteme.md`, Abschnitt 3. Dazu `Option.exportHints.<plattform>.code` für Zielsysteme mit anderen Coderegeln (ADR-007), `questionnaire.lockedTexts` (standardisierte, nicht anpassbare Texte) und im Projekt `customization` (angepasste Texte und eigene Textblöcke, ADR-009). |

Draft 2020-12. Objekte sind geschlossen (`additionalProperties: false`), Zusätze gehören in `extensions`.

## Was das Schema prüft
Typen, Enums, ID-/Versions-/Sprachmuster, Pflichtfelder, `null`-Verbot, nichtleere Texte, bedingte Regeln (Antwortliste: `missing` braucht `missingReason`; `relative` braucht `amount`/`unit`; `inclusionRequired` verlangt `defaultSelected`; Module; Extensions `behavior` braucht `featureId`; Notiz-Items (Textblöcke mit `style` text, title, subtitle, notice) nie antwortpflichtig; Bedingungsgruppen).

## Was das Schema nicht prüfen kann (semantischer Validator, noch zu bauen)
Doppelte Objektschlüssel (macht `tests/conformance/validate_schema.py` beim Laden), eindeutige IDs je Register und katalogweit eindeutige `variableName`, alle Referenzen (`*Ref`), Vorlage enthält jedes Item genau einmal, ein Item höchstens in einem Modul, Zyklen bei Konstrukten und Bedingungen, Auslöser vor Folgefrage, Bedingungswert ist Optionscode, `min <= max`, Mehrfachauswahl erfüllbar, exklusive Codes, Optionspositionen, Pflichtmenge und Initialauswahl, Skalenregeln, Score-Mappings vollständig, `updatedAt >= createdAt`, jede verwendete Funktion in `requiredFeatures` deklariert, Maximalwerte für Dateigrösse und Verschachtelung.

Die negativen Testdateien 91 und 92 sind deshalb absichtlich schemagültig.

## Feature-IDs (`requiredFeatures`)
`coreQuestions`, `requiredInclusion`, `requiredAnswer` (immer); `selectionModules`, `wholeScaleSelection`, `simpleVisibility` (0.3.0); neu in 0.4.0: `compoundVisibility`, `sliderResponse`, `rankingResponse`, `noteItems`, `randomization`.

## Tests
`python -I tests/conformance/validate_schema.py` prüft die elf Fixtures gegen 0.3.0 und (nach expliziter Migration) 0.4.0, das Beispiel `examples/catalog_rich_0_4_0.json` und 36 Mutationen, die alle abgelehnt werden müssen.
