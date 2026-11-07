# Recherche: Import-Möglichkeiten der Zielsysteme

Stand 7. November 2026. Grundlage sind drei Web-Recherchen (Quellen siehe unten). **[V]** = auf einer Herstellerseite gelesen, **[S]** = nur Sekundärquelle, **[?]** = nicht verifiziert. Alles mit [S] oder [?] muss vor der Adapterentwicklung an einer echten Instanz getestet werden.

## 1. Zentrale Erkenntnis

Kein Zielsystem nimmt ein vollständiges Fragebogenformat mit allen Einstellungen aus einer Datei entgegen, die ein Offline-HTML-Tool erzeugen kann.

| Ziel | Realistischer Weg aus einem Offline-HTML | Stand |
|---|---|---|
| LimeSurvey | Tab-separierte Strukturdatei (`.txt`, UTF-8) oder `.lss` (XML), Upload im UI | TSV [V] (14 Spalten und Klassen am 7. November 2026 gelesen, Details und Lücken in [LIMESURVEY.md](LIMESURVEY.md)), `.lss`-Schema [?] |
| REDCap | Data-Dictionary-CSV (18 Spalten), Upload im Projekt | nur [S], offizielle Doku ohne Login nicht lesbar |
| Qualtrics | TXT im Advanced Format (`[[AdvancedFormat]]`), Upload im UI | [V] (am 7. November 2026 gelesen, Einzelheiten und Lücken in [QUALTRICS.md](QUALTRICS.md)); `.qsf` nicht empfohlen |
| SurveyMonkey | kein Datei-Import; Text zum Einfügen (nur Multiple Choice und Textbox) oder API v3 mit OAuth | [V] |
| Google Forms | kein Datei-Import; Apps-Script-Text zum Einfügen oder Forms API mit OAuth | [V]; Apps-Script-Weg [?] |
| Unipark/EFS | kein öffentlich dokumentierter Fragebogen-Import; nur «Paste from Word» und Projekt-Export in unbekanntem Format | wichtigste offene Frage an Tivian |

Folgerung: Ein Adapter erzeugt entweder eine importierbare Datei (LimeSurvey, REDCap, Qualtrics) oder einen «Bauplan» (Text/Skript/Excel plus Checkliste der manuell zu setzenden Einstellungen). Der Mappingbericht muss pro Feature `exact | transformed | manual | unsupported` ausweisen.

## 2. Was jedes System kann (Auszug, relevant fürs Katalogformat)

| Feature | LimeSurvey | REDCap | Qualtrics (TXT) | SurveyMonkey | Google Forms | Unipark |
|---|---|---|---|---|---|---|
| Antwortcodes | ja, max. 5 Zeichen [S] | ja (`code, Label \| …`), Zeichenregeln [?] | ja (`[[AdvancedChoices]]`) [V] | [?] | nein | [?] |
| Variablennamen | Fragecode alphanumerisch, ≤ 20 [S], beginnt mit Buchstabe | `[a-z0-9_]`, ≤ 26 empfohlen [S]; Gross-/Sonderzeichen werden still verändert | `[[ID:…]]` [V] | nein [?] | nein [?] | automatisch `v_n`, externe Namen [?] |
| Pflichtfeld | `mandatory` [V] | `Required Field?` = `y` [S] | per Import nicht dokumentiert | API ja [V] | API ja [V] | [?] |
| Zahlen-/Textvalidierung | `validation`, `min/max_num_value_n` [V] | Validierungs-Kurzcodes, Min/Max [S] | per Import nicht möglich [?] | `validation` (integer, decimal, Datum, Länge) [V] | nur Apps Script [V] | [?] |
| Bedingungen | Expression Manager (`relevance`) [V] | Branching Logic auf Zielfeld [S] | nicht importierbar [V] | UI; API [?] | nur Sprung bei Einfachauswahl [V] | Filter/LUA, Syntax [?] |
| Matrix | Typ `F` u. a. [V] | `matrix_group_name` [S] | `[[Question:Matrix]]` [V] | `matrix` [V] | Grid [V] | [T] |
| Slider | Typ `K` mit Slider-Attributen [V] | `slider` [S] | nur Umstellung im Editor [S] | `open_ended` mit `display_type: slider` [V] | nur diskrete Skala | [?] |
| Ranking | Typ `R` [V] | nicht gefunden | `RankOrder` [V] | `matrix`/`ranking` [V] | nicht gefunden | [?] |
| Missing-Codes | nur normale Option | projektweit, **nicht** im Data Dictionary [S] | nur normale Option | nur normale Option | nur normale Option | `-77`, `-66`, `-99` [T] |
| Randomisierung | ja | `@RANDOMORDER` [S] | nur Simple Format [V] | ja [V] | ja [V] | ja [T] |
| Scoring | Assessments [V] | `calc`-Felder [S] | nein | nur Quiz | nur Quiz | nein |
| Mehrsprachigkeit | pro Sprache ein Zeilenblock [V] | [?] | nein | Übersetzungs-API [V] | nein | im Projekt-Export [V] |

## 3. Konsequenzen für das JSON-Format (Version 0.4.0)

| Erkenntnis | Umsetzung im Schema |
|---|---|
| Variablenregeln unterscheiden sich je Tool | `Item.exportHints.<plattform>.variableName`, damit der Exporter nicht kürzt oder rät |
| Anzeigetext ≠ Variablenlabel | `Item.exportLabel` |
| Slider und Ranking fehlen im Kern | Response-Typen `slider`, `ranking` (Features `sliderResponse`, `rankingResponse`) |
| Reine Texte zwischen Fragen (`descriptive`, `note`) | Response-Typ `note`, nie antwortpflichtig |
| Validierung per Format | `shortText.format` (`email`, `url`, `phone`) |
| Bedingungen über mehrere Fragen und Zahlen | `visibleWhen` als Einzelbedingung oder `all`/`any`; Operatoren `notContains`, `greaterThan`, … (Feature `compoundVisibility`) |
| Matrix-Batterien, Seiten | `Section.layout` (`list`/`matrix`/`table`), `Section.pageBreakBefore` |
| Randomisierung | `Item.presentation.optionOrder` (Feature `randomization`) |
| Pflichtfeld-Hinweistext | `Item.requiredMessage` |
| Scoring-Richtung | `Item.keyDirection` (vorher nur in Extensions der Testdateien) |
| Eigene Fragen nicht als validiert ausgeben | `Item.origin` (`original`/`adapted`/`own`) |
| Sensible Items (z. B. Einsamkeit, Suizidalität) | `Item.sensitivity` mit Warn- und Hilfetext |
| Einwilligung, Datenschutz, Hilfsangebote, Fortschrittsbalken, Anonymität | `Questionnaire.consent`, `privacyNotice`, `helpResources`, `delivery` |
| Schul-/Klassen-/Wellencode | `Questionnaire.hiddenFields` |
| Altersbereich, Bearbeitungszeit (nur mit Quelle) | `InstrumentForm.ageRange`, `administrationTime` |

Info-/Hilfebutton im HTML: speist sich aus vorhandenen Feldern (`Item.documentation`, `organizerHelp`, `Scale`, `Construct`, `InstrumentForm`, `sourceLinks`, `Evidence`). Dafür war keine Schemaänderung nötig.

Bewusst **nicht** aufgenommen:
- freie Regex (Spec B12: nicht im Kern; kein Zielsystem importiert sie überall),
- «Sonstiges» als eigener Flag (Spec: Kategorie plus bedingte Textfrage, das funktioniert in jedem Zielsystem),
- Tool-Syntax für Bedingungen (immer neutrale Struktur, der Adapter übersetzt),
- Quoten, Kalkulationsfelder ausserhalb von `scoringDefinitions`.

## 4. Offene Punkte

1. Unipark: Importformat bei Tivian oder Hochschul-Support erfragen.
2. LimeSurvey: Die TSV-Seite nennt keine Escape-Regeln, Typbuchstaben, Attributnamen, Längenlimits und keine BOM-Pflicht; der Adapter geht von Annahmen aus, die ein Importtest bestätigen muss ([LIMESURVEY.md](LIMESURVEY.md)). `.lss`-Schema bleibt ungeprüft.
3. REDCap: alle Angaben an einer Testinstanz prüfen (Header-Strings, Validierungscodes, Quoting in Branching Logic, Choice-Code-Regeln).
4. Qualtrics: Pflichtfeld, Validierung, Datum per TXT; UTF-8 mit/ohne BOM.
5. SurveyMonkey: Logik und Recode-Werte per API.
6. Standards: DDI-, CDISC-, PROMIS-, COSMIN-Angaben stammen nur aus dem Gedächtnis des Recherche-Agenten.

## 5. Quellen

LimeSurvey: help.limesurvey.org/portal/en/kb/articles/import-a-survey · limesurvey.org/manual/Tab_Separated_Value_survey_structure · …/Question_object_types · …/Expression_Manager · …/Assessments · …/Question_type_-_Multiple_numerical_input · bugs.limesurvey.org/view.php?id=7593
REDCap (sekundär): atlas.utdallas.edu/TDClient/30/Portal/KB/PrintArticle?ID=1142 · linkml.io/linkml-redcap/reference/data_dictionary/ · health.uconn.edu (REDCap-Logic-Guide) · casrai.org/guides/missing-data-codes-in-redcap-and-how-they-export · help.redcap.ualberta.ca/help-and-faq/action-tags
Qualtrics: qualtrics.com/support/survey-platform/survey-module/survey-tools/import-and-export-surveys/
SurveyMonkey: help.surveymonkey.com/en/surveymonkey/create/importing-surveys/ · api.surveymonkey.com/v3/docs
Google: developers.google.com/forms/api/reference/rest/v1/forms · …/forms/limits · developers.google.com/apps-script/reference/forms/text-validation-builder
Unipark/EFS: discoverxi-supportdesk.kayako.com (Artikel 49122, 48748, 49018, 48681) · qbdocs.atlassian.net/wiki/spaces/DOC (Survey Variables, Codebook)
Standards: hl7.org/fhir/R5/questionnaire.html · xlsform.org/en/ · docs.ddialliance.org
