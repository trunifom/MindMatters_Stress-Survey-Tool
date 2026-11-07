# Export für LimeSurvey

Stand 7. November 2026. **Der Adapter ist an keiner echten LimeSurvey-Instanz getestet.** Die Tests prüfen, dass die erzeugte Datei in sich stimmig ist und dass nichts still verändert wird. Ob LimeSurvey die Datei so liest, wie hier beschrieben, belegt erst der Importtest (Abschnitt «Importtest»).

## Was erzeugt wird

Eine tab-getrennte Strukturdatei (`.txt`, UTF-8 mit Byte-Order-Mark, Zeilenende LF) im Format «Tab Separated Value survey structure». Sie wird in LimeSurvey über *Umfrage importieren* hochgeladen.

| Datei | Wann |
|---|---|
| `<katalog>_<version>_limesurvey.txt` | regulärer Export: Katalogstatus `released`, Rechte aller gewählten Items bestätigt |
| `<katalog>_<version>_limesurvey_TEST.txt` | Entwicklungs-Testexport: zusätzlich für `draft` und `reviewed`. Der Umfragetitel beginnt mit «[TEST – …]». Er umgeht kein Rechteverbot |

Es wird **eine Sprache** pro Datei geschrieben, die Sprache der Fragen im Konfigurator. Fehlt irgendein Text in dieser Sprache, gibt es keine Datei, sondern den Befund `EXPORT_TEXT_MISSING`. Es wird nie mit einer anderen Sprache aufgefüllt.

## Grundsätze

1. **Nichts wird still verändert.** Ein Name oder Code, den LimeSurvey nicht annimmt, ist ein Fehler mit Hinweis, kein stilles Kürzen.
2. **Bedingungen werden nicht fallengelassen.** Was LimeSurvey nicht ausdrücken kann, ist ein Fehler (`EXPORT_CONDITION_UNSUPPORTED`), weil die Frage sonst für alle erschiene.
3. **Kein Zeichen mit Sonderbedeutung in Zellen.** Tabulator, Zeilenumbruch und doppelte Anführungszeichen kommen in keiner Zelle vor. Texte werden HTML-maskiert (`<`, `>`, `&`, `"`), geschweifte Klammern werden numerische Zeichen (sonst wertet der Expression Manager sie aus), Zeilenumbrüche werden `<br />`. Bedingungen verwenden einfache Anführungszeichen.
4. **Rechte zuerst.** Der Export läuft nur, wenn die Rechtematrix für `nativeExport` (oder `devTestExport`) alle gewählten Items freigibt und die Auswahl keine Konflikte hat.

## Zuordnung

| Katalog | LimeSurvey | Stufe |
|---|---|---|
| Einfachauswahl | Liste (Radio), Typ `L`, Antworten als Klasse `A` | genau |
| Mehrfachauswahl | Typ `M`, je Option eine Unterfrage (`SQ`); `minSelections`/`maxSelections` → `min_answers`/`max_answers`, genau ein exklusiver Code → `exclude_all_others` | genau / umgewandelt |
| Ganzzahl, Dezimalzahl | Typ `N`, Grenzen als `min_num_value_n`/`max_num_value_n`, Ganzzahl → `num_value_int_only` | genau |
| Kurztext, Langtext | Typ `S`, Typ `T` | genau |
| Datum | Typ `D` | genau |
| Slider | Typ `K` mit einer Unterfrage und `slider_layout`, `slider_min`, `slider_max`, `slider_accuracy` | umgewandelt |
| Rangfolge | Typ `R`, `maxRanks` → `max_answers` | genau |
| Textblock (`note`) | Typ `X`; Stil (Titel, Hinweis) geht verloren | umgewandelt |
| Abschnitt | eine Fragegruppe (= eine Seite) | umgewandelt |
| Einleitung | Begrüssungstext der Umfrage | umgewandelt |
| Schlusstext, Hilfsangebote | Schlusstext der Umfrage (zusammen) | umgewandelt |
| Einwilligung, Elterninformation, Datenschutzhinweis | Textblöcke in einer ersten Gruppe | von Hand (Einwilligungsfeld, Pflicht, Abbruch bei Ablehnung) bzw. umgewandelt |
| Sichtbarkeitsbedingung | Relevanz-Gleichung (Expression Manager), einfach und `all`/`any` | umgewandelt |
| Pflichtantwort | Spalte `mandatory` = `Y` | genau |
| Zufällige Antwortreihenfolge | `random_order` | umgewandelt |
| Missing-Optionen («weiss nicht», «keine Angabe») | gewöhnliche Antworten | umgewandelt |
| Versteckte Felder | nicht geschrieben | von Hand |
| Hilfetext für Teilnehmende, Warntext sensibler Items, eigene Pflichthinweise | nicht geschrieben | von Hand |
| Dezimalstellen, Textlängen, Einheiten, Textformat (E-Mail, Link, Telefon), Datumsgrenzen | nicht geschrieben | von Hand / nicht möglich |
| Matrix-/Tabellenlayout | jedes Item einzeln | umgewandelt |

Die genaue, auf die Auswahl zugeschnittene Zuordnung zeigt der Konfigurator unter *Zuordnung zum Zielsystem* (Stufen `exact`, `transformed`, `manual`, `unsupported`). Sie ist die verbindliche Liste dessen, was nach dem Import von Hand zu prüfen ist.

## Namen und Codes

| Was | Regel des Adapters | Wo anpassen |
|---|---|---|
| Fragecode | nur Buchstaben und Ziffern, beginnt mit Buchstabe, höchstens 20 Zeichen, eindeutig (Gross-/Kleinschreibung zählt nicht) | `Item.exportHints.limesurvey.variableName` |
| Antwort- und Unterfragencode | nur Buchstaben und Ziffern, höchstens 5 Zeichen, eindeutig je Frage | `Option.exportHints.limesurvey.code` (neu, Schema 0.4.0) |

Der Katalogcode bleibt die Identität der Option. Der Hinweis wird nur beim Schreiben für diese Plattform benutzt, Bedingungen und Auswertungen im Katalog bleiben unverändert. Ohne Hinweis wird nie gekürzt oder umgeschrieben. Ein Beispiel steht in `examples/catalog_rich_0_4_0.json`.

## Befunde des Exports

| Code | Bedeutung |
|---|---|
| `EXPORT_SELECTION_INVALID` | die Auswahl hat ungelöste Konflikte |
| `EXPORT_LANGUAGE_UNKNOWN` | die Sprache gehört nicht zum Katalog |
| `EXPORT_TEXT_MISSING` | ein Text fehlt in der Exportsprache |
| `EXPORT_VARIABLE_NAME_INVALID` / `_DUPLICATE` | Fragecode unzulässig oder doppelt |
| `EXPORT_OPTION_CODE_INVALID` / `_DUPLICATE` | Antwortcode unzulässig oder doppelt |
| `EXPORT_EXCLUSIVE_UNSUPPORTED` | mehrere exklusive Optionen, LimeSurvey kennt eine |
| `EXPORT_CONDITION_TARGET_MISSING` | eine Bedingung verweist auf ein Item, das nicht im Fragebogen ist |
| `EXPORT_CONDITION_UNSUPPORTED` | die Bedingung ist für LimeSurvey nicht ausdrückbar |
| `EXPORT_SENSITIVE_INCLUDED` (info) | ein standardmässig vom Export ausgeschlossenes sensibles Item ist ausdrücklich gewählt |

Dazu kommen die Rechtebefunde (`CATALOG_NOT_RELEASED`, `RIGHTS_*`), siehe [DIAGNOSECODES.md](DIAGNOSECODES.md).

## Was die Quelle sagt und was nicht

Grundlage: die Herstellerseite <https://www.limesurvey.org/manual/Tab_Separated_Value_survey_structure> (Stand der Seite 26. Januar 2021, am 7. November 2026 gelesen).

**Auf der Seite belegt:** die 14 festen Spalten (`id`, `related_id`, `class`, `type/scale`, `name`, `relevance`, `text`, `help`, `language`, `validation`, `mandatory`, `other`, `default`, `same_default`); die Klassen `S`, `SL`, `G`, `Q`, `SQ`, `A`; Beziehungen ergeben sich aus der Reihenfolge; weitere Spalten sind «eine alphabetische Liste der Datenbank-Feldnamen der erweiterten Fragecodes»; Import von ASCII/UTF-8 mit Endung `.txt`; mehrere Sprachen als je ein Zeilenblock.

**Auf der Seite nicht belegt (Annahmen des Adapters, in der Datei `src/output/limesurvey.ts` als `LIMESURVEY_ASSUMPTIONS` geführt und im Konfigurator angezeigt):**

1. Die Typbuchstaben (`L`, `M`, `N`, `S`, `T`, `D`, `K`, `R`, `X`).
2. Die Namen der erweiterten Attribute (`min_answers`, `max_answers`, `exclude_all_others`, `num_value_int_only`, `min_num_value_n`, `max_num_value_n`, `slider_layout`, `slider_min`, `slider_max`, `slider_accuracy`, `random_order`).
3. Die Längen- und Zeichenregeln für Codes.
4. BOM und LF beim Import.
5. Die Syntax der Relevanz-Gleichungen (`Code.NAOK`, `Code_unter.NAOK`, `==`, `&&` …).
6. Dass die Maskierung mit Entitäten bei der Anzeige und im Expression Manager wie erwartet wirkt.

Die Seite nennt keine Beispielzeilen und keine Escape-Regeln. Der Adapter vermeidet deshalb jede Zelle, die Escape-Regeln bräuchte (siehe Grundsatz 3). Die Spalten `id`/`related_id` sind laut Seite nur für Quoten gedacht und optional, die Abschnitte zu Gruppen und Fragen nutzen `id` aber. Der Adapter schreibt `id` (Gruppen, Fragen, Antworten) und lässt `related_id` leer.

## Importtest (noch offen)

Das braucht eine LimeSurvey-Instanz (Version 5 oder 6) und den Testexport der Beispielkatalogdatei:

1. Beispielkatalog laden, Tab «Prüfung und Ausgabe», *Testexport für LimeSurvey*.
2. In LimeSurvey: *Umfrage erstellen → Importieren → Datei wählen (`.txt`)*.
3. Prüfen: Import ohne Fehlermeldung; Gruppen und Fragen in der erwarteten Reihenfolge; Antworten mit den Codes `1`–`5`, `ref`; Slider als Schieberegler; Bedingung der Kontaktfrage (nur wenn «Hilfe gewünscht» = ja und Stimmung < 30); Pflichtfragen; Texte ohne sichtbare Entitäten wie `&lt;`; Umlaute in `de-CH`.
4. Jede Abweichung in dieser Datei festhalten und den Adapter oder die Annahmenliste korrigieren.

Erst nach diesem Test darf die README «getestet» für LimeSurvey schreiben.
