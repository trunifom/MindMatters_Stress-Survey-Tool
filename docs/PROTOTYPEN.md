# Prototypen: REDCap, Google Forms, Unipark, SurveyMonkey, neutrale Tabelle

Stand 8. November 2026. Diese Ausgaben sind **Prototypen**. Sie sind nie gegen das echte Zielsystem gelaufen, weil bisher keine Testinstanz verfügbar ist. Sie zeigen im Konfigurator die Stufe «Prototyp, ungeprüft» und eine Liste ihrer Annahmen. Regeln wie bei allen Ausgaben: Rechte und Katalogstatus gelten (regulärer Export nur bei `released`, Testexport mit Kennzeichnung für Entwürfe), eine Sprache pro Datei, kein Auffüllen fehlender Texte, nichts wird still verändert, Bedingungen und Antworttypen, die das Ziel nicht kann, werden nicht weggelassen (ADR-007, ADR-008).

| Ziel | Datei | Was es ist | Stufe |
|---|---|---|---|
| REDCap | `…_redcap.csv` | Datenwörterbuch (18 Spalten) zum Hochladen im Projekt | Prototyp, Kopfzeile unbelegt |
| Google Forms | `…_googleForms.gs` | Apps-Script, das das Formular im eigenen Konto erzeugt | Prototyp, nie ausgeführt |
| Unipark | `…_unipark_bauplan.md` | Bauplan zum Nachbauen (kein Import dokumentiert) | Prototyp |
| SurveyMonkey | `…_surveymonkey_bauplan.md` | Bauplan, dazu Einfügetext für Auswahlfragen | Prototyp |
| Neutrale Tabelle | `…_csv_table.csv` | Eine Zeile je Item, für Menschen und Tabellenkalkulation | kein Prototyp, kein Import |

## REDCap (Datenwörterbuch)

Die Kopfzeile ist aus allgemeinem Wissen geschrieben. Das Drittschema <https://linkml.io/linkml-redcap/> bestätigt nur Reihenfolge und Bedeutung der 18 Spalten. **Vergleichen Sie vor dem Hochladen die erste Zeile mit einem Datenwörterbuch, das Sie aus Ihrem REDCap-Projekt herunterladen.**

| Katalog | REDCap |
|---|---|
| Einfachauswahl | `radio`, Auswahl als `Code, Beschriftung \| …` |
| Mehrfachauswahl | `checkbox` (jede Option wird eine Exportvariable) |
| Ganzzahl, Dezimalzahl | `text` mit Validierung `integer`, `number`, `number_1dp` bis `number_4dp`, Min/Max |
| Kurztext (E-Mail, Telefon) | `text` mit Validierung `email`, `phone` |
| Langtext | `notes` |
| Datum | `text` mit `date_ymd` |
| Slider | `slider` nur bei Bereich 0 bis 100 (REDCap kennt nur diesen), sonst Fehler `EXPORT_RESPONSE_UNSUPPORTED`, nie umgerechnet |
| Rangfolge | **Fehler**: REDCap hat keinen Rangfolgetyp |
| Textblock, Einleitung, Einwilligung, Datenschutz, Schluss | `descriptive` |
| Bedingung | Verzweigungslogik: `[var] = 'code'`, `[var(code)] = '1'` bei Mehrfachauswahl, `<>`, `and`/`or` |
| Pflichtantwort | `y` |
| Anweisung | Feldnotiz |
| Abschnitt | Abschnittsüberschrift am ersten Feld; Matrix-Gruppe nur bei aufeinanderfolgenden Einfachauswahlen mit gleichen Antworten |
| Namen | klein, Ziffern, Unterstrich (Schemaregel `^[a-z][a-z0-9_]*$`). Gross geschrieben ist ein Fehler, weil REDCap sonst still ändert; Abhilfe `exportHints.redcap.variableName`, Codes `Option.exportHints.redcap.code` |

Von Hand: Umfragetitel, Anweisungen, Abschlusstext, anonymer Link, Einwilligungsfeld, versteckte Felder, Auswahlgrenzen, zufällige Reihenfolge.

## Google Forms (Apps Script)

Google Forms hat keinen Dateiimport. Das Skript wird in <https://script.google.com> eingefügt und einmal ausgeführt (`createQuestionnaire`). Es legt ein **neues Formular im eigenen Konto** an und schreibt dessen Adressen ins Protokoll. Das Tool selbst sendet nichts.

- **Sicherheit:** Katalogtexte stehen ausschliesslich in JSON-Zeichenkettenliteralen (auch Zeilentrenner U+2028/2029 maskiert), nie als Code. Ein Test führt ein Skript mit feindlichem Text gegen eine Attrappe aus und prüft, dass der eingeschleuste Aufruf nie geschieht.
- Abgebildet: Einfachauswahl, Mehrfachauswahl, Kurztext (E-Mail, Link), Absatz, Datum, Zahl mit Prüfung, Skala (nur 0 oder 1 bis 2 bis 10), Abschnitte als Seiten, Pflichtantwort, Einleitung, Schlusstext.
- **Fehler:** Rangfolge, Bedingungen (kein Sprung wird erzeugt), Slider ausserhalb der Skala, doppelte Antwortbeschriftungen.
- **Codes gehen verloren:** Google speichert die Beschriftung, nicht den Code. Die Zuordnung (`option.codes`, «nicht möglich») sagt das; die Rückübersetzung läuft über das Codebuch.
- Annahme: die Namen der Apps-Script-Methoden stammen aus allgemeinem Wissen und wurden nicht ausgeführt.

## Unipark und SurveyMonkey (Bauplan)

Beide Systeme lesen laut Recherche keine Fragebogendatei, die dieses Tool erzeugen kann (Unipark: kein dokumentierter Import; SurveyMonkey: nur eingefügte Auswahl- und Textfragen oder die API mit OAuth). Der Bauplan ist ein Markdown-Dokument zum Nachbauen:

- Checkliste der Einstellungen der Umfrage (Titel, Anonymität, Fortschritt, Einwilligung, versteckte Felder),
- je Item: Typ in den Worten des Systems, Wortlaut, Anweisung, Hilfetext, Pflicht, Grenzen und Format, **Bedingung als Satz** («nur anzeigen, wenn …»), Antworttabelle mit Codes und Hinweis auf Missing-Optionen, Warnung bei sensiblen Items,
- SurveyMonkey zusätzlich ein Einfügetext für Auswahlfragen.

Es fällt nichts weg: alles, was der Plan nicht abnehmen kann, steht als Anweisung darin. Annahmen: die Typnamen im Editor stammen aus allgemeinem Wissen; Unipark-Spezialcodes für fehlende Werte (-77, -66, -99) sind nur sekundär belegt und werden nicht angewendet. **Offene Frage an Tivian oder die Hochschule:** gibt es einen Import strukturierter Fragebogen? Dann ersetzt eine Datei diesen Plan.

## Neutrale Tabelle (CSV)

Eine Zeile je gewähltem Item mit Reihenfolge, Abschnitt, ID, Variable, Typ, Wortlaut, Anweisung, Pflicht, Bedingung (als Satz), Optionen (`Code = Beschriftung`), Grenzen, Standardumfang, Quellen. CSV nach RFC 4180 (alle Zellen in Anführungszeichen), UTF-8 mit BOM für Umlaute in Tabellenkalkulationen. **Schutz vor Formeleinschleusung:** Zellen, die mit `=`, `+`, `-`, `@`, Tabulator oder Zeilenumbruch beginnen, erhalten ein vorangestelltes Hochkomma (der übliche Schutz; er verändert den Zelltext um ein Zeichen).

## Wie ein Prototyp zu «getestet» wird

1. Datei mit dem Testexport des Beispielkatalogs erzeugen (für Ziele ohne Slider, Bedingungen oder Rangfolge einen passenden Auswahlumfang nehmen; die Begründung im Konfigurator nennt, welche Items blockieren).
2. Im Zielsystem importieren bzw. ausführen und das Ergebnis mit der Zuordnung im Konfigurator vergleichen.
3. Abweichungen hier und in der Annahmenliste des Adapters festhalten, Adapter korrigieren, Tests ergänzen.
4. Erst danach die Stufe in `src/ui/views/check.ts` (`tier`) von «Prototyp» anheben und die README anpassen.
