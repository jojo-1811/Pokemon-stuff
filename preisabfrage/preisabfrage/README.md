# Preisabfrage (Cardmarket)

Pokémon-Karte suchen (deutscher oder englischer Name, optional Nummer), Kartenbild und Cardmarket-Preise ansehen und mit einem Klick die passenden Angebote auf Cardmarket öffnen, gefiltert nach Kartensprache, Verkäuferland (Deutschland oder EU) und Mindestzustand. Dort sind die Verkäuferfotos und Kommentare der Angebote zu sehen.

Statische Seite ohne Build, läuft über GitHub Pages unter `…/Pokemon-stuff/preisabfrage/`.

## Datenquellen
- **TCGdex** (https://tcgdex.dev): Kartensuche, Bilder in der gewählten Sprache, Cardmarket-Preisguide (Trend, Ab, Ø 1/7/30 Tage, getrennt nach Normal und Holo/Reverse). Kein API-Schlüssel nötig.
- **Cardmarket**: nur als Link. Cardmarket vergibt derzeit keinen API-Zugang, die Angebote selbst werden deshalb nicht in die App geladen.

Die Preise aus dem Preisguide gelten für alle Sprachen und Länder zusammen. Preise nur für deutsche Karten oder nur deutsche Verkäufer gibt es ausschließlich auf Cardmarket über den Link.

## Aufbau
- `js/api.js`: TCGdex-Abfragen, Preisauswertung
- `js/cardmarket.js`: Filter-IDs (Sprache, Land, Zustand) und Link-Bau
- `js/app.js`: Oberfläche; Filter werden im Browser gemerkt
- `test/`: `node test/run.mjs` (9 Tests, mit nachgebildeten API-Antworten)

## Cardmarket-Filter-IDs
Sprache: 1 Englisch, 2 Französisch, 3 Deutsch, 4 Spanisch, 5 Italienisch, 7 Japanisch, 8 Portugiesisch. Verkäuferland Deutschland: 7. Zustand: 1 Mint … 6 Played.
