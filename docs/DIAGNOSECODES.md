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

## Stufe `structure` (Version, Schema, Migration)

Zuerst prüft ein Gate Dokumenttyp und `schemaVersion`. Nur wenn es besteht, folgt die JSON-Schema-Prüfung. So entstehen bei einer falschen Version keine Hunderte Folgefehler (Abnahmetest T06).

| Code | Severity | Bedeutung |
|---|---|---|
| `DOCUMENT_NOT_OBJECT` | error | Wurzel ist kein JSON-Objekt |
| `SCHEMA_VERSION_MISSING` | error | `schemaVersion` fehlt oder ist kein String |
| `SCHEMA_VERSION_MIGRATION_REQUIRED` | error | Version (derzeit 0.3.0) wird nicht direkt verarbeitet, kann aber ausdrücklich migriert werden (`migrateToCurrent`) |
| `SCHEMA_VERSION_UNSUPPORTED` | error | unbekannte Version, keine stille Migration |
| `DOCUMENT_TYPE_MISMATCH` | error | `documentType` passt nicht (z. B. Projekt als Katalog geladen) |
| `MIGRATION_NOT_AVAILABLE` | error | `migrateToCurrent` kennt für diese Version keinen Weg |
| `MIGRATED_SCHEMA_VERSION` | info | Migration 0.3.0 → 0.4.0 durchgeführt, Inhalt unverändert |
| `INVALID_BOOLEAN` | error | Wert ist kein echter Boolean (z. B. `"true"` als Text). Erwarteter Code für Testdatei 90 |
| `INVALID_TYPE` | error | falscher JSON-Typ |
| `MISSING_FIELD` | error | Pflichtfeld fehlt. `jsonPath` zeigt auf das Elternobjekt, die Meldung nennt das Feld |
| `UNKNOWN_FIELD` | error | unbekanntes Feld in einem geschlossenen Objekt. Zusätze gehören nach `extensions` |
| `INVALID_VALUE` | error | Wert nicht in Aufzählung oder `const` |
| `INVALID_FORMAT` | error | Muster- oder Formatverletzung (ID, Version, Datum, URL, Sprachkennzeichen) |
| `DUPLICATE_ENTRY` | error | doppelter Eintrag in einer Liste mit eindeutigen Einträgen |
| `CONSTRAINT_VIOLATION` | error | Längen-, Mengen- oder Wertgrenze verletzt |
| `UNKNOWN_RESPONSE_KIND` | error | `response.kind` fehlt oder ist unbekannt (ein unbekannter Typ wird nie still als Text behandelt) |
| `SCHEMA_VIOLATION` | error | sonstige Schemaverletzung (z. B. bedingte Regel) |
| `TOO_MANY_DIAGNOSTICS` | info | Ausgabe auf 200 Strukturfehler gekürzt |

Bei `response` und `visibleWhen` wird der Zweig anhand der Daten gewählt (`kind`, bzw. `all`/`any`). Es erscheinen nur die Fehler dieses Zweigs, nicht die Fehlschläge aller Varianten.
