# Preisabfrage (Cardmarket)

Pokémon-Karte suchen (deutscher oder englischer Name, japanische Schrift, optional Set und Nummer) oder ein ganzes Set durchsehen, Kartenbild und Cardmarket-Preise ansehen und mit einem Klick die passenden Angebote auf Cardmarket öffnen, gefiltert nach Kartensprache, Verkäuferland (Deutschland oder EU) und Mindestzustand. Dort sind die Verkäuferfotos und Kommentare der Angebote zu sehen.

Statische Seite ohne Build, läuft über GitHub Pages unter `…/Pokemon-stuff/preisabfrage/`.

## Suche
- **Nur Karte:** sucht deutsch und englisch. Findet die genaue Eingabe nichts, wird ohne Satzzeichen und zuletzt mit dem längsten Wort gesucht und lokal nachgefiltert („Glurak ex“ findet „Glurak-ex“).
- **Nur Set:** alle Karten des Sets, nach Nummer sortiert. Das Set-Feld nimmt Namen (deutsch/englisch/Landessprache) oder Set-Codes an: TCGdex-ID (sv08.5, SV9.5), aufgedrucktes Kürzel (PRE, MEW) oder asiatische Codes (SV8a, CSV9.5 → CSV9.5C). Japanische, chinesische und koreanische Sets sind enthalten (gleiche ID in mehreren Sprachen = ein Eintrag; bekannte Sets auch unter englischem Namen, z. B. „Terastal Festival ex“). Genauer Code oder genauer Name hat Vorrang vor Teiltreffern („151“ → 151/MEW). TCG-Pocket-Sets sind ausgeblendet. Hat TCGdex für ein Set keine Karten (z. B. CSV9.5C), sagt die App das und bietet die Cardmarket-Suche an; bei mehreren Treffern erscheinen Set-Kacheln. „Alle Sets anzeigen“ listet alle.
- **Karte + Set:** Karten des Sets nach Name/Nummer gefiltert.
- **Direkt auf Cardmarket suchen:** immer verfügbar, für Karten, die TCGdex nicht kennt (z. B. japanische Promos wie „Trade Please!“).

## Datenquellen
- **TCGdex** (https://tcgdex.dev): Kartensuche, Bilder in der gewählten Sprache, Cardmarket-Preisguide (Trend, Ab, Ø 1/7/30 Tage, getrennt nach Normal und Holo/Reverse). Kein API-Schlüssel nötig.
- **Cardmarket**: nur als Link. Cardmarket vergibt derzeit keinen API-Zugang, die Angebote selbst werden deshalb nicht in die App geladen.

Die Preise aus dem Preisguide gelten für alle Sprachen und Länder zusammen. Preise nur für deutsche Karten oder nur deutsche Verkäufer gibt es ausschließlich auf Cardmarket über den Link.

## Aufbau
- `js/api.js`: TCGdex-Abfragen, Preisauswertung
- `js/cardmarket.js`: Filter-IDs (Sprache, Land, Zustand) und Link-Bau
- `js/app.js`: Oberfläche; Filter werden im Browser gemerkt
- `test/`: `node test/run.mjs` (19 Tests, mit nachgebildeten API-Antworten)

## Cardmarket-Filter-IDs
Sprache: 1 Englisch, 2 Französisch, 3 Deutsch, 4 Spanisch, 5 Italienisch, 6 Chinesisch (vereinfacht), 7 Japanisch, 8 Portugiesisch, 10 Koreanisch, 11 Chinesisch (traditionell). Verkäuferland Deutschland: 7. Zustand: 1 Mint … 6 Played.

## Geprüft mit echten Daten
Die Set- und Kartensuche wurde zusätzlich gegen eine aus den TCGdex-Rohdaten (github.com/tcgdex/cards-database) nachgebaute API getestet.
