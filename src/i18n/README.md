# src/i18n: Hinweis, Ordner ohne Code

Dieser Ordner enthält keinen Code. Die Texte der Oberfläche stehen in **[`src/ui/i18n.ts`](../ui/i18n.ts)**. Der Ordner war in der Architekturskizze für später vorgesehen («UI-Texte (später)», `docs/ARCHITEKTUR.md`) und ist nie gefüllt worden.

## Was `src/ui/i18n.ts` tut

- Zwei Wörterbücher, `DE` und `EN`, mit **denselben Schlüsseln**. Der Typ `TextKey` leitet sich aus `DE` ab, `EN` ist als `Record<TextKey, string>` typisiert: ein Schlüssel, der in `EN` fehlt oder nur dort steht, ist ein Compilerfehler.
- `t(key, params?)` liefert den Text in der eingestellten Sprache. Platzhalter der Form `{name}` werden aus `params` ersetzt, ein unbekannter Platzhalter bleibt sichtbar stehen.
- `setUiLang`/`getUiLang` setzen und lesen die Sprache. Die Oberfläche startet immer auf Deutsch (ADR-009); `app.ts` stellt die Sprache vor jedem Zeichnen aus dem Zustand ein.
- `allKeys()` liefert alle Schlüssel für Tests.

## Zwei Sprachen, nicht verwechseln

| | Oberflächensprache | Fragensprache |
|---|---|---|
| Was | Knöpfe, Hinweise, Erklärungen des Tools | Wortlaut von Fragen, Antworten, Titeln im Katalog |
| Woher | `src/ui/i18n.ts` | Katalog (`LocalizedText`), aufgelöst durch `core/localized.ts` |
| Einstellung | `AppState.uiLang` | `AppState.language` (Deutsch, sobald der Katalog `de` oder `de-*` führt) |
| Fehlt ein Text | nicht möglich (Compilerfehler) | Vorschau markiert den Rückfall, Exporte brechen mit `EXPORT_TEXT_MISSING` ab, nichts wird übersetzt |

Katalogtexte werden **nie** hier übersetzt. Auch Texte, die in Ausgabedateien stehen (zum Beispiel das Vermerkwort «[ENTWURF]» oder die Seitenbeschriftung der Druckansicht), gehören nicht in dieses Wörterbuch, sondern in die Ausgabemodule (`src/output`), weil sie von der Fragensprache abhängen und nicht von der Oberflächensprache.

## Etwas ergänzen

- **Neuer Text:** Schlüssel in `DE` und in `EN` eintragen, mit `t("schlüssel")` verwenden. Namensschema: `bereich.name`, zum Beispiel `out.saved`, `tab.items`.
- **Neue Oberflächensprache:** `UiLang` erweitern, ein weiteres Wörterbuch mit allen Schlüsseln anlegen und in `dictionaries` eintragen, Umschalter in `ui/app.ts` ergänzen. Der Compiler meldet jeden fehlenden Schlüssel.

## Tests

`tests/unit/ui/newfeatures.test.ts` und `tests/unit/ui/shell.test.ts` (Sprachumschaltung, Standard Deutsch), `tests/unit/ui/items.test.ts` und `preview.test.ts` (Fragensprache, T26). Der Test «i18n completeness» (`shell.test.ts`) geht über `allKeys()` und prüft, dass jeder Schlüssel in beiden Sprachen nicht leer ist und dieselben Platzhalter hat.
