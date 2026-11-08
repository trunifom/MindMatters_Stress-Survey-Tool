# src/adapters: Hinweis, Ordner ohne Code

Dieser Ordner enthält keinen Code. Die Export-Adapter (LimeSurvey, Qualtrics, REDCap, Google Forms, Baupläne, Tabellen, Dokumente, SPSS/R) liegen in **[`src/output`](../output/README.md)**.

Der Name `src/adapters` stammt aus der ersten Architekturskizze (`docs/ARCHITEKTUR.md`, Abschnitt «Schichten»: «je Zielsystem ein Ordner»). Umgesetzt wurde stattdessen ein gemeinsamer Ordner `src/output`, in dem jeder Export eine Datei ist und alle denselben Start über `adapterBase.ts` teilen. Dort stehen auch Projektdatei-nahe Ausgaben (Codebuch, Prüfbericht, ZIP-Paket), die keine Adapter sind.

Wer einen neuen Export schreiben will, liest [../output/README.md](../output/README.md), Abschnitt «Neuen Export ergänzen». Den Vertrag der Adapter (Abbildungsstufen, Annahmen, Stufen «Adapter», «Prototyp», «Tabelle») beschreiben ADR-007 und ADR-008 in [../../docs/ENTSCHEIDUNGEN.md](../../docs/ENTSCHEIDUNGEN.md) und [../../docs/PROTOTYPEN.md](../../docs/PROTOTYPEN.md).
