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
| `PREVIOUS_STATE_KEPT` | info | eine Datei wurde abgelehnt, der zuvor geladene gültige Katalog bleibt unverändert (T04, T42) |
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

## Stufe `reference` (Register und Verweise)

Fehlende Verweisziele werden gebündelt: ein Befund je Ziel mit Anzahl der Vorkommen, statt vieler Folgefehler.

| Code | Severity | Bedeutung |
|---|---|---|
| `DUPLICATE_ID` | error | ID kommt in einem Register doppelt vor (Quellen, Rechte, Konstrukte, Instrumente, Antwortlisten, Items, Skalen, Module, Scoring, Evidenz, Abschnitte, versteckte Felder) |
| `DUPLICATE_OPTION_CODE` | error | Antwortcode kommt in einer Antwortliste doppelt vor |
| `DUPLICATE_VARIABLE_NAME` | error | `variableName` ist katalogweit nicht eindeutig (Items und versteckte Felder zusammen) |
| `MISSING_OPTION_SET` | error | Verweis auf unbekannte Antwortliste. Erwarteter Code für Testdatei 91 |
| `MISSING_ITEM` | error | Verweis auf unbekanntes Item (Skala, Modul, Vorlage, Scoring, Bedingung) |
| `MISSING_SOURCE` | error | Verweis auf unbekannte Quelle |
| `MISSING_RIGHTS_PROFILE` | error | Verweis auf unbekanntes Rechteprofil |
| `MISSING_CONSTRUCT` | error | Verweis auf unbekanntes Konstrukt |
| `MISSING_INSTRUMENT` | error | Verweis auf unbekanntes Instrument (auch Evidenz mit `targetType: instrument`) |
| `MISSING_SCALE` | error | Verweis auf unbekannte Skala |
| `MISSING_SCORE_DEFINITION` | error | Verweis auf unbekannte Scoring-Definition |
| `CONSTRUCT_CYCLE` | error | Konstrukthierarchie enthält einen Zyklus (auch Selbstbezug), einmal je Zyklus gemeldet |

## Stufe `content` (Sprachen, Features, Daten)

| Code | Severity | Bedeutung |
|---|---|---|
| `DEFAULT_LANGUAGE_NOT_LISTED` | error | `catalog.defaultLanguage` steht nicht in `languages` |
| `LANGUAGE_NOT_DECLARED` | error | ein Sprachschlüssel in einem Text steht nicht in `languages` |
| `MISSING_TRANSLATION` | warning | Teilnehmertexte fehlen in einer deklarierten Sprache (ein Befund je Sprache mit Anzahl). Ausgabe in dieser Sprache ist blockiert, es wird nichts automatisch übersetzt. Verwaltungstexte dürfen auf die Standardsprache zurückfallen und werden nicht gemeldet |
| `REQUIRED_FEATURE_MISSING` | error | `coreQuestions`, `requiredInclusion` oder `requiredAnswer` fehlt in `requiredFeatures` |
| `UNKNOWN_FEATURE` | error | deklariertes Feature wird von dieser Anwendungsversion nicht unterstützt. Normale Verarbeitung gesperrt, reine Diagnose bleibt möglich (T07) |
| `FEATURE_NOT_DECLARED` | error | der Katalog nutzt ein Feature (Module, wholeScale, Bedingungen, Slider, Ranking, Notiz, Zufallsreihenfolge, zusammengesetzte Bedingungen, Behavior-Extension), ohne es zu deklarieren |
| `DATE_ORDER_INVALID` | error | `updatedAt` liegt vor `createdAt` (Vergleich als Zeitpunkt, Zeitzonen berücksichtigt) |
| `ORDINAL_POSITIONS_INVALID` | error | ordinale Antwortliste: `ordinalPosition` fehlt, ist doppelt oder die Optionen stehen nicht aufsteigend |
| `RANGE_INVALID` | error | Untergrenze grösser als Obergrenze (Zahl, Textlänge, Datum, Auswahlanzahl). Gleiche Grenzen sind erlaubt |
| `ANSWER_UNSATISFIABLE` | error / warning | es gibt keine zulässige Antwort. error bei Antwortpflicht (z. B. `maxLength: 0`, `maxSelections: 0`, Mindestanzahl über der Optionenzahl), warning bei freiwilliger Frage |
| `EXCLUSIVE_CODE_UNKNOWN` | error | `exclusiveCodes` nennt einen Code, den die Antwortliste nicht enthält |
| `EXCLUSIVE_CODE_UNSELECTABLE` | error | exklusive Codes zusammen mit `minSelections` ≥ 2: sie wären nie wählbar |
| `SELECTION_LIMIT_EXCEEDS_OPTIONS` | warning | `maxSelections` grösser als die Zahl der Optionen |
| `SLIDER_RANGE_INVALID` | error | Slider: Minimum nicht kleiner als Maximum, oder Schrittweite grösser als der Bereich |
| `RANKING_MAX_EXCEEDS_OPTIONS` | error | Ranking: `maxRanks` grösser als die Zahl inhaltlicher Optionen |
| `PRESENTATION_INCOMPATIBLE` | error | Widget passt nicht zum Antworttyp (z. B. `checkbox` bei Einfachauswahl) |
| `TEMPLATE_ITEM_MISSING` | error | ein Item kommt in der Vorlage nicht vor. Jedes Item muss genau einmal erscheinen |
| `TEMPLATE_ITEM_DUPLICATE` | error | ein Item steht mehrfach in der Vorlage. Wiederholte Verwendung braucht ein Vorkommensmodell, das dieses Profil nicht hat (T43) |
| `CONDITION_SELF_REFERENCE` | error | ein Item hängt von sich selbst ab |
| `CONDITION_TRIGGER_NOT_BEFORE` | error | der Auslöser steht in der Vorlage nicht vor dem abhängigen Item |
| `CONDITION_OPERATOR_TYPE` | error | Operator passt nicht zum Auslöser: `equals`/`notEquals` nur Einfachauswahl, `contains`/`notContains` nur Mehrfachauswahl, Zahlenvergleiche nur Ganzzahl, Dezimalzahl, Slider |
| `CONDITION_VALUE_INVALID` | error | Wert ist kein Optionscode des Auslösers bzw. keine Zahl bei Zahlenvergleich |
| `CONDITION_CYCLE` | error | Sichtbarkeitsbedingungen bilden einen Zyklus |
| `ITEM_IN_MULTIPLE_MODULES` | error | ein Item gehört zu mehr als einem Modul |
| `MODULE_SCALE_NOT_CONTAINED` | error | eine in `scaleRefs` genannte Skala liegt nicht vollständig im Modul |
| `MODULE_DEFAULT_MISMATCH` | error | `allOrNothing`-Modul: `defaultSelected` eines Items weicht vom Modul ab |
| `MODULE_OPTIONAL_HAS_REQUIRED_ITEM` | error | optionales `allOrNothing`-Modul enthält ein Pflichtitem (T13) |
| `SCORE_MINIMUM_EXCEEDS_ITEMS` | error | `minimumAnswered` grösser als die Itemzahl |
| `SCORE_MAPPING_MISSING` / `SCORE_MAPPING_DUPLICATE` / `SCORE_MAPPING_EXTRA` | error | je Item genau ein Mapping: fehlt, doppelt oder für ein fremdes Item |
| `SCORE_ITEM_NOT_SINGLE_CHOICE` | error | nur Einfachauswahl kann in diesem Profil bewertet werden |
| `SCORE_CODE_UNCOVERED` / `SCORE_CODE_DUPLICATE` / `SCORE_CODE_UNKNOWN` | error | jeder Optionscode muss genau einmal in `rawToScore` oder `missingCodes` stehen: fehlt, doppelt oder unbekannt |
| `SCORE_ROLE_MISMATCH` | error | `missing`-Option in `rawToScore` oder `substantive`-Option in `missingCodes` |

Hinweis: Reine `metadata`-Extensions brauchen kein Feature, bleiben erhalten und werden nie ausgeführt (T08).

## Stufe `selection` (Auswahl und Projekte)

Diese Befunde tragen `context`: `initial` für die Anfangsauswahl des Katalogs (ein Fehler dort ist ein Konfigurationsfehler des Katalogs und wird nicht erst beim Export gemeldet), `project` für ein geladenes Projekt.

| Code | Severity | Bedeutung |
|---|---|---|
| `MANDATORY_ITEM_MISSING` | error | ein Pflichtitem (eigenes Flag oder Pflichtmodul) ist nicht ausgewählt |
| `MANDATORY_ITEM_ADDED` | info | beim Laden eines Projekts fehlte ein Pflichtitem und wurde ergänzt und gemeldet (T12). Nur Pflichtitems werden ergänzt, nichts sonst |
| `SCALE_PARTIAL_NOT_ALLOWED` | error | `wholeScale`: nichtleere Teilmenge. Es wird nicht still ergänzt (T17) |
| `PARTIAL_SCALE` | warning | `partialWithWarning`: Teilmenge, kein Original-Score, keine Berechtigung zur Originalauswertung (T18) |
| `MODULE_PARTIAL` | error | `allOrNothing`-Modul nur teilweise ausgewählt |
| `DEPENDENCY_NOT_SELECTED` | error | Folgefrage ausgewählt, ihr Auslöser nicht. Erwarteter Code für Testdatei 92 |
| `PROJECT_CATALOG_MISMATCH` | error | Projekt gehört zu einer anderen Katalog-ID oder -Version. Genaue Übereinstimmung ist Pflicht, es wird nichts geraten (T28) |
| `PROJECT_QUESTIONNAIRE_MISMATCH` | error | `questionnaireRef` passt nicht zur Vorlage des Katalogs |
| `PROJECT_LANGUAGE_UNKNOWN` | error | Projektsprache gehört nicht zu den Katalogsprachen |
| `UNKNOWN_ITEM_ID` | error | das Projekt wählt ein Item, das der Katalog nicht kennt. Wird gemeldet und ignoriert, nicht repariert |

## Stufe `rights` (Rechte und Handlungsmatrix)

Die Matrix ist eine **Produktpolitik für deklarierte Rechte**, keine juristische Aussage. Rechte werden pro ausgewähltem Item aufgelöst: `Item.rightsRef`, sonst `Instrument.rightsRef`, sonst «unbekannt/ungeprüft». Befunde sind je Grund zusammengefasst (Anzahl und erstes Item), nicht je Item. Severity ist bei `displayItems` `warning` (Text gesperrt, Katalog bleibt nutzbar), bei Codebuch und Export `error`.

| Handlung | benötigt je Item (alle `permitted`, Profil `reviewed`) | Katalogstatus |
|---|---|---|
| `displayItems` | `electronicDisplay` | jeder, bei `withdrawn` mit Rückzugshinweis |
| `saveProject` | nichts (nur Referenzen) | jeder technisch nutzbare |
| `saveCheckReport` | nichts (nur IDs und Befunde) | jeder |
| `codebookWithTexts` | `export`, `redistribution`, `electronicDisplay` | `draft`/`reviewed`/`released`; `withdrawn` nur mit klarer Markierung; `draft` mit Entwurfsvermerk |
| `nativeExport` | `export`, `redistribution`, `electronicAdministration` | nur `released` |
| `devTestExport` | wie `nativeExport`, **ohne** Umgehung von Verboten | `draft`/`reviewed`/`released`, nie `withdrawn`; als Testartefakt zu kennzeichnen |

Ein Fehler bei einer Nutzungsart, die die Handlung nicht braucht, blockiert sie nicht: `modification=prohibited` ist mit erlaubter unveränderter Nutzung vereinbar (T35).

| Code | Severity | Bedeutung |
|---|---|---|
| `RIGHTS_UNREVIEWED` | warning / error | das wirksame Rechteprofil ist nicht `reviewed`. Deklarierte Erlaubnisse sind dann nur eine ungeprüfte Erklärung, keine Freigabe |
| `RIGHTS_PERMISSION_UNKNOWN` | warning / error | eine für die Handlung nötige Nutzungsart ist `unknown` (T36) |
| `RIGHTS_PERMISSION_PROHIBITED` | warning / error | eine nötige Nutzungsart ist `prohibited` |
| `CATALOG_NOT_RELEASED` | error | reguläre native Exporte verlangen den Status `released` |
| `CATALOG_WITHDRAWN` | error / warning | Katalog wurde zurückgezogen: Exporte blockiert, Ansichten und Codebuch mit Rückzugshinweis |
| `DRAFT_WATERMARK_REQUIRED` | info | Ausgabe aus einem `draft`-Katalog muss «Entwurf – nicht für produktive Durchführung freigegeben» tragen |
| `TEST_ARTIFACT` | info | Entwicklungs-Testexport: als Testartefakt kennzeichnen, vom Schulablauf trennen, Freigabeverantwortung benennen |

## Stufe `export` (Adapter)

Gilt für die Export-Adapter (`targetPlatform` nennt das Zielsystem). Ein Fehler dieser Stufe verhindert die Datei, es wird nichts repariert. Die Rechtecodes oben (`CATALOG_NOT_RELEASED`, `RIGHTS_*`) gehören ebenfalls zu jedem Export.

| Code | Severity | Bedeutung |
|---|---|---|
| `EXPORT_SELECTION_INVALID` | error | die Auswahl hat ungelöste Konflikte |
| `EXPORT_LANGUAGE_UNKNOWN` | error | die Exportsprache gehört nicht zum Katalog |
| `EXPORT_TEXT_MISSING` | error | ein Text fehlt in der Exportsprache; es wird nie mit einer anderen Sprache aufgefüllt |
| `EXPORT_VARIABLE_NAME_INVALID` | error | Fragecode für das Zielsystem unzulässig; `remediation` nennt `exportHints.<plattform>.variableName` |
| `EXPORT_VARIABLE_NAME_DUPLICATE` | error | zwei Items bekämen denselben Fragecode |
| `EXPORT_OPTION_CODE_INVALID` | error | Antwortcode für das Zielsystem unzulässig; `remediation` nennt `exportHints.<plattform>.code` an der Option |
| `EXPORT_OPTION_CODE_DUPLICATE` | error | zwei Optionen bekämen denselben Exportcode |
| `EXPORT_EXCLUSIVE_UNSUPPORTED` | error | mehrere exklusive Optionen, das Zielsystem kennt eine |
| `EXPORT_CONDITION_TARGET_MISSING` | error | eine Bedingung verweist auf ein Item, das nicht im Fragebogen ist |
| `EXPORT_CONDITION_UNSUPPORTED` | error | die Bedingung ist im Zielsystem nicht ausdrückbar (sie wird nie weggelassen) |
| `EXPORT_SENSITIVE_INCLUDED` | info | ein standardmässig vom Export ausgeschlossenes sensibles Item ist ausdrücklich gewählt |
| `EXPORT_TEXT_RESERVED` | error | ein Text enthält `[[` oder `]]`, die das Zielsystem als Tag liest (Qualtrics) |
| `EXPORT_RESPONSE_UNSUPPORTED` | error | das Zielformat kennt den Antworttyp nicht (Qualtrics TXT: Slider); es gibt keinen Ersatz |
| `EXPORT_HIDDEN_FIELD_INVALID` | error | ein verstecktes Feld hat einen Namen oder Wert, den das Zielsystem nicht annimmt |
