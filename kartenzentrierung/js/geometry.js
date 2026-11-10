/*
 * geometry.js — rechnet aus den Messpunkten (zwei pro Kante) die Randbreiten.
 *
 * Datenmodell (Bildkoordinaten):
 *   lines = {
 *     outer: { left: [p0, p1], right: [p0, p1], top: [p0, p1], bottom: [p0, p1] },
 *     inner: { … gleich … }
 *   }
 * Jede Kante ist die Gerade durch ihre zwei Punkte. Die Ecken ergeben sich
 * als Schnittpunkte benachbarter Kanten, damit ist jeder Rahmen ein Viereck.
 *
 * Gemessen wird an zwei Stellen je Seite (20 % und 80 % entlang der Außenkante)
 * der senkrechte Abstand zur inneren Kante. Unterschiedliche Werte an beiden
 * Stellen bedeuten: der Rand läuft schief.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CenteringGeometry = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const SIDES = ['left', 'right', 'top', 'bottom'];
  const STATIONS = [0.2, 0.8];

  const isVertical = side => side === 'left' || side === 'right';

  /** Schnittpunkt zweier Geraden (je zwei Punkte) oder null bei Parallelen. */
  function intersect([a, b], [c, d]) {
    const r = { x: b.x - a.x, y: b.y - a.y }, s = { x: d.x - c.x, y: d.y - c.y };
    const den = r.x * s.y - r.y * s.x;
    if (Math.abs(den) < 1e-9) return null;
    const t = ((c.x - a.x) * s.y - (c.y - a.y) * s.x) / den;
    return { x: a.x + t * r.x, y: a.y + t * r.y };
  }

  /** Vorzeichenloser Abstand eines Punkts zur Geraden durch [a, b]. */
  function distToLine(p, [a, b]) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const len = Math.hypot(dx, dy) || 1;
    return Math.abs((p.x - a.x) * dy - (p.y - a.y) * dx) / len;
  }

  /** Ecken eines Rahmens: tl, tr, br, bl. */
  function corners(ring) {
    return {
      tl: intersect(ring.left, ring.top),
      tr: intersect(ring.right, ring.top),
      br: intersect(ring.right, ring.bottom),
      bl: intersect(ring.left, ring.bottom),
    };
  }

  /** Anfang und Ende einer Kante (zwischen ihren Ecken), sortiert oben→unten bzw. links→rechts. */
  function edgeSegment(ring, side) {
    const c = corners(ring);
    switch (side) {
      case 'left': return [c.tl, c.bl];
      case 'right': return [c.tr, c.br];
      case 'top': return [c.tl, c.tr];
      default: return [c.bl, c.br];
    }
  }

  /** Neigung einer Kante in Grad (positiv = im Uhrzeigersinn gedreht). */
  function edgeAngle(line, side) {
    const [a, b] = line;
    if (isVertical(side)) {
      const dy = b.y - a.y || 1e-9;
      return (-Math.atan((b.x - a.x) / dy) * 180) / Math.PI;
    }
    const dx = b.x - a.x || 1e-9;
    return (Math.atan((b.y - a.y) / dx) * 180) / Math.PI;
  }

  /** Liegt der Innenrahmen auf dieser Seite innerhalb der Außenkante? */
  function insideOf(p, ring, side) {
    // Vergleich über die Lage relativ zur Außenkante in Richtung Kartenmitte
    const c = corners(ring);
    if (!c.tl || !c.br) return false;
    const center = { x: (c.tl.x + c.br.x) / 2, y: (c.tl.y + c.br.y) / 2 };
    const [a, b] = ring[side];
    const cross = q => (b.x - a.x) * (q.y - a.y) - (b.y - a.y) * (q.x - a.x);
    return Math.sign(cross(p)) === Math.sign(cross(center));
  }

  /**
   * Misst alle vier Seiten.
   * Rückgabe je Seite: { at: [w0, w1], mean, taper (w1 − w0), angle (Innen − Außen, Grad), valid }
   * plus Kartengröße in Pixeln für die mm-Umrechnung.
   */
  function measure(lines) {
    const out = { sides: {}, valid: true };
    const oc = corners(lines.outer);
    if (!oc.tl || !oc.tr || !oc.br || !oc.bl) return { sides: {}, valid: false };
    const len = (p, q) => Math.hypot(q.x - p.x, q.y - p.y);
    out.cardWidthPx = (len(oc.tl, oc.tr) + len(oc.bl, oc.br)) / 2;
    out.cardHeightPx = (len(oc.tl, oc.bl) + len(oc.tr, oc.br)) / 2;

    for (const side of SIDES) {
      const [s0, s1] = edgeSegment(lines.outer, side);
      const at = STATIONS.map(f => {
        const p = { x: s0.x + (s1.x - s0.x) * f, y: s0.y + (s1.y - s0.y) * f };
        const d = distToLine(p, lines.inner[side]);
        // Innenkante muss auf der Kartenseite der Außenkante liegen
        const q = intersectPerp(p, lines.outer[side], lines.inner[side]);
        return q && insideOf(q, lines.outer, side) ? d : -d;
      });
      const angle = edgeAngle(lines.inner[side], side) - edgeAngle(lines.outer[side], side);
      const valid = at[0] > 0 && at[1] > 0;
      if (!valid) out.valid = false;
      out.sides[side] = { at, mean: (at[0] + at[1]) / 2, taper: at[1] - at[0], angle, valid };
    }
    // Gesamtdrehung des Innenrahmens gegenüber der Kartenkante
    out.innerTilt = SIDES.reduce((a, s) => a + out.sides[s].angle, 0) / 4;
    return out;
  }

  /** Fußpunkt: von p senkrecht zur Außenkante bis zur Innenkante. */
  function intersectPerp(p, outerLine, innerLine) {
    const [a, b] = outerLine;
    const n = { x: -(b.y - a.y), y: b.x - a.x };
    return intersect([p, { x: p.x + n.x, y: p.y + n.y }], innerLine);
  }

  /** Mittlere Randbreiten (für die Notenberechnung). */
  function meanBorders(m) {
    const b = {};
    for (const s of SIDES) b[s] = m.sides[s].mean;
    return b;
  }

  /**
   * Centering an beiden Enden jeder Achse.
   * lr: [oben, unten] (links-Anteil in %), tb: [links, rechts] (oben-Anteil in %)
   */
  function endRatios(m) {
    const L = m.sides.left.at, R = m.sides.right.at, T = m.sides.top.at, B = m.sides.bottom.at;
    return {
      lr: [0, 1].map(i => (L[i] / (L[i] + R[i])) * 100),
      tb: [0, 1].map(i => (T[i] / (T[i] + B[i])) * 100),
    };
  }

  /**
   * Randbreiten für die Wertung.
   * mode 'mean':  Mittelwert beider Messstellen je Seite
   * mode 'worst': je Achse die Messstelle mit dem schlechteren Verhältnis
   *               (links/rechts: oben oder unten; oben/unten: links oder rechts)
   * Rückgabe: { borders, where: { lr: 0|1|null, tb: 0|1|null } }
   */
  function bordersFor(m, mode) {
    if (mode !== 'worst') return { borders: meanBorders(m), where: { lr: null, tb: null } };
    const L = m.sides.left.at, R = m.sides.right.at, T = m.sides.top.at, B = m.sides.bottom.at;
    const off = (a, b) => Math.abs(a / (a + b) - 0.5);
    const lr = off(L[1], R[1]) > off(L[0], R[0]) ? 1 : 0;
    const tb = off(T[1], B[1]) > off(T[0], B[0]) ? 1 : 0;
    return {
      borders: { left: L[lr], right: R[lr], top: T[tb], bottom: B[tb] },
      where: { lr, tb },
    };
  }

  /**
   * Welche Ränder miteinander verglichen werden.
   * standard: links ↔ rechts, oben ↔ unten
   * ereader:  oben ↔ rechts, links ↔ unten (e-Reader-Karten, Vorderseite: Dot-Code
   *           liegt links und unten, daher werden die Ränder über Eck verglichen)
   */
  const PAIRINGS = {
    standard: [['left', 'right'], ['top', 'bottom']],
    ereader: [['top', 'right'], ['left', 'bottom']],
  };

  /** Gegenüberliegende Seiten (gleiche Ausrichtung)? */
  const opposite = (a, b) => isVertical(a) === isVertical(b);

  /**
   * Vergleich zweier Ränder je Achse.
   * Rückgabe je Achse: { a, b, wa, wb, ratio, where, range }
   *   wa, wb  Randbreiten in px, die gewertet werden
   *   ratio   Anteil von a in %
   *   where   [i, j] gewertete Messstellen (nur bei mode 'worst'), sonst null
   *   range   Anteil von a über alle Messstellen-Kombinationen: [bester, schlechtester]
   * Bei gegenüberliegenden Rändern werden nur gleiche Messstellen kombiniert
   * (sie liegen auf derselben Höhe), bei Rändern über Eck alle vier Kombinationen.
   */
  function axes(m, pairing, mode) {
    const pairs = PAIRINGS[pairing] || PAIRINGS.standard;
    return pairs.map(([a, b]) => {
      const A = m.sides[a].at, B = m.sides[b].at;
      const combos = opposite(a, b) ? [[0, 0], [1, 1]] : [[0, 0], [0, 1], [1, 0], [1, 1]];
      const share = ([i, j]) => (A[i] / (A[i] + B[j])) * 100;
      const shares = combos.map(share);
      let wa = m.sides[a].mean, wb = m.sides[b].mean, where = null;
      if (mode === 'worst') {
        let k = 0;
        for (let n = 1; n < combos.length; n++) if (Math.abs(shares[n] - 50) > Math.abs(shares[k] - 50)) k = n;
        where = combos[k];
        wa = A[where[0]]; wb = B[where[1]];
      }
      return {
        a, b, wa, wb, where,
        ratio: (wa / (wa + wb)) * 100,
        // [am nächsten an 50/50, am weitesten davon entfernt]
        range: shares.reduce((r, v) => [
          Math.abs(v - 50) < Math.abs(r[0] - 50) ? v : r[0],
          Math.abs(v - 50) > Math.abs(r[1] - 50) ? v : r[1],
        ], [shares[0], shares[0]]),
      };
    });
  }

  /** Achsen in das Format von grading.js (left/right = erste Achse, top/bottom = zweite). */
  function gradingBorders(ax) {
    return { left: ax[0].wa, right: ax[0].wb, top: ax[1].wa, bottom: ax[1].wb };
  }

  /** Erzeugt zwei Punkte je Kante aus achsparallelen Rechtecken. */
  function fromRects(outer, inner) {
    const mk = r => {
      const o = {};
      for (const side of SIDES) {
        o[side] = STATIONS.map(f => (isVertical(side)
          ? { x: r[side], y: outer.top + (outer.bottom - outer.top) * f }
          : { x: outer.left + (outer.right - outer.left) * f, y: r[side] }));
      }
      return o;
    };
    return { outer: mk(outer), inner: mk(inner) };
  }

  return { SIDES, PAIRINGS, intersect, distToLine, corners, edgeSegment, edgeAngle, measure, meanBorders, bordersFor, endRatios, axes, gradingBorders, fromRects, isVertical };
});
