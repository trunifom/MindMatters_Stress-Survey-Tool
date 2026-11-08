# src/output: Ausgaben und Exporte

Alles, was das Tool als Datei schreibt: die Exporte für Zielsysteme («Adapter» im weiten Sinn), Dokumente und Skripte, dazu Projektbegleiter wie Codebuch, Prüfbericht und das ZIP-Paket. Der Ordner heisst `output`, nicht `adapters` (siehe [../adapters/README.md](../adapters/README.md)). Abhängigkeiten: `src/core` und `src/model`, nie `src/ui`; die Oberfläche ruft diesen Ordner auf. Wie die Ausgaben aussehen: [../../docs/AUSGABEN.md](../../docs/AUSGABEN.md), [../../docs/PROTOTYPEN.md](../../docs/PROTOTYPEN.md), [../../docs/LIMESURVEY.md](../../docs/LIMESURVEY.md), [../../docs/QUALTRICS.md](../../docs/QUALTRICS.md). Entscheidungen: ADR-007 und ADR-008 in [../../docs/ENTSCHEIDUNGEN.md](../../docs/ENTSCHEIDUNGEN.md).

## Der Adapter-Vertrag

Ein Export ist eine Funktion `Build = (catalog, selection, { language, mode }) => AdapterResult` (`registry.ts`). `mode` ist `"native"` (regulärer Export) oder `"test"` (Entwicklungs-Testexport, in der Datei und im Dateinamen `_TEST` gekennzeichnet). Das Ergebnis (`mapping.ts`) enthält Datei (`content`, `fileName`, `mimeType`), Befunde, Zuordnungsbericht, Annahmen und die Rechteentscheidung. `ok` ist nur wahr, wenn eine Datei entstand. Ein Export hat immer eine Sprache; es gibt keine zweisprachigen Dateien (`languages: unsupported`).

## Dateien

| Datei | Aufgabe |
|---|---|
| `registry.ts` | `ADAPTERS`: alle Ausgaben in Anzeigereihenfolge mit Funktion, Stufe (`tier`) und Name. **`guardBuild`** umschliesst jeden Adapter: eine unerwartete Ausnahme wird zum Ergebnis `ok: false` mit Befund `EXPORT_INTERNAL_ERROR`, nie zum Absturz der Seite; alle anderen Exporte laufen weiter. |
| `adapterBase.ts` | Gemeinsamer Start `openAdapter(...)` mit den Toren (siehe unten), Textzugriff `ctx.need` (nur die gewählte Sprache) und Hilfen `ctx.err`, `ctx.mapping`, `ctx.result`, `ctx.titleLabel`. Von allen Ausgaben ausser LimeSurvey und Qualtrics benutzt. |
| `mapping.ts` | Typen `AdapterResult`, `MappingEntry`, `MappingLevel`, dazu `MappingCollector` (fasst gleiche Einträge zusammen). |
| `limesurvey.ts`, `qualtrics.ts` | Stufe «Adapter». Älter als `adapterBase`, tragen ihre eigene Kopie der Tore (Eintrag in `docs/IDEEN.md`). |
| `redcap.ts`, `googleforms.ts` | Stufe «Prototyp»: REDCap-Datenwörterbuch (CSV) und Google-Apps-Script. Nie gegen das echte System gelaufen. |
| `bauplan.ts` | Stufe «Prototyp», Bauplan als Markdown für Unipark und SurveyMonkey (diese Systeme lesen keine Fragebogendatei). |
| `csvtable.ts` | Neutrale Tabelle (CSV, UTF-8 mit BOM, Schutz gegen Formelinjektion). Für Menschen, kein Import. |
| `document.ts` | Dokumentausgaben **HTML** (Druckansicht, als PDF speicherbar), **Markdown** und **neutrales JSON**. Alle drei entstehen aus einem aufgelösten Modell (`buildDocModel`), können also bei Wortlaut, Reihenfolge und Antworten nicht auseinanderlaufen. HTML enthält kein Skript, keine externe Ressource, keinen Ereignishandler. Dazu `escapeHtml`, `escapeMd`, `textBlocks`. |
| `analysis.ts` | **SPSS-Syntax** (`.sps`) und **R-Skript** für Variablen- und Wertelabels der Daten der fertigen Umfrage. Baut auf `buildDocModel`. Variablennamen werden geprüft, nie geändert (`EXPORT_VARIABLE_NAME_INVALID`). |
| `plain.ts` | Hilfen für Ausgaben, die Menschen lesen: Antwortpaare, Bedingung als Satz, Grenzen als Text. |
| `codebook.ts` | Codebuch (Markdown). Wortlaut nur für Items, deren Rechte `codebookWithTexts` erlauben, sonst nur die ID. |
| `report.ts` | Technischer Prüfbericht (nur IDs, Pfade, Codes, nie Wortlaut) mit Zustandsfingerabdruck: nach jeder Änderung gilt er als veraltet. |
| `package.ts`, `zip.ts` | ZIP-Paket (Projektdatei, Prüfbericht, Codebuch, alle möglichen Exporte, README mit Gründen für fehlende). Der ZIP-Schreiber braucht keine Bibliothek. |

## Die Tore von `openAdapter`

Bevor ein Adapter etwas schreibt, prüft `openAdapter` in dieser Reihenfolge und liefert bei einem Misserfolg sofort `ctx.early` (ein Ergebnis mit `ok: false`):

1. **Rechte und Katalogstatus:** `evaluateAction` (`nativeExport` bzw. `devTestExport`, aus `src/model/rights.ts`). Ein einziges gesperrtes Item sperrt den ganzen Export. Regulärer Export nur bei `released`; Testexport umgeht nie ein Verbot.
2. **Auswahl:** Fehler aus `checkSelection` sperren (`EXPORT_SELECTION_INVALID`). Es wird nichts repariert.
3. **Sprache:** muss eine Katalogsprache sein (`EXPORT_LANGUAGE_UNKNOWN`).
4. Sensible Items, die ausdrücklich gewählt wurden, werden als Info vermerkt (`EXPORT_SENSITIVE_INCLUDED`).

Danach liest der Adapter alle Texte über `ctx.need(...)`: genau die gewählte Sprache, sonst `EXPORT_TEXT_MISSING`, nie ein Ersatztext aus einer anderen Sprache; Steuerzeichen und einzelne Surrogate werden abgelehnt (`EXPORT_TEXT_CHARACTER_INVALID`). Der Adapter prüft am Ende `hasErrors(ctx.diagnostics)` und gibt dann `ctx.result(false)` oder `ctx.result(true, inhalt)` zurück.

## Stufen (ADR-008)

Die Stufe steht im Konfigurator neben dem Namen und im README des ZIP-Pakets. Sie wird **nur nach einem protokollierten Test** angehoben (Weg: [../../docs/PROTOTYPEN.md](../../docs/PROTOTYPEN.md)).

| Stufe (`tier`) | Bedeutung | Beispiele |
|---|---|---|
| `adapter` | Schreibt eine Datei, die das System importiert, nach den Angaben des Herstellers, an keiner echten Instanz getestet. | LimeSurvey, Qualtrics |
| `prototype` | Aus Dokumentation oder allgemeinem Wissen geschrieben und nie gegen das System gelaufen, oder ein Bauplan für Systeme ohne Import. | REDCap, Google Forms, Unipark und SurveyMonkey (Bauplan), SPSS, R |
| `table` | Datei zum Lesen oder Weiterverarbeiten, für Menschen, kein Import in ein Umfragetool. | CSV, HTML, Markdown, JSON |

## Abbildungsstufen im Zuordnungsbericht (`MappingLevel`)

Jedes Katalogmerkmal, das ein Adapter berührt, wird mit `ctx.mapping.add(feature, level, message, itemRef?)` gemeldet. Die Schule sieht den Bericht im Tab «Prüfung und Ausgabe».

| Stufe | Bedeutung |
|---|---|
| `exact` | Das Zielsystem drückt es genau so aus. |
| `transformed` | Ausgedrückt, aber nicht identisch (die Meldung erklärt wie). |
| `manual` | Die Datei kann es nicht tragen, die Organisatorin stellt es im Zielsystem von Hand ein. |
| `unsupported` | Das Zielsystem kann es gar nicht. Ist es für die Auswahl nötig (zum Beispiel eine Bedingung in Qualtrics-TXT), ist das ein Fehler, nie ein stilles Weglassen. |

## Regeln und Invarianten (ADR-007)

- **Nichts still ändern, nichts weglassen.** Codes und Namen werden nie abgeleitet oder gekürzt; ein unzulässiger Code ist ein Fehler mit Hinweis (Abhilfe: `exportHints` im Katalog). Eine Bedingung, die das Ziel nicht ausdrücken kann, ist ein Fehler. Pflichtitems werden nie wegen einer Adaptergrenze weggelassen.
- **Genau eine Sprache, kein Ersatztext.** Siehe `ctx.need`.
- **Annahmen offen führen.** Jeder Adapter nennt in `assumptions` alles, was gegen eine echte Instanz nicht geprüft ist. Sie erscheinen im Konfigurator und im Paket.
- **Text maskieren.** Alles, was aus dem Katalog in eine Datei geht, wird für das Zielformat maskiert (HTML-Escape, Markdown-Escape, CSV-Anführungszeichen, Formelschutz). Eine Ausgabe enthält nie ausführbaren Inhalt aus Katalogtext.
- **Entwurf und Test sichtbar.** `ctx.titleLabel()` liefert «[ENTWURF]» bzw. «[TEST – nicht für die Durchführung]» für Titel; Testexporte tragen `_TEST` im Dateinamen und `testArtifact: true`.
- **Dateinamen** nur aus Katalog-ID, Version und Zielsystem, nie aus Schulbezeichnung oder Notizen.
- **Kein Adapter darf die Seite abstürzen lassen.** Dafür sorgt `guardBuild`, nicht der einzelne Adapter. Die Oberfläche und das Paket rufen nur `ADAPTERS` auf, nie die Rohfunktionen.
- **Deterministisch.** Dieselbe Eingabe ergibt dieselbe Datei (geprüft in `exportInvariants.test.ts`).

## Neuen Export ergänzen

1. Datei `src/output/<name>.ts` mit `export function buildX(c, selection, options: AdapterOptions): AdapterResult`.
2. Mit `const ctx = openAdapter(c, selection, options, { platform, ext, mime, assumptions, suffix? }); if (ctx.early) return ctx.early;` beginnen. Texte nur über `ctx.need`, Fehler über `ctx.err(code, message, { itemRef? })`, Zuordnung über `ctx.mapping.add(...)`.
3. Merkmale, die das Ziel nicht kann, als `manual` oder `unsupported` melden (nötige als Fehler), nie weglassen. Annahmen ehrlich auflisten.
4. Am Ende `if (hasErrors(ctx.diagnostics)) return ctx.result(false); return ctx.result(true, inhalt);`
5. In `registry.ts` bei `RAW_ADAPTERS` eintragen: Funktion, `tier` (neue Adapter beginnen als `prototype`, solange kein Importtest protokolliert ist), Name. `guardBuild`, Oberfläche, Paket-README und Zuordnungsbericht übernehmen den Eintrag von selbst; für die Oberfläche braucht es keinen weiteren Code.
6. Nutzt der Export Dokument- oder Skriptinhalte, `buildDocModel` aus `document.ts` wiederverwenden statt den Fragebogen ein weiteres Mal aufzulösen.
7. Tests ergänzen (siehe unten) und die Beschreibung in `docs/AUSGABEN.md` bzw. `docs/PROTOTYPEN.md` nachtragen.

## Tests

`tests/unit/`: `exportInvariants.test.ts` (Invarianten aller Ausgaben auf allen Katalogen, Sprachen und Modi), `adapterAudit.test.ts` (Prüfungen an Qualtrics, LimeSurvey, REDCap, Google Forms, Baupläne, CSV), `adapters.test.ts` (REDCap, Google Forms, Baupläne, CSV), `limesurvey.test.ts`, `qualtrics.test.ts`, `documents.test.ts` (Registry, HTML, Markdown, JSON, SPSS, R), `output.test.ts` (Codebuch, Prüfbericht, Sprache), `package.test.ts` (ZIP-Paket). Fehlerverhalten bei einer werfenden Ausgabe: `tests/unit/ui/errors.test.ts`. Hilfen: `tests/unit/helpers.ts`.
