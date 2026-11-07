# Export für Qualtrics

Stand 7. November 2026. **Der Adapter ist an keiner echten Qualtrics-Instanz getestet.** Die Tests prüfen, dass die Datei in sich stimmig ist und dass nichts still verändert wird. Ob Qualtrics sie so liest, belegt erst ein Importtest (Abschnitt «Importtest»).

## Was erzeugt wird

Eine TXT-Datei im **Advanced Format** (`<katalog>_<version>_qualtrics.txt`, Testexport `…_qualtrics_TEST.txt`), UTF-8 ohne Byte-Order-Mark. In Qualtrics: *Survey → Tools → Import/Export → Import survey*. Laut Herstellerseite **ergänzt** ein TXT-Import eine bestehende Umfrage. Legen Sie dafür zuerst eine leere Umfrage an.

Es gelten dieselben Zugangsregeln wie bei LimeSurvey: regulärer Export nur bei Katalogstatus `released` und bestätigten Rechten, der gekennzeichnete Testexport auch für Entwürfe, ohne ein Rechteverbot zu umgehen, eine Sprache pro Datei, kein Auffüllen fehlender Texte.

## Was das Format nicht kann

Die Herstellerseite nennt für den TXT-Import weder erzwungene Antworten noch Validierung, Anzeige- oder Sprunglogik. Es gibt keinen Slider und keinen Datumstyp. Daraus folgt, nach ADR-007:

| Katalog | Verhalten |
|---|---|
| Sichtbarkeitsbedingung (`visibleWhen`) | **Fehler** `EXPORT_CONDITION_UNSUPPORTED`. Die Frage würde sonst allen angezeigt (z. B. eine Kontaktfrage, die nur nach «Hilfe gewünscht» erscheinen soll). Abhilfe: Item oder Auslöser abwählen oder den Fragebogen von Hand bauen |
| Slider | **Fehler** `EXPORT_RESPONSE_UNSUPPORTED`, kein Ersatz durch einen anderen Typ |
| Pflichtantwort | geschrieben wird nichts. Zuordnung `manual` («erzwungene Antwort in Qualtrics setzen») |
| Zahlen- und Textgrenzen, Zahlentyp, Datumsformat | `manual` |
| Anzahl der Auswahlen, exklusive Option, zufällige Reihenfolge | `manual` |

Ein Katalog mit Bedingungen oder Slidern ist damit für Qualtrics (TXT) nicht ohne Weiteres exportierbar. Das ist eine Eigenschaft des Zielformats, nicht des Adapters. Der QSF-Weg wäre weiter, ist aber nicht dokumentiert und nicht Ziel dieses Adapters.

## Zuordnung

| Katalog | Qualtrics | Stufe |
|---|---|---|
| Einfachauswahl | `[[Question:MC:SingleAnswer]]` mit `[[AdvancedChoices]]` und `[[Choice:<Recode>]]` | genau |
| Mehrfachauswahl | `[[Question:MC:MultipleAnswer]]` | genau |
| Rangfolge | `[[Question:RO]]` mit Recodes, Maximalzahl nicht schreibbar | umgewandelt |
| Kurztext | `[[Question:TE:SingleLine]]` | genau |
| Langtext | `[[Question:TE:Essay]]` | genau |
| Ganzzahl, Dezimalzahl, Datum | `[[Question:TE:SingleLine]]`, Validierung von Hand | umgewandelt |
| Textblock | `[[Question:DB]]`, Stil geht verloren | umgewandelt |
| Abschnitt | `[[Block:<Titel>]]`, Anweisung als Textblock | umgewandelt |
| Einleitung, Einwilligung, Datenschutz | Textblöcke im ersten Block | umgewandelt, Einwilligungsfeld von Hand |
| Schlusstext, Hilfsangebote | Textblöcke im letzten Block | umgewandelt |
| Versteckte Felder | `[[ED:<Name>]]` bzw. `[[ED:<Name>:<Wert>]]` | genau / umgewandelt |
| Missing-Optionen | gewöhnliche Auswahl | umgewandelt |
| Mehrsprachigkeit | eine Sprache pro Datei | nicht möglich |

Die auf die Auswahl zugeschnittene Zuordnung zeigt der Konfigurator unter *Zuordnung zum Zielsystem*.

## Namen und Codes

| Was | Regel des Adapters | Wo anpassen |
|---|---|---|
| Exportname (`[[ID:…]]`) | Buchstabe, dann Buchstaben, Ziffern, Unterstrich, eindeutig | `Item.exportHints.qualtrics.variableName` |
| Recode-Wert | ganze Zahl (Annahme), eindeutig je Frage | `Option.exportHints.qualtrics.code` |

Texte, die `[[` oder `]]` enthalten, sind ein Fehler (`EXPORT_TEXT_RESERVED`), weil Qualtrics sie als Tag läse. Markup wird zu Entitäten, Zeilenumbrüche zu `<br>`.

## Was die Quelle sagt und was nicht

Grundlage: <https://www.qualtrics.com/support/survey-platform/survey-module/survey-tools/import-and-export-surveys/> (am 7. November 2026 gelesen).

**Belegt:** die Tags `[[AdvancedFormat]]`, `[[Block:…]]`, `[[Question:Typ:Untertyp]]` (MC, Matrix, TE, CS, RO, DB), `[[ID:…]]`, `[[AdvancedChoices]]` mit `[[Choice:Recode]]`, `[[ED:Feld:Wert]]`, `[[PageBreak]]`; Untertypen SingleAnswer, MultipleAnswer, SingleLine, Essay, Form; UTF-16 lädt nicht hoch; TXT ergänzt eine bestehende Umfrage.

**Nicht belegt (Annahmen des Adapters, `QUALTRICS_ASSUMPTIONS`, im Konfigurator angezeigt):** Recodes müssen ganze Zahlen sein; UTF-8 ohne BOM; Kombination RO mit Recodes; Behandlung von HTML in Texten; Regeln für Exportnamen; Verhalten der Blöcke beim Import.

Die Seite zeigt ausserdem keinen Slider-Typ und keine Selektor-Abkürzungen (SAVR, MAVR). Auch widerspricht sie sich bei `[[Block]]` und `[[Block:Name]]` (Regel und Beispiel). Der Adapter nutzt die Form mit Namen.

## Importtest (offen)

1. Leere Umfrage anlegen. Aus dem Beispielkatalog ohne Slider und Bedingungen (siehe `tests/unit/qualtrics.test.ts`, Funktion `exportable`) den Testexport erzeugen.
2. *Import survey → Datei wählen*.
3. Prüfen: Fehlermeldung des Imports; Blöcke und Fragen in Reihenfolge; Recodes (Daten-Ansicht oder Datenexport); Text ohne sichtbare Entitäten; Embedded Data im Umfragefluss; Umlaute in `de-CH`.
4. Abweichungen hier festhalten und Adapter oder Annahmenliste korrigieren.

Erst danach darf die README «getestet» für Qualtrics schreiben.
