# Benutzerhandbuch für Schulen und Organisationen

Dieses Handbuch beschreibt den heutigen Stand. Was noch nicht geht, steht im letzten Abschnitt.

## Was Sie brauchen
- die Datei `mindmatters.html` (eine einzige Datei, öffnet sich per Doppelklick im Browser),
- eine Katalogdatei (`.json`), die Sie vom Herausgeber des Fragebogens erhalten haben.

Es braucht keine Installation, kein Konto und keine Internetverbindung. Die Dateien werden nur in Ihrem Browser gelesen. Es wird nichts hochgeladen und keine Antwort von Befragten erhoben.

Hinweis zum Versand: Manche E-Mail-Programme blockieren `.html`-Anhänge. Verschicken Sie dann ein ZIP.

## Ablauf in vier Schritten

### 1. Laden
Auf der Startseite **Katalog laden** wählen und die Katalogdatei auswählen. Bei einem Fehler wird die Datei nicht übernommen. Die Befunde zeigen Code und Stelle, ein bereits geladener Katalog bleibt unverändert. Eine ältere Katalogversion (0.3.0) wird nur auf Ihren ausdrücklichen Klick übernommen.

Oben sehen Sie Titel, Katalog-ID, Version, Status und die Sprache der Fragen. Vier Statuschips zeigen getrennt: technische Gültigkeit, Auswahl, Rechte und Freigabe, Zielsystem.

- **Entwurf** (`draft`): Der Katalog ist nicht für den produktiven Einsatz freigegeben. Ein Hinweis begleitet Sie, ein regulärer Export ist gesperrt.
- **Zurückgezogen** (`withdrawn`): Der Herausgeber hat den Katalog zurückgezogen. Nicht für neue Befragungen verwenden.

### 2. Auswählen (Tab «Fragen und Module»)
- **Standardumfang:** Items mit der Beschriftung «Standardumfang – nicht abwählbar» sind fest vorgegeben. Das gilt auch für alle Items eines Pflichtmoduls.
- **Optionale Items** wählen Sie per Checkbox. Bei Modulen, die nur vollständig gewählt werden können, schalten alle Items gemeinsam.
- **Alles abwählen** entfernt alle optionalen Items, der Standardumfang bleibt. **Standardauswahl wiederherstellen** stellt den Anfangszustand her.
- **Suche und Filter** (Text, Dimension, Modul, Auswahl) ändern nur die Anzeige, nie Ihre Auswahl und nie die Reihenfolge im Fragebogen.
- **Hinweise zur Auswahl** warnen zum Beispiel, wenn nur ein Teil einer Skala gewählt ist. Eine Teilskala ist keine Originalskala und berechtigt nicht zur Originalauswertung. Bei Skalen, die nur vollständig gewählt werden dürfen, ist eine Teilauswahl ein Fehler, der vor dem Export gelöst sein muss.
- **Info-Knopf (i):** zeigt Messziel, Dimensionen und Skalen, Quelle, Instrumentfassung und Originalnummer, Zielgruppe, Bezugszeitraum, Anweisung und Antwortformat, Grenzen der Auswahl und Auswertung, Übersetzungsstatus, Rechte und Besonderheiten für den Export. Was der Katalog nicht angibt, steht als «nicht dokumentiert». Das Tool rät nichts. Mit Escape schliessen Sie das Fenster.
- **Gesperrte Texte:** Ist die Anzeige eines Items nicht erlaubt oder die Erlaubnis nicht geprüft, sehen Sie nur die ID und den Hinweis «Text gesperrt». Das Item bleibt wählbar.
- **Textblöcke** (Titel, Erklärung, Hinweis) sind Einträge wie Fragen: Sie erscheinen in der Liste und in der Vorschau und können fest vorgegeben oder wählbar sein.

### 3. Prüfen (Tab «Vorschau» und «Prüfung und Ausgabe»)
- **Vorschau:** zeigt den Fragebogen so, wie Teilnehmende ihn sähen: Einleitung, Einwilligung, Datenschutz, Abschnitte, Fragen mit Antwortformat, Hilfsangebote, Schlusstext. Alle Felder sind gesperrt, es werden keine Antworten erfasst. Bedingte Fragen zeigen als Hinweis, wann sie erscheinen. Das Aussehen kann im Zielsystem abweichen.
- **Sprache der Fragen:** Fehlt ein Text in der gewählten Sprache, wird der Text der Standardsprache angezeigt und markiert. Es wird nie automatisch übersetzt.
- **Befunde:** Fehler müssen gelöst werden, Hinweise sollten Sie lesen.

### 4. Ausgeben (Tab «Prüfung und Ausgabe»)
- **Projekt speichern:** erzeugt `<katalog>_<version>_project.json`. Sie enthält die genaue Katalogversion und Ihre Auswahl, keine Fragetexte. Später öffnen Sie dieselbe Katalogdatei, wählen **Projekt laden** und arbeiten weiter. Fehlende Pflichtitems ergänzt das Tool und meldet es. Alles andere wird nicht still repariert. Speichern ist auch mit offenen Konflikten möglich, sie bleiben sichtbar.
- **Prüfbericht speichern:** technisches Protokoll mit IDs und Befunden, ohne Fragetexte. Ein Hinweis zeigt, wenn der zuletzt gespeicherte Bericht nach Änderungen veraltet ist. Eine Auswahl mit Konflikten ist im Bericht als «nicht gültiger Fragebogen» gekennzeichnet.
- **Codebuch speichern:** Markdown-Beschreibung der Auswahl mit Wortlaut, Antwortcodes, Einschränkungen und Quellen. Das ist kein Import für Umfragetools. Bei Entwurfskatalogen trägt es den Vermerk «Entwurf – nicht für produktive Durchführung freigegeben». Items ohne bestätigte Rechte erscheinen nur mit ID. Schulbezeichnung und interne Notizen kommen nur ins Codebuch, wenn Sie das ausdrücklich ankreuzen.
- **Schulbezeichnung und Notizen** bleiben in der Projektdatei. Das Tool veröffentlicht sie nicht. Wer die Projektdatei weitergibt, gibt sie mit weiter.

Beim Schliessen des Tabs oder beim Laden einer anderen Datei fragt der Browser nach, wenn Sie ungesicherte Änderungen haben.

- **Alles als ZIP-Paket speichern:** eine Datei mit Projekt, Prüfbericht, Codebuch und allen Ausgaben, die für Ihre Auswahl möglich sind, dazu `LIESMICH.txt` mit der Liste dessen, was fehlt, und warum. Das ist der bequemste Weg, wenn Sie alles auf einmal brauchen.
- **Auswahl nach Skala:** Die Übersicht im selben Tab zeigt je Skala, wie viel davon gewählt ist, und die dokumentierte Bearbeitungszeit (nur aus belegten Angaben, nie geschätzt).
- **Drucken:** Drucken Sie die Vorschau mit der Druckfunktion des Browsers. Bedienelemente werden ausgeblendet.
- **Export für LimeSurvey:** Tasten *Export für LimeSurvey* und *Testexport für LimeSurvey* im Bereich «Export für Umfragetools». Der reguläre Export ist nur bei Katalogstatus «released» und bestätigten Rechten aller gewählten Items möglich. Der Testexport gilt auch für Entwürfe, trägt «TEST» im Titel und umgeht kein Rechteverbot. Ist ein Export nicht möglich, steht darunter, warum (zum Beispiel ein Code, den LimeSurvey nicht annimmt, mit dem Hinweis, was der Katalogpfleger ergänzen muss). Die **Zuordnung zum Zielsystem** zeigt, was genau übernommen wird und was Sie nach dem Import von Hand einstellen müssen (zum Beispiel das Einwilligungsfeld). Es wird eine Sprache pro Datei exportiert. Fehlt ein Text in dieser Sprache, gibt es keine Datei.
- **Export für Qualtrics (TXT):** gleiche Tasten und Regeln. Das Format kann **keine Bedingungen und keinen Slider**. Enthält Ihre Auswahl solche Items, ist der Export gesperrt, und die Begründung nennt die betroffenen Items. Pflichtantworten, Zahlen- und Textgrenzen müssen Sie in Qualtrics von Hand setzen, die Zuordnung führt sie auf. Details: [QUALTRICS.md](QUALTRICS.md).
- **REDCap, Google Forms, Unipark, SurveyMonkey und neutrale Tabelle** sind **Prototypen** ohne Test an einem echten System, sichtbar als «Prototyp, ungeprüft». REDCap erzeugt ein Datenwörterbuch (vor dem Hochladen die Kopfzeile mit einem Download aus Ihrem Projekt vergleichen), Google Forms ein Skript für script.google.com, Unipark und SurveyMonkey einen **Bauplan zum Nachbauen** (diese Systeme lesen keine Fragebogendatei), die Tabelle eine Übersicht für Menschen. Details und Grenzen: [PROTOTYPEN.md](PROTOTYPEN.md).

## Was noch nicht geht
- **Kein Export ist an einer echten Instanz getestet** (LimeSurvey, Qualtrics: Adapter; die übrigen: Prototypen). Prüfen Sie importierte Umfragen vor dem Einsatz sorgfältig (Anleitung in [LIMESURVEY.md](LIMESURVEY.md)).
- Es gibt keine Kataloge zum Bearbeiten im Browser und keinen CSV-Import.
- Das Tool berechnet keine Scores, Normen oder Diagnosen. Es prüft nicht, ob ein Instrument fachlich für Ihre Schule geeignet ist, und es ersetzt keine Rechteklärung. Die Rechteangaben sind Erklärungen des Herausgebers.
- Welche Browser tatsächlich getestet sind, steht in [BROWSER.md](BROWSER.md). Alles dort nicht Genannte ist nur ein Ziel, kein Nachweis.

## Aufbau der Oberfläche (vier Schritte)

Nach dem Laden führen vier nummerierte Schritte durch das Tool. Unter den Schritten steht immer Ihre Auswahl (Anzahl Items, Module, Pflichtbestandteile). Unter jeder Ansicht führen «Zurück» und «Weiter» zum nächsten Schritt.

1. **Fragen und Module:** auswählen. Unter jeder Frage sehen Sie die Antwortmöglichkeiten so, wie sie in der Umfrage erscheinen (Skalen, Ja/Nein, Schieberegler, Eingabefelder). Der Schalter «Antwortmöglichkeiten unter den Fragen zeigen» blendet sie aus. Bei Modulen zeigt «So sieht das Modul in der Umfrage aus» alle Fragen des Moduls als Vorschau. Mit «i» öffnen Sie Hintergrund und Quellen.
2. **Texte anpassen:** siehe unten.
3. **Vorschau:** der ganze Fragebogen wie ihn Teilnehmende sehen. Nichts wird gespeichert.
4. **Prüfung und Ausgabe:** Prüfbericht, Projekt speichern, Dateien für Ihr Umfrage-Tool, ZIP-Paket. Wenn ein Export nicht möglich ist, steht dort in einfachen Worten warum (zum Beispiel «Google Forms kennt keinen Schieberegler von 0 bis 100»), welche Fragen betroffen sind und was Sie tun können.

## Darstellung: Hell/Dunkel und Schriftgrösse

Oben rechts, auf jeder Seite: **Dunkel/Hell** wechselt das Farbschema, **A+/A−** wechselt zwischen normaler und grosser Schrift (zwei Stufen). Beides gilt nur für den aktuellen Besuch und wird nicht gespeichert. Zu Beginn folgt das Farbschema Ihrer Systemeinstellung. Die Oberfläche startet immer auf Deutsch (umschaltbar auf English), die Fragensprache auf Deutsch, sobald der Katalog Deutsch enthält.

## Texte anpassen und eigene Textblöcke

Im Schritt «Texte anpassen» ändern Sie Titel, Einleitung, Schlusstext, Datenschutzhinweis, Hilfs- und Beratungsangebote und die Einwilligungstexte. Unter jedem Feld steht der Originaltext des Katalogs, «Auf Original zurücksetzen» macht Ihre Änderung rückgängig. Eine Änderung wird übernommen, sobald Sie das Feld verlassen.

- **Titel und Textblöcke des Katalogs** (Zwischentitel, Übergangstext zwischen zwei Skalen, Abschlussseite mit Dank) stehen unter «Titel und Textblöcke des Katalogs» und lassen sich genauso ändern. Die Beispieltexte sind dafür gedacht, dass Sie sie auf Ihre Schule anpassen.
- **Gesperrte Texte** (Schloss) sind standardisierter Wortlaut, zum Beispiel aus dem Originalinstrument oder eine vorgeschriebene Einwilligung. Sie lassen sich nicht ändern.
- **Fragen und Antwortoptionen** sind nie anpassbar.
- Sie bearbeiten immer die Texte **einer Sprache** (die Sprache der Fragen im Katalogkopf). Fehlt Ihr Text in einer anderen Sprache des Katalogs, steht eine Warnung dort, und der Export in dieser Sprache meldet den fehlenden Text.
- **Eigene Textblöcke:** Art (Titel, Zwischentitel, Text, Hinweis), Abschnitt und Position wählen, Text eingeben, «Block einfügen». Leerzeile = neuer Absatz, Zeilen mit «- » werden zur Liste. Ihre Blöcke erscheinen in Vorschau und Export und lassen sich in der Fragenliste an- und abwählen.

Ihre Anpassungen stehen in der **Projektdatei** (nicht im Katalog). Wer das Projekt wieder lädt, bekommt sie zurück. Die Projektdatei enthält keinen Katalogwortlaut, nur Ihre eigenen Texte.

