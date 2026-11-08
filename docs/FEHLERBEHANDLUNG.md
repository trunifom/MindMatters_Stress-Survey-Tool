# Fehlerbehandlung

Grundsatz: **Wenn etwas nicht klappt, sieht man es, und man sieht, wo der Fehler liegt.** Nichts wird still weggelassen, nichts bricht die Seite ab, und der Arbeitsstand (Auswahl, Texte, Reihenfolge) bleibt bei jedem Fehler erhalten.

## Drei Arten von Problemen

| Art | Beispiel | Wer ist schuld | Wie wird es gezeigt |
|---|---|---|---|
| Problem in der **Datei oder Auswahl** | Katalog mit falschem Typ, Frage ohne Übersetzung, Bedingung vor ihrem Auslöser | Datei oder Auswahl | **Diagnose** mit Code, Schweregrad, Stelle (`jsonPath`), Frage, Ziel und «Was tun» |
| Problem **bei einer Handlung** | Datei zu gross oder leer, Download scheitert, ein Export bricht ab | Datei, Browser oder Werkzeug | **Fehlermeldung** oben auf der Seite, die Handlung und Ursache nennt |
| **Unerwarteter** Fehler im Werkzeug | Programmfehler | Werkzeug | Meldung mit technischer Ursache, ein Hinweis zum Sichern, Eintrag in der Browserkonsole |

## Schicht 1: Diagnosen (Datei und Auswahl)

Jede Prüfstufe liefert Diagnosen: stabiler `code`, `severity` (`error`, `warning`, `info`), `stage`, englische `message`, wo sinnvoll `jsonPath` (RFC 6901), `itemRef`, `targetPlatform` und `remediation`. Die Oberfläche zeigt sie mit Schweregrad, Code, Text, Stelle, betroffener Frage, Ziel und einem «Was tun». Ein JSON-Syntaxfehler nennt Zeile und Spalte. Das Register aller Codes: [DIAGNOSECODES.md](DIAGNOSECODES.md).

Regeln:
- Ein Fehler stoppt die jeweilige Handlung, nicht das Werkzeug. Beim Laden bleibt der bisherige gültige Zustand dasselbe Objekt (`PREVIOUS_STATE_KEPT`).
- Etwas, das ein Zielsystem nicht kann, wird **nie still weggelassen**, sondern als Fehler gemeldet (ADR-007).
- Ein Text, der in der gewählten Sprache fehlt, wird **nie durch eine andere Sprache ersetzt**, sondern als `EXPORT_TEXT_MISSING` gemeldet.
- Angepasste Texte, Blöcke und Reihenfolgen, die der Katalog nicht erlaubt oder die eine Bedingung verletzen würden, werden **nicht angewendet** und mit `CUSTOM_*`-Codes gemeldet.

## Schicht 2: Handlungen

Jede Handlung, die etwas schreibt oder liest, läuft durch `guarded` (`src/ui/errors.ts`). Schlägt sie fehl, erscheint eine Fehlermeldung wie

> «ZIP-Paket speichern» ist fehlgeschlagen: TypeError: … Ihre Auswahl und Ihre Texte sind unverändert. Versuchen Sie es erneut oder speichern Sie zuerst das Projekt.

**Dateien lesen** (`readFileText`, `FileProblem`): Die Meldung nennt die Datei und den Grund.

| Grund | Meldung (Kern) | Was tun |
|---|---|---|
| leer | «Die Datei … ist leer.» | richtige Datei wählen |
| zu gross (über 10 MB) | «… ist zu gross (12.3 MB, max 10.0 MB).» | Katalog verkleinern oder aufteilen |
| keine Textdatei (ZIP, Excel, Word, Bild) | «… ist keine JSON-Textdatei …» | die Katalog- oder Projektdatei im Format JSON wählen |
| nicht UTF-8 | «… enthält Zeichen, die nicht als UTF-8 gelesen werden können.» | Datei als UTF-8 speichern |
| nicht lesbar | «… konnte nicht gelesen werden.» + Browsermeldung | Datei prüfen, erneut wählen |

**Exporte:** Jeder Export läuft durch `guardBuild` (`src/output/registry.ts`). Wirft ein Adapter eine unerwartete Ausnahme, entsteht ein fehlgeschlagenes Ergebnis mit dem Code `EXPORT_INTERNAL_ERROR`, das Ziel und Ursache nennt. Alle anderen Exporte funktionieren weiter. Im **ZIP-Paket** wird jeder Teil einzeln abgesichert: Ein Teil, der scheitert, erscheint in `LIESMICH.txt` unter «Nicht enthalten» mit `INTERNAL_ERROR: <Ursache>`, die übrigen Dateien sind trotzdem im Paket.

## Schicht 3: Unerwartetes

- **Globale Handler** (`installGlobalHandlers`): Skriptfehler (`error`) und nicht behandelte Promise-Fehler (`unhandledrejection`) erscheinen in der Meldungszeile («Unerwarteter Fehler: …»), mit dem Hinweis, das Projekt zu sichern. Meldungslose Ladefehler von Ressourcen werden ignoriert.
- **Ansicht, die nicht gezeichnet werden kann:** `renderCrashPanel` ersetzt eine Ansicht, die beim Zeichnen eine Ausnahme wirft, durch eine Fehlerkarte mit technischer Ursache und dem Knopf «Zur Fragenliste». Kein weisses Fenster.
- Alle Fehler gehen zusätzlich mit Stack in die **Browserkonsole** (Entwicklerwerkzeuge, F12). Dort sucht ein Entwickler.

## Wo suchen, wenn etwas nicht klappt

1. **Meldungszeile oben:** sagt, welche Handlung scheiterte und warum.
2. **Tab «Prüfung und Ausgabe»:** Befunde mit Code, Stelle und «Was tun»; je Ziel die Gründe, warum ein Export nicht möglich ist; Übersicht, welche Handlung die Rechte erlauben.
3. **Prüfbericht** (JSON): alle Befunde zum Aufheben oder Weitergeben.
4. **`LIESMICH.txt` im ZIP-Paket:** was fehlt und warum.
5. **Browserkonsole:** technische Ursache und Stack bei unerwarteten Fehlern.

## Was getestet ist

`tests/unit/ui/errors.test.ts`: leere, binäre, zu grosse und nicht-UTF-8-Dateien, Meldung nennt die Datei, Auswahl bleibt, `guarded`, globale Handler, Absturzkarte, `guardBuild` mit `EXPORT_INTERNAL_ERROR`. Weitere Fehlerfälle der Datei- und Rechteprüfung stehen in den Tests der jeweiligen Stufe.

## Grenzen

- Ein Fehler in einem Browser, der `FileReader`, `Blob` oder Downloads nicht unterstützt, kann nur als Meldung mit der Browserursache gezeigt werden.
- Läuft dem Browser der Speicher aus (sehr grosse Kataloge), kann auch die Fehlermeldung scheitern. Das Limit von 10 MB und 1 Mio. Knoten beim Lesen soll das verhindern.
- Ein Programmfehler, der einen falschen, aber gültig aussehenden Export erzeugt, wird dadurch nicht erkannt. Dagegen helfen nur Tests und der Importtest am echten Zielsystem (siehe [PROTOTYPEN.md](PROTOTYPEN.md)).
