# Kartenzentrierung

Web-Tool, das aus einem Foto einer Pokémon-Karte (oder jeder anderen Karte im Format 63 × 88 mm) das **Centering** misst und den Centering-Grenzen von **PSA, BGS und CGC** zuordnet.

Alles läuft lokal im Browser. Es gibt keinen Server, keine Abhängigkeiten und keinen Build-Schritt; Fotos verlassen das Gerät nicht.

## Funktionen

- Foto hochladen, hineinziehen oder mit Strg+V einfügen
- Automatische Erkennung von Kartenkante und Innenrahmen
- Automatischer Ausgleich von Schieflage (bis ca. ±12°)
- Jede der acht Kanten (Kartenkante und Innenrahmen, je vier Seiten) hat **zwei verschiebbare Punkte**. Einen Punkt ziehen stellt die Kante schräg, die Linie ziehen verschiebt sie parallel. Beim Ziehen erscheint eine Lupe
- **Randverlauf:** Randbreite an zwei Stellen je Seite, Unterschied in mm, Drehung des Innenrahmens gegenüber der Kartenkante und ein Schema mit überhöhter Abweichung. So fällt ein schief gedruckter oder schief geschnittener Rand sofort auf
- Die Erkennung setzt die Punkte bereits passend zu einem schiefen Rahmen
- Feinjustierung per Pfeiltasten (¼ Pixel, mit Umschalt 3 Pixel), `N` springt zum nächsten Punkt
- Vorder- und Rückseite getrennt messen; die schlechtere Seite begrenzt das Ergebnis
- Ausgabe als Verhältnis (z. B. 57,7/42,3), Verhältnis an beiden Enden jeder Achse, Randbreite in mm und Note je Grader
- Umschalter **Wertung**: Note aus dem Mittelwert beider Messstellen oder aus der **schlechtesten Stelle** je Achse (die Auswahl merkt sich der Browser)

## Nutzung

### Lokal

`index.html` im Browser öffnen. Fertig.

### Online

**https://jojo-1811.github.io/Pokemon-stuff/kartenzentrierung/**

Die Seite wird über GitHub Pages direkt aus diesem Ordner ausgeliefert.

## Gute Fotos

- Karte flach hinlegen und **senkrecht von oben** fotografieren. Ein schräger Blickwinkel verzerrt die Ränder perspektivisch, das kann das Tool nicht herausrechnen.
- **Kontrast zum Hintergrund:** Gelber Rand auf dunklem Untergrund funktioniert am besten.
- Karte möglichst groß im Bild, aber mit etwas Abstand zum Bildrand.
- Ohne Sleeve oder Toploader messen, wenn möglich (Spiegelungen stören).
- Am genauesten wird es mit einem Flachbettscanner.

## Wie gemessen wird

1. **Schieflage:** Kantenpixel werden für viele Testwinkel auf die Achsen projiziert. Beim richtigen Winkel liegen die Kartenkanten jeweils in wenigen Bins (Projektionsprofil). Danach wird das Bild gedreht und die Neigung an den gefundenen Kanten noch einmal nachgemessen.
2. **Kartenkante:** Aus Farbgradienten entstehen Kantenprofile für Spalten und Zeilen. Aus den stärksten Kandidaten wird die Kombination gewählt, die am besten zum Seitenverhältnis 63 : 88 passt und direkt innen einen gleichmäßigen Rand hat.
3. **Innenrahmen:** Von jeder Kante aus wird auf 120 Scanlinien nach innen gelaufen, bis die Farbe deutlich von der Randfarbe abweicht. Der Median aller Treffer wird auf Subpixel genau am Farbübergang ausgerichtet, eine Ausgleichsgerade durch die Treffer liefert die Neigung der Kante.
4. **Zwei Punkte je Kante:** Aus Lage und Neigung entstehen für jede Kante zwei Punkte bei 20 % und 80 % der Kantenlänge. Die Ecken ergeben sich als Schnittpunkte benachbarter Kanten.
5. **Centering:** An beiden Stellen wird der senkrechte Abstand zwischen Kartenkante und Innenrahmen gemessen. Für die Note zählt standardmäßig der Mittelwert, wahlweise die schlechtere der beiden Stellen: `links / (links + rechts)` bzw. `oben / (oben + unten)`; die schlechtere Achse bestimmt die Note. Die Werte an den Enden zeigt das Tool zusätzlich an.

Die Erkennung ist eine Hilfe, kein Urteil. Vor allem bei Full-Art-Karten, Karten mit wenig Kontrast oder unruhigem Hintergrund die Linien kontrollieren und notfalls von Hand setzen.

## Notengrenzen

Stehen in [`js/grading.js`](js/grading.js) und lassen sich dort anpassen. Angegeben ist jeweils der größere Anteil, bis zu dem die Note noch erreicht wird.

| Grader | Note | Vorderseite | Rückseite |
|---|---|---|---|
| PSA | 10 | 55/45 | 75/25 |
| PSA | 9 | 60/40 | 90/10 |
| PSA | 8 | 65/35 | 90/10 |
| BGS (Subgrade) | 10 | 52/48 | 55/45 |
| BGS (Subgrade) | 9.5 | 55/45 | 60/40 |
| BGS (Subgrade) | 9 | 60/40 | 65/35 |
| CGC | Pristine 10 | 52/48 | 55/45 |
| CGC | 10 | 55/45 | 75/25 |
| CGC | 9 | 60/40 | 90/10 |

Offiziell veröffentlicht ist vor allem die PSA-10-Grenze (seit Anfang 2025: 55/45 vorne, vorher 60/40). Die übrigen Werte stammen aus den Grading-Skalen der Anbieter und verbreiteten Übersichten und können von der tatsächlichen Bewertung abweichen. Das Tool bewertet nur das Centering, nicht Ecken, Kanten oder Oberfläche.

## Projektstruktur

```
index.html          Oberfläche
css/style.css       Gestaltung (helles und dunkles Theme)
js/detect.js        Kantenerkennung, Schieflage, Drehung (läuft auch in Node)
js/grading.js       Verhältnisse und Notengrenzen (läuft auch in Node)
js/geometry.js      Kanten aus zwei Punkten, Randbreiten, Neigung (läuft auch in Node)
js/sample.js        Generische Beispielkarte für den ersten Start
js/app.js           Upload, Zeichnen, verschiebbare Linien, Ergebnis
test/               Tests mit synthetischen Kartenbildern
```

## Tests

Benötigt Node.js ab Version 18:

```bash
npm test
```

Die Tests erzeugen Kartenbilder mit bekannten Randbreiten (verschiedene Verhältnisse, dunkler Hintergrund, blaue Rückseite, exakt zugeschnittenes Bild, 2° und −3,5° Schieflage, schief gedruckter Innenrahmen) und prüfen, dass die Messung auf unter 1,5 Prozentpunkte und die Rahmenneigung auf 0,25° genau ist. Bei jedem Push laufen sie über GitHub Actions (`.github/workflows/test.yml` im Hauptordner).

## Ideen für später

- Perspektivkorrektur über vier Eckpunkte (für schräg aufgenommene Fotos)
- Kalibrierung mit echten Fotos bereits gegradeter Karten
- Export des Messbilds als PNG

## Lizenz

MIT, siehe [LICENSE](../LICENSE). Pokémon ist eine Marke von Nintendo, Creatures Inc. und GAME FREAK inc.; dieses Projekt steht in keiner Verbindung dazu.
