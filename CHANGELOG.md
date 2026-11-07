# Changelog

Format nach [Keep a Changelog](https://keepachangelog.com/de/1.1.0/). Schema-Versionen und Anwendungsversionen werden getrennt geführt.

## [Unveröffentlicht]

### Hinzugefügt
- Repository-Grundgerüst: `.gitignore`, README, Dokumentationsindex, Architektur, Entscheidungsprotokoll, Roadmap, Beitragsrichtlinien.
- JSON-Schema 0.3.0 (Katalog, Projekt) als strukturelle Umsetzung des ursprünglichen Datenvertrags.
- JSON-Schema 0.4.0: rein additive Erweiterung (Slider, Ranking, Notiz-Items, Textformate, zusammengesetzte Bedingungen, Export-Hinweise je Plattform, Sensitivitätsmarker, Einwilligung/Datenschutz, versteckte Felder u. a.).
- Beispielkatalog `examples/catalog_rich_0_4_0.json`.
- Test-Fixtures (11 Dateien, Schema 0.3.0) unter `tests/fixtures/v0.3.0/`.
- Python-Konformanztest (Fixtures, Beispiel, 35 Mutationen).
- Recherche zu den Importmöglichkeiten der Zielsysteme.
