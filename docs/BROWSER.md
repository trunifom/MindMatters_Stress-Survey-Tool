# Browser-Unterstützung

Ziel: Das Tool läuft auf jedem gängigen aktuellen Browser, ohne Zusatzbibliothek und ohne Installation. **Dieses Dokument trennt strikt, was belegt ist, und was nur ein Ziel ist.**

## Belegt

| Browser | Umgebung | Was geprüft wurde |
|---|---|---|
| Microsoft Edge 156 (Chromium), headless | Windows 11, Datei per `file://` geöffnet | alle 14 Tests unter `tests/e2e/browser.test.ts` bestehen |

Die Browser-Tests laufen mit `npm run test:e2e` gegen die gebaute Datei `dist/mindmatters.html`. Sie verwenden einen installierten Browser (Edge oder Chrome, über `MM_BROWSER_PATH` wählbar). Es wird nichts heruntergeladen. Ohne Browser wird die Suite übersprungen und das offen gesagt.

Was sie belegen (Edge 156):
- **Offline und kein Netzwerk (T01, T02):** Mit abgeschaltetem Netz startet die Datei, lädt einen Katalog und durchläuft Liste, Info-Fenster, Vorschau und Ausgabe. Aufgezeichnet wurden ausschliesslich `file:`-, `data:`- und `blob:`-Anfragen, keine einzige Anfrage an ein Netzwerk. Es gibt keine Konsolen- oder Seitenfehler.
- **Die Content-Security-Policy greift (T02):** Ein `fetch` an eine Netzwerkadresse wird mit der Verletzung `connect-src` abgewiesen.
- **Tastatur (T39, teilweise):** Skip-Link als erster Halt, Erreichen der Dateiauswahl mit Tab, Öffnen des Dateidialogs mit Leertaste, Umschalten einer Checkbox mit Leertaste ohne Fokusverlust, sichtbarer Fokusring (Umriss ≥ 2 px), Info-Fenster mit Enter öffnen, Tab bleibt im Fenster, Escape schliesst und gibt den Fokus zurück.
- **Echte Downloads:** Projekt, Prüfbericht und Codebuch werden als Dateien erzeugt (Name, Inhalt, Markdown-Typ). Das Projekt lässt sich über die Dateiauswahl wieder laden und ergibt dieselbe Auswahl.
- **Ungesicherte Änderungen (T42):** Das Ereignis `beforeunload` wird bei Änderungen abgebrochen (also vom Browser nachgefragt) und nach dem Speichern nicht mehr.
- **Sicherheit (T41):** `<img onerror>` und `<script>` in Katalogtexten bleiben Text, es läuft kein Skript.
- **Handybreite:** Bei 375 px gibt es in keiner Ansicht und im Info-Fenster horizontales Scrollen. Eine breite Matrix scrollt in ihrem eigenen Bereich. (Dieser Fehler wurde erst im echten Browser gefunden und behoben.)
- **ZIP-Paket und Druck:** Das Paket wird als echte Datei heruntergeladen (Beginn `PK`, enthält README, Projekt, Prüfbericht, Codebuch und Exporte). Im Druckmodus (emuliert) sind Tabs, Knöpfe und Sprunglink ausgeblendet, die Vorschau bleibt, der Hintergrund ist weiss. Ein echter Ausdruck oder PDF-Export wurde nicht geprüft.
- **Hell/Dunkel:** Die Oberfläche folgt dem Farbschema des Systems.
- **Leistung (T40):** 5,12 MB, 1.010 Items: Datei gewählt bis bedienbare Liste nach 749 ms (Edge 156, Entwicklungsrechner; Ziel 5 s). Ein Referenzgerät ist noch nicht festgelegt.

## Nicht belegt
- **Firefox, Safari (macOS und iOS), Chrome selbst, Edge auf anderen Versionen, Android-Browser:** nicht getestet. Auch der Edge-Test lief headless, nicht mit sichtbarem Fenster.
- **Screenreader** (NVDA, JAWS, VoiceOver): nicht getestet. Die Struktur ist darauf ausgelegt (Überschriften, Beschriftungen, `role="dialog"`, Live-Region, Status mit Text statt nur Farbe), ein Nachweis fehlt.
- **Drucken, Browser mit Erweiterungen, Unternehmens-Richtlinien** (z. B. gesperrtes `file://` oder blockierte Downloads): nicht geprüft.
- **Echter Dialog beim Schliessen** (`beforeunload`): Browser zeigen ihren eigenen Text und verlangen eine Benutzerinteraktion. Geprüft ist nur, dass das Tool die Rückfrage anfordert.

## Technische Grundlage (Ziel, nicht Nachweis)
- Syntax wird beim Build auf ES2019 abgesenkt. Verwendet werden gewöhnliche Browser-Schnittstellen (`FileReader`, `Blob`, `URL.createObjectURL`, `TextEncoder`).
- Bewusst nicht verwendet: `structuredClone` (fehlt vor 2022), `<dialog>`, Web-Speicher (`localStorage` u. ä.), Netzwerk-APIs, Service Worker.
- Ein Stilmerkmal (`color-mix` für die Hervorhebung gewählter Items) ist neueren Browsern vorbehalten. Ältere ignorieren es, die Auswahl bleibt an der Checkbox erkennbar.
- Die Schema-Prüfer werden beim Build erzeugt. Die Seite braucht deshalb weder `new Function` noch `eval`, und die Content-Security-Policy enthält kein `'unsafe-eval'` (Stand 8. November 2026; in Edge 156 mit allen Browser-Tests belegt).

## So erweitern Sie den Nachweis
Setzen Sie `MM_BROWSER_PATH` auf eine andere Chromium-basierte Installation und führen Sie `npm run test:e2e` aus. Für Firefox und Safari bräuchte es einen anderen Treiber (Playwright mit heruntergeladenen Browsern); das ist noch nicht eingerichtet. Tragen Sie neue Browser hier nur ein, wenn die Suite dort tatsächlich lief.
