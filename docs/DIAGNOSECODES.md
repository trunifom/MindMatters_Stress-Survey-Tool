# Diagnosecodes

Register aller Codes, die der Validator ausgibt. Jede neue Regel trägt hier ihren Code ein (siehe [CONTRIBUTING.md](../CONTRIBUTING.md)).

## Aufbau einer Diagnose

| Feld | Bedeutung |
|---|---|
| `code` | stabiler, englischer Bezeichner in GROSSBUCHSTABEN mit Unterstrichen |
| `severity` | `error` blockiert den betroffenen Vorgang · `warning` muss vor Export bestätigt werden · `info` erläutert |
| `stage` | `file`, `structure`, `reference`, `selection`, `content`, `rights`, `export` |
| `message` | englischer Standardtext. Die Oberfläche lokalisiert anhand des Codes, der Text wird nie ausgewertet |
| `jsonPath` | JSON Pointer (RFC 6901), z. B. `/items/3/response/kind` |
| `itemRef`, `moduleRef`, `scaleRef`, `targetPlatform` | optionale Bezüge |
| `remediation` | optional: Hinweis zur Behebung |
| `context` | `initial` (Anfangsauswahl des Katalogs) oder `project` (geladenes Projekt) |

## Stufe `file` (Lesen der Datei)

| Code | Severity | Bedeutung |
|---|---|---|
| `JSON_SYNTAX_ERROR` | error | kein gültiges JSON (Kommentare, Kommata, Anführungszeichen, abschliessender Inhalt). Meldung nennt Zeile und Spalte |
| `JSON_DUPLICATE_KEY` | error | ein Objektschlüssel kommt im selben Objekt doppelt vor. `jsonPath` zeigt auf den zweiten Schlüssel |
| `LIMIT_EXCEEDED` | error | Grössenlimit überschritten (Bytes, Verschachtelungstiefe, Anzahl Werte oder Stringlänge). Werte sind vorläufig, siehe `src/core/limits.ts` |
