# Ideen und Verbesserungsvorschläge

Stand 8. November 2026. Diese Liste sammelt alles, was das Projekt weiterbringen kann, mit Stand je Punkt. **Umgesetzt** heisst: im Repo, getestet, dokumentiert. **Offen** nennt, was fehlt und was es braucht.

Aufwand: S = Stunden, M = ein bis zwei Tage, L = mehrere Tage. Nutzen: ★ gering, ★★ mittel, ★★★ hoch.

## A. Ausgaben und Zielsysteme

| # | Idee | Nutzen | Aufwand | Stand |
|---|---|---|---|---|
| A1 | Alle sieben Ausgaben (LimeSurvey, Qualtrics, REDCap, Google Forms, Unipark, SurveyMonkey, neutrale Tabelle) | ★★★ | L | **umgesetzt** (Stufen Adapter, Prototyp, Tabelle; ADR-008) |
| A2 | Alles als ZIP-Paket: Projekt, Prüfbericht, Codebuch, alle möglichen Ausgaben, README mit Gründen für Fehlendes | ★★★ | M | **umgesetzt** |
| A3 | Importtests an echten Instanzen, danach Stufe anheben | ★★★ | M je Ziel | offen. Braucht Testzugänge. Ablauf in [LIMESURVEY.md](LIMESURVEY.md), [QUALTRICS.md](QUALTRICS.md), [PROTOTYPEN.md](PROTOTYPEN.md) |
| A4 | LimeSurvey: Matrix als Typ `F`, Mehrsprachigkeit (ein Zeilenblock je Sprache), Assessments aus `scoringDefinitions` | ★★ | M | offen. Erst nach A3, sonst baut man auf unbelegten Annahmen auf |
| A5 | Qualtrics QSF (JSON) statt TXT: kann Bedingungen, Pflicht und Validierung | ★★★ | L | offen. QSF ist nicht offiziell dokumentiert, ein Importtest ist Voraussetzung |
| A6 | REDCap: Kopfzeile mit Download aus einem Testprojekt abgleichen, Action Tags (`@HIDDEN`, `@RANDORDER`) für Hidden Fields und Zufallsreihenfolge | ★★ | S | offen, wartet auf A3 |
| A7 | SurveyMonkey über die API (OAuth) erzeugen | ★★ | L | offen. Würde Netzwerk brauchen und widerspricht dem Offline-Grundsatz, deshalb nur als getrenntes Skript denkbar |
| A8 | Unipark: Importformat bei Tivian oder der Hochschule erfragen, dann echte Datei statt Bauplan | ★★★ | S Anfrage, M Umsetzung | offen. Anfrage ist eine Entscheidung der Projektleitung |
| A9 | Schule bestätigt ausdrücklich, dass sie Bedingungen im Zielsystem von Hand nachbaut (heute sperrt Qualtrics TXT) | ★★ | S | offen, braucht eine Entscheidung (ADR-007, Folgen) |
| A10 | Adapter LimeSurvey und Qualtrics auf `adapterBase.ts` umstellen (gemeinsame Rechte-, Sprach- und Fehlerlogik) | ★ | S | offen, reine Aufräumarbeit, Tests schützen davor |
| A11 | Testantwortdaten erzeugen (T34): Beispielantworten passend zum Fragebogen für Importtests der Auswertung | ★★ | M | offen |

## B. Bedienung und Darstellung

| # | Idee | Nutzen | Aufwand | Stand |
|---|---|---|---|---|
| B1 | Auswahl nach Skala: wie viel jeder Skala in der Auswahl steckt, mit Auswahlregel und Hinweis auf Teilskalen | ★★ | S | **umgesetzt** (Tab «Prüfung und Ausgabe») |
| B2 | Druckansicht: Vorschau auf Papier ohne Bedienelemente, Links mit Adresse | ★★ | S | **umgesetzt** (Druck-Stylesheet, im Browser getestet) |
| B3 | Erklärung der Stufen («Adapter», «Prototyp», «Tabelle») und was die Schule vor dem Einsatz prüfen muss, direkt im Export-Bereich | ★★ | S | **umgesetzt** (Zeile je Ziel, Zuordnung mit Annahmen) |
| B4 | Geführter Ablauf («Schritt 1 von 4») statt Tabs, mit Hinweis, was als Nächstes fehlt | ★★ | M | offen |
| B5 | Auswahlvergleich: zwei Projektdateien nebeneinander (was hat Schule A, was Schule B) | ★★ | M | offen |
| B6 | Bearbeitungsdauer nur aus dokumentierten Werten (`administrationTime` mit Quelle, Instrument vollständig gewählt), «nicht dokumentiert» wo nichts belegt ist | ★★ | S | **umgesetzt** (nie geschätzt) |
| B7 | Vorschau mit echten Eingaben zum Ausprobieren (Bedingungen durchspielen), ohne Antworten zu speichern | ★★ | M | offen |
| B8 | Mehrsprachige Vorschau nebeneinander (zwei Sprachen) zur Übersetzungsprüfung | ★ | S | offen |
| B9 | Tastenkürzel und «Alle optionalen Items einer Dimension» | ★ | S | offen |
| B10 | Hilfeseite in der App (Kurzanleitung aus dem Benutzerhandbuch) | ★★ | S | offen |

## C. Daten und Anpassung

| # | Idee | Nutzen | Aufwand | Stand |
|---|---|---|---|---|
| C1 | Profil-JSON (`appProfile`): Schulname, Farben, Texte, erlaubte Ziele und Sprachen, ohne Code-Varianten | ★★★ | M | offen. Braucht eine Entscheidung, was alles anpassbar sein darf |
| C2 | CSV-Import und Autorenmodus: eigene Fragen anlegen, Katalog im Browser pflegen | ★★★ | L | offen (M8) |
| C3 | Katalog-Prüfung als eigene Funktion («Katalog validieren») mit Befundbericht für Katalogpfleger | ★★ | S | offen. Die Pipeline existiert, es fehlt nur die eigene Ansicht |
| C4 | Normierte Quellenangaben (APA) im Codebuch aus `sources` erzeugen | ★ | S | offen |
| C5 | Mehr Beispielkataloge (englisch, französisch, mehrsprachig) und echte Skalen mit geklärten Rechten | ★★★ | M | offen. Rechteklärung ist Sache des Herausgebers |

## D. Qualität, Sicherheit und Betrieb

| # | Idee | Nutzen | Aufwand | Stand |
|---|---|---|---|---|
| D1 | Kein `unsafe-eval` mehr: Schema-Prüfer werden beim Build erzeugt, die Content-Security-Policy erlaubt keinen Code aus Zeichenketten | ★★★ | M | **umgesetzt**, durch Paritätstest gegen die Laufzeit-Prüfer abgesichert |
| D2 | Browsernachweis über Edge hinaus (Firefox, Chrome, Safari, iOS, Android) | ★★★ | M | offen. Braucht Playwright mit heruntergeladenen Browsern oder echte Geräte; [BROWSER.md](BROWSER.md) |
| D3 | Screenreader-Prüfung (NVDA, VoiceOver) | ★★★ | M | offen, braucht Menschen mit den Geräten |
| D4 | Dateigrösse senken (heute rund 525 KiB, davon ein grosser Teil erzeugte Prüffunktionen) | ★ | M | offen. Weniger Duplikate in den Definitionen, Schema ohne `verbose` |
| D5 | Referenzgerät und Ressourcenlimits festlegen (Dateigrösse, Itemzahl) | ★★ | S | offen, Entscheidung der Projektleitung |
| D6 | Reproduzierbarer Build (zweimal bauen, gleiche Prüfsumme) | ★★ | S | **umgesetzt** (`build.test.ts`, Prüfsumme neben der Datei). Veröffentlichung der Prüfsumme offen |
| D7 | Fortlaufende Prüfung (Tests bei jedem Push) | ★★★ | S | offen. Braucht eine Entscheidung zum Hosting |
| D8 | Lizenz des Repositories | ★★★ | S | offen, Entscheidung der Projektleitung |

## E. Rückmeldungen nach dem ersten Ausprobieren (8. November 2026)

| # | Idee | Stand |
|---|---|---|
| E1 | Startbildschirm mit Ziel, Ablauf, «Das können Sie tun / Das tut das Tool nicht», Zielsystemen und Ablageplatz für die Datei; Beispielkatalog mit einem Klick | **umgesetzt** |
| E2 | Hell/Dunkel und zwei Schriftgrössen über die ganze Seite | **umgesetzt** (bewusst nicht gespeichert, ADR-009) |
| E3 | Deutsch als Standard (Oberfläche und Fragensprache, wenn der Katalog Deutsch führt) | **umgesetzt** |
| E4 | Übersichtlichere Oberfläche: vier nummerierte Schritte, Hinweis je Ansicht, Weiter/Zurück, mitlaufende Auswahlzeile | **umgesetzt** |
| E5 | Antwortmöglichkeiten unter jeder Frage und Modulvorschau in der Liste | **umgesetzt** |
| E6 | Texte anpassen und eigene Textblöcke, gesperrte Standardtexte | **umgesetzt** (ADR-009) |
| E7 | Google Forms: Gründe in einfachen Worten, was der Katalog verlangt und das Ziel nicht kann | **umgesetzt** |
| E8 | Anpassbare Texte auch für `note`-Items des Katalogs | **umgesetzt** (ADR-009, Punkt 7) |
| E8b | Reihenfolge von Blöcken und Fragen, wo der Katalog es erlaubt (`section.reorder`, Schritt «Reihenfolge») | **umgesetzt** (ADR-009, Punkt 9) |
| E11 | Beispielkatalog mit Titel, Untertitel, Einleitung, Übergangstexten und Abschlussseite als Beispieltexte | **umgesetzt** (`examples/catalog_rich_0_4_0.json`) |
| E12 | Prüfregel für Herausgeber: Warnung, wenn ein Katalog keine Einleitung, keinen Übergang zwischen Batterien oder keine Abschlussseite mitbringt | offen |
| E9 | Sprachen der eigenen Texte nebeneinander bearbeiten | offen |
| E10 | Speichern der Darstellung (Thema, Schrift) nur, wenn die Projektleitung die Aussage «nichts wird gespeichert» ändert | offen, Entscheidung |

## Reihenfolge, die ich vorschlage

1. **D8** (Lizenz) und **A8** (Anfrage bei Tivian) sind Entscheidungen, keine Arbeit. Beides blockiert später.
2. **A3** mit Testzugängen zu LimeSurvey und Qualtrics. Das ist der grösste Hebel auf Vertrauen.
3. **C1** Profil-JSON, sobald klar ist, was Schulen anpassen dürfen.
4. **D2/D3** parallel, weil sie nur Zeit an Geräten brauchen.
5. **C2** Autorenmodus, wenn die Kataloge wachsen sollen.
