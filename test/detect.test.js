// Ausführen mit:  node --test
'use strict';
const test = require('node:test');
const assert = require('node:assert');
const D = require('../js/detect.js');
const G = require('../js/grading.js');
const { makeCard } = require('./synthetic.js');

function lrRatio(b) { return (b.left / (b.left + b.right)) * 100; }
function tbRatio(b) { return (b.top / (b.top + b.bottom)) * 100; }
function bordersOf(m) {
  return {
    left: m.inner.left - m.outer.left,
    right: m.outer.right - m.inner.right,
    top: m.inner.top - m.outer.top,
    bottom: m.outer.bottom - m.inner.bottom,
  };
}

const cases = [
  { name: 'perfekt zentriert', border: { left: 30, right: 30, top: 32, bottom: 32 } },
  { name: '60/40 links-rechts', border: { left: 36, right: 24, top: 30, bottom: 30 } },
  { name: '55/45 oben-unten', border: { left: 30, right: 30, top: 33, bottom: 27 } },
  { name: '70/30 beide Achsen', border: { left: 21, right: 49, top: 42, bottom: 18 } },
  { name: 'dunkler Hintergrund', border: { left: 28, right: 34, top: 30, bottom: 30 }, bg: [30, 32, 36] },
  { name: 'Rückseite (blau)', border: { left: 33, right: 27, top: 30, bottom: 30 }, edge: [28, 64, 150] },
];

for (const c of cases) {
  test('Erkennung: ' + c.name, () => {
    const img = makeCard({ border: c.border, bg: c.bg, edge: c.edge, seed: 7 });
    const m = D.analyze(img);
    const got = bordersOf(m);
    const lrErr = Math.abs(lrRatio(got) - lrRatio(c.border));
    const tbErr = Math.abs(tbRatio(got) - tbRatio(c.border));
    assert.ok(lrErr < 1.5, `L/R: erwartet ${lrRatio(c.border).toFixed(1)}, gemessen ${lrRatio(got).toFixed(1)} (${JSON.stringify(got)})`);
    assert.ok(tbErr < 1.5, `O/U: erwartet ${tbRatio(c.border).toFixed(1)}, gemessen ${tbRatio(got).toFixed(1)} (${JSON.stringify(got)})`);
  });
}

test('Erkennung: Bild exakt auf Karte zugeschnitten', () => {
  const w = 640, h = Math.round(640 * 88 / 63);
  const border = { left: 34, right: 26, top: 30, bottom: 30 };
  const img = makeCard({ W: w, H: h, card: { x: 0, y: 0, w }, border, seed: 3 });
  const m = D.analyze(img);
  const got = bordersOf(m);
  assert.ok(Math.abs(lrRatio(got) - lrRatio(border)) < 2, JSON.stringify({ got, outer: m.outer }));
});

for (const deg of [2, -3.5]) {
  test(`Schieflage ${deg}° wird ausgeglichen`, () => {
    const border = { left: 36, right: 24, top: 30, bottom: 30 };
    const img = D.rotateImage(makeCard({ border, seed: 11, card: { x: 130, y: 110, w: 620 } }), deg);
    const m = D.analyze(img);
    assert.ok(Math.abs(m.rotation + deg) < 0.4, `Rotation erkannt: ${m.rotation}`);
    const got = bordersOf(m);
    assert.ok(Math.abs(lrRatio(got) - 60) < 2, `L/R ${lrRatio(got).toFixed(1)} ${JSON.stringify(got)}`);
  });
}

test('Grading: Grenzen', () => {
  const r = G.evaluate({ front: { left: 55, right: 45, top: 50, bottom: 50 } });
  assert.strictEqual(r.companies.psa.overall, '10');
  assert.strictEqual(r.companies.bgs.overall, '9.5');
  const r2 = G.evaluate({ front: { left: 61, right: 39, top: 50, bottom: 50 }, back: { left: 80, right: 20, top: 50, bottom: 50 } });
  assert.strictEqual(r2.companies.psa.front.label, '8');
  assert.strictEqual(r2.companies.psa.back.label, '9');
  assert.strictEqual(r2.companies.psa.overall, '8');
  assert.strictEqual(r2.companies.psa.limiting, 'front');
  assert.strictEqual(G.fmt(60), '60,0/40,0');
});

// ---------- zwei Punkte je Kante ----------
const Geo = require('../js/geometry.js');

test('Geometrie: gerades Rechteck ergibt gleiche Breite an beiden Messstellen', () => {
  const lines = Geo.fromRects(
    { left: 0, right: 630, top: 0, bottom: 880 },
    { left: 36, right: 606, top: 30, bottom: 850 }
  );
  const m = Geo.measure(lines);
  assert.ok(m.valid);
  assert.deepStrictEqual(m.sides.left.at.map(v => +v.toFixed(6)), [36, 36]);
  assert.strictEqual(+m.sides.right.mean.toFixed(6), 24);
  assert.ok(Math.abs(m.innerTilt) < 1e-9);
  const r = Geo.endRatios(m);
  assert.ok(Math.abs(r.lr[0] - 60) < 1e-9 && Math.abs(r.lr[1] - 60) < 1e-9);
});

test('Geometrie: schiefer linker Innenrand', () => {
  const lines = Geo.fromRects(
    { left: 0, right: 630, top: 0, bottom: 880 },
    { left: 30, right: 600, top: 30, bottom: 850 }
  );
  // linke Innenkante unten 10 px weiter innen
  lines.inner.left[1].x += 10;
  const m = Geo.measure(lines);
  assert.ok(m.sides.left.taper > 5, JSON.stringify(m.sides.left));
  assert.ok(m.sides.left.angle < 0, 'Kante nach rechts unten geneigt = gegen den Uhrzeigersinn');
});

test('Geometrie: Innenrahmen außerhalb wird als ungültig erkannt', () => {
  const lines = Geo.fromRects(
    { left: 40, right: 630, top: 0, bottom: 880 },
    { left: 30, right: 600, top: 30, bottom: 850 }
  );
  assert.strictEqual(Geo.measure(lines).valid, false);
});

for (const tilt of [0.8, -1.2]) {
  test(`Erkennung: schief gedruckter Innenrahmen (${tilt}°)`, () => {
    const border = { left: 34, right: 34, top: 32, bottom: 32 };
    const img = makeCard({ border, frameTilt: tilt, seed: 5 });
    const m = D.analyze(img);
    const g = Geo.measure(m.lines);
    assert.ok(Math.abs(m.rotation) < 0.3, `Karte selbst ist gerade, erkannt: ${m.rotation}`);
    assert.ok(Math.abs(g.innerTilt - tilt) < 0.25, `Neigung erkannt: ${g.innerTilt.toFixed(2)}°`);
    // im Uhrzeigersinn gedreht: linker Rand wird nach unten schmaler
    assert.ok(Math.sign(g.sides.left.taper) === -Math.sign(tilt) && Math.abs(g.sides.left.taper) > 5, JSON.stringify(g.sides.left));
  });
}

test('Wertung: schlechteste Stelle statt Mittelwert', () => {
  const lines = Geo.fromRects(
    { left: 0, right: 630, top: 0, bottom: 880 },
    { left: 30, right: 600, top: 30, bottom: 850 }
  );
  lines.inner.left[1].x += 10; // unten links breiter → unten schlechter
  const m = Geo.measure(lines);
  const mean = Geo.bordersFor(m, 'mean'), worst = Geo.bordersFor(m, 'worst');
  assert.strictEqual(worst.where.lr, 1);
  const ratio = b => (b.left / (b.left + b.right)) * 100;
  assert.ok(ratio(worst.borders) > ratio(mean.borders) + 1, `${ratio(worst.borders)} vs ${ratio(mean.borders)}`);
  assert.strictEqual(+worst.borders.top.toFixed(6), +mean.borders.top.toFixed(6));
});
