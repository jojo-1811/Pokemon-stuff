/*
 * detect.js — findet Kartenaußenkante und Innenrahmen auf einem Kartenfoto.
 *
 * Arbeitet auf ImageData-ähnlichen Objekten ({ width, height, data: RGBA }),
 * damit derselbe Code im Browser und in Node (Tests) läuft.
 *
 * Ablauf:
 *   1. Kantenprofile (Farbgradient, über Spalten/Zeilen aufsummiert)
 *   2. Außenkante: Kombination aus Kandidaten, die am besten zum
 *      Seitenverhältnis 63 × 88 mm passt und innen einen gleichmäßigen Rand hat
 *   3. Schieflage aus den vier Außenkanten schätzen, ggf. Bild drehen, neu messen
 *   4. Innenrahmen: von jeder Außenkante nach innen laufen, bis die Farbe
 *      deutlich von der Randfarbe abweicht (Median über viele Scanlinien)
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.CenteringDetect = api;
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const CARD_RATIO = 63 / 88; // Breite / Höhe einer Standard-TCG-Karte
  const api_debug = { on: false }; // für Fehlersuche: speichert Kandidaten der Außenkante

  // ---------- kleine Helfer ----------

  function clamp(v, lo, hi) { return v < lo ? lo : v > hi ? hi : v; }

  function median(arr) {
    if (!arr.length) return NaN;
    const s = Float64Array.from(arr).sort();
    const m = s.length >> 1;
    return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
  }

  function smooth(p, r) {
    const out = new Float64Array(p.length);
    for (let i = 0; i < p.length; i++) {
      let s = 0, n = 0;
      for (let k = -r; k <= r; k++) {
        const j = i + k;
        if (j >= 0 && j < p.length) { s += p[j]; n++; }
      }
      out[i] = s / n;
    }
    return out;
  }

  function getRGB(img, x, y) {
    x = clamp(Math.round(x), 0, img.width - 1);
    y = clamp(Math.round(y), 0, img.height - 1);
    const i = (y * img.width + x) * 4;
    return [img.data[i], img.data[i + 1], img.data[i + 2]];
  }

  function dist(a, b) {
    const r = a[0] - b[0], g = a[1] - b[1], bl = a[2] - b[2];
    return Math.sqrt(r * r + g * g + bl * bl);
  }

  /** Parabel durch drei Punkte → Subpixel-Lage des Maximums bei Index i. */
  function subpixel(p, i) {
    if (i <= 0 || i >= p.length - 1) return i;
    const a = p[i - 1], b = p[i], c = p[i + 1];
    const den = a - 2 * b + c;
    if (den >= 0) return i;
    return i + clamp((a - c) / (2 * den), -1, 1);
  }

  // ---------- Bild drehen (bilinear) ----------

  /** Dreht den Bildinhalt um `deg` Grad (positiv = im Uhrzeigersinn). */
  function rotateImage(img, deg) {
    const { width: w, height: h, data: src } = img;
    const out = new Uint8ClampedArray(w * h * 4);
    const a = (deg * Math.PI) / 180, cos = Math.cos(a), sin = Math.sin(a);
    const cx = (w - 1) / 2, cy = (h - 1) / 2;
    // Füllfarbe: Mittel der vier Ecken
    const corners = [getRGB(img, 0, 0), getRGB(img, w - 1, 0), getRGB(img, 0, h - 1), getRGB(img, w - 1, h - 1)];
    const fill = [0, 1, 2].map(c => corners.reduce((s, p) => s + p[c], 0) / 4);
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        const dx = x - cx, dy = y - cy;
        const sx = dx * cos + dy * sin + cx;
        const sy = -dx * sin + dy * cos + cy;
        const o = (y * w + x) * 4;
        if (sx < 0 || sy < 0 || sx > w - 1 || sy > h - 1) {
          out[o] = fill[0]; out[o + 1] = fill[1]; out[o + 2] = fill[2]; out[o + 3] = 255;
          continue;
        }
        const x0 = Math.floor(sx), y0 = Math.floor(sy);
        const x1 = Math.min(x0 + 1, w - 1), y1 = Math.min(y0 + 1, h - 1);
        const fx = sx - x0, fy = sy - y0;
        const i00 = (y0 * w + x0) * 4, i10 = (y0 * w + x1) * 4, i01 = (y1 * w + x0) * 4, i11 = (y1 * w + x1) * 4;
        for (let c = 0; c < 3; c++) {
          const top = src[i00 + c] * (1 - fx) + src[i10 + c] * fx;
          const bot = src[i01 + c] * (1 - fx) + src[i11 + c] * fx;
          out[o + c] = top * (1 - fy) + bot * fy;
        }
        out[o + 3] = 255;
      }
    }
    return { width: w, height: h, data: out };
  }

  // ---------- Kantenprofile ----------

  function edgeProfiles(img, lo, hi) {
    const { width: w, height: h, data: d } = img;
    const col = new Float64Array(w), row = new Float64Array(h);
    const y0 = Math.floor(h * lo), y1 = Math.ceil(h * hi);
    const x0 = Math.floor(w * lo), x1 = Math.ceil(w * hi);
    const sy = Math.max(1, Math.floor((y1 - y0) / 400));
    const sx = Math.max(1, Math.floor((x1 - x0) / 400));
    for (let y = y0; y < y1; y += sy) {
      const r = y * w * 4;
      for (let x = 1; x < w - 1; x++) {
        const a = r + (x - 1) * 4, b = r + (x + 1) * 4;
        col[x] += Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);
      }
    }
    for (let y = 1; y < h - 1; y++) {
      const ra = (y - 1) * w * 4, rb = (y + 1) * w * 4;
      for (let x = x0; x < x1; x += sx) {
        const a = ra + x * 4, b = rb + x * 4;
        row[y] += Math.abs(d[a] - d[b]) + Math.abs(d[a + 1] - d[b + 1]) + Math.abs(d[a + 2] - d[b + 2]);
      }
    }
    return { col: smooth(col, 1), row: smooth(row, 1) };
  }

  /** Lokale Maxima in [from, to), stärkste zuerst, mit Mindestabstand. */
  function findPeaks(p, from, to, minSep, maxCount) {
    const cand = [];
    for (let i = Math.max(1, from); i < Math.min(p.length - 1, to); i++) {
      if (p[i] > 0 && p[i] >= p[i - 1] && p[i] >= p[i + 1]) cand.push(i);
    }
    cand.sort((a, b) => p[b] - p[a]);
    const picked = [];
    for (const i of cand) {
      if (picked.every(j => Math.abs(j - i) >= minSep)) picked.push(i);
      if (picked.length >= maxCount) break;
    }
    const max = picked.length ? p[picked[0]] : 1;
    return picked.map(i => ({ pos: i, s: p[i] / max }));
  }

  /** Wie gleichmäßig ist ein schmaler Streifen direkt innerhalb einer Kante? (0..1) */
  function stripUniformity(img, side, pos) {
    const { width: w, height: h } = img;
    const vertical = side === 'left' || side === 'right';
    const dim = vertical ? w : h;
    const dir = side === 'left' || side === 'top' ? 1 : -1;
    const d0 = Math.max(2, dim * 0.003), d1 = Math.max(d0 + 2, dim * 0.01);
    const alongLen = vertical ? h : w;
    const samples = [];
    for (let k = 0; k < 40; k++) {
      const s = alongLen * (0.3 + 0.4 * (k / 39));
      for (let t = d0; t <= d1; t += Math.max(1, (d1 - d0) / 5)) {
        const p = pos + dir * t;
        samples.push(vertical ? getRGB(img, p, s) : getRGB(img, s, p));
      }
    }
    let sd = 0;
    for (let c = 0; c < 3; c++) {
      const m = samples.reduce((a, p) => a + p[c], 0) / samples.length;
      sd += Math.sqrt(samples.reduce((a, p) => a + (p[c] - m) ** 2, 0) / samples.length);
    }
    sd /= 3;
    return clamp(1 - sd / 35, 0, 1);
  }

  // ---------- Außenkante ----------

  function detectOuter(img) {
    const { width: w, height: h } = img;
    const { col, row } = edgeProfiles(img, 0.3, 0.7);
    const sepX = Math.max(3, Math.round(w * 0.01)), sepY = Math.max(3, Math.round(h * 0.01));
    // Bildrand als Kandidat nur, wenn das Bild selbst etwa das Kartenformat hat
    // (also eng auf die Karte zugeschnitten ist). Sonst gewinnt ein gleichmäßiger
    // Hintergrund am Bildrand fälschlich.
    const tightCrop = Math.abs(Math.log(w / h / CARD_RATIO)) < 0.035;
    const withBoundary = (peaks, pos) => (tightCrop ? peaks.concat([{ pos, s: 0.25, boundary: true }]) : peaks);

    const cand = {
      left: withBoundary(findPeaks(col, 1, Math.floor(w * 0.45), sepX, 6), -0.5),
      right: withBoundary(findPeaks(col, Math.ceil(w * 0.55), w - 1, sepX, 6), w - 0.5),
      top: withBoundary(findPeaks(row, 1, Math.floor(h * 0.45), sepY, 6), -0.5),
      bottom: withBoundary(findPeaks(row, Math.ceil(h * 0.55), h - 1, sepY, 6), h - 0.5),
    };
    for (const side of Object.keys(cand)) {
      const prof = side === 'left' || side === 'right' ? col : row;
      for (const c of cand[side]) {
        if (!c.boundary) c.pos = subpixel(prof, c.pos);
        c.u = stripUniformity(img, side, c.pos);
      }
    }

    if (api_debug.on) api_debug.cand = cand;
    let best = null;
    for (const L of cand.left) for (const R of cand.right) {
      const cw = R.pos - L.pos;
      if (cw < w * 0.2) continue;
      for (const T of cand.top) for (const B of cand.bottom) {
        const ch = B.pos - T.pos;
        if (ch < h * 0.2) continue;
        const err = Math.abs(Math.log(cw / ch / CARD_RATIO));
        const score =
          L.s + R.s + T.s + B.s +
          2.0 * (L.u + R.u + T.u + B.u) -
          14 * err +
          0.4 * (cw * ch) / (w * h);
        if (!best || score > best.score) {
          best = { score, err, left: L.pos, right: R.pos, top: T.pos, bottom: B.pos };
        }
      }
    }
    if (!best) {
      best = { score: 0, err: 1, left: -0.5, right: w - 0.5, top: -0.5, bottom: h - 0.5 };
    }
    return best;
  }

  // ---------- Schieflage ----------

  function fitLine(pts) {
    // x = a + b*t   (pts: [t, x])
    const fit = (ps) => {
      const n = ps.length;
      let st = 0, sx = 0, stt = 0, stx = 0;
      for (const [t, x] of ps) { st += t; sx += x; stt += t * t; stx += t * x; }
      const den = n * stt - st * st;
      if (Math.abs(den) < 1e-9) return null;
      const b = (n * stx - st * sx) / den;
      return { a: (sx - b * st) / n, b };
    };
    let f = fit(pts);
    if (!f) return null;
    const res = pts.map(([t, x]) => Math.abs(x - (f.a + f.b * t)));
    const thr = Math.max(1.5, median(res) * 2.5);
    const kept = pts.filter((p, i) => res[i] <= thr);
    if (kept.length < pts.length * 0.4 || kept.length < 8) return null;
    return fit(kept);
  }

  /**
   * Kantenpunkte einer Außenkante: auf 60 Scanlinien die erste starke Kante
   * von außen nach innen (nicht den Innenrahmen). Gibt [[t, pos], …] zurück,
   * t = Position entlang der Kante, pos = Kantenlage quer dazu.
   */
  function outerEdgePoints(img, outer, side) {
    const { width: w, height: h } = img;
    const cw = outer.right - outer.left, ch = outer.bottom - outer.top;
    const vertical = side === 'left' || side === 'right';
    const pos = outer[side];
    const lim = vertical ? w - 1 : h - 1;
    // Kante am Bildrand (Bild exakt zugeschnitten) liefert keine Punkte
    if (pos <= 1 || pos >= lim - 1) return null;
    const grad = (x, y) => (vertical
      ? dist(getRGB(img, x - 1, y), getRGB(img, x + 1, y))
      : dist(getRGB(img, x, y - 1), getRGB(img, x, y + 1)));
    const along0 = vertical ? outer.top + ch * 0.12 : outer.left + cw * 0.12;
    const along1 = vertical ? outer.bottom - ch * 0.12 : outer.right - cw * 0.12;
    const win = Math.max(4, Math.round((vertical ? w : h) * 0.025));
    const outward = side === 'left' || side === 'top' ? -1 : 1;
    const center = Math.round(pos);
    const pts = [];
    const n = 60;
    for (let i = 0; i < n; i++) {
      const t = along0 + (along1 - along0) * (i / (n - 1));
      const gs = [];
      for (let k = win; k >= -win; k--) {
        const p = center + outward * k;
        if (p < 1 || p > lim - 1) continue;
        gs.push([p, vertical ? grad(p, t) : grad(t, p)]);
      }
      if (!gs.length) continue;
      const gmax = Math.max.apply(null, gs.map(g => g[1]));
      if (gmax <= 25) continue;
      let j = gs.findIndex(g => g[1] >= 0.6 * gmax);
      while (j + 1 < gs.length && gs[j + 1][1] > gs[j][1]) j++;
      pts.push([t, gs[j][0]]);
    }
    return pts.length >= 10 ? pts : null;
  }

  /** Neigung in Grad (Konvention wie rotateImage) aus der Steigung einer Kante. */
  function slopeToDeg(slope, vertical) {
    const deg = (Math.atan(slope) * 180) / Math.PI;
    return vertical ? -deg : deg;
  }

  function estimateSkew(img, outer) {
    const est = [];
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const pts = outerEdgePoints(img, outer, side);
      const f = pts ? fitLine(pts) : null;
      if (f) est.push(slopeToDeg(f.b, side === 'left' || side === 'right'));
    }
    if (!est.length) return 0;
    return median(est);
  }

  /**
   * Grobe Schieflage über das ganze Bild (Projektionsprofil): Für jeden
   * Testwinkel werden Kantenpixel auf die gedrehte x- bzw. y-Achse projiziert.
   * Beim richtigen Winkel fallen die Kartenkanten jeweils in wenige Bins,
   * das Histogramm wird „spitz“.
   */
  function globalSkew(img, maxDeg) {
    maxDeg = maxDeg || 12;
    const { width: W, height: H } = img;
    const k = Math.max(1, Math.round(Math.max(W, H) / 500));
    const w = Math.floor(W / k), h = Math.floor(H / k);
    // verkleinerte Graustufen-/Farbsumme
    const v = new Float32Array(w * h * 3);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const p = getRGB(img, x * k + (k >> 1), y * k + (k >> 1));
      const o = (y * w + x) * 3;
      v[o] = p[0]; v[o + 1] = p[1]; v[o + 2] = p[2];
    }
    const vx = [], vy = [];
    const pts = [];
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let gx = 0, gy = 0;
      for (let c = 0; c < 3; c++) {
        gx += Math.abs(v[(y * w + x + 1) * 3 + c] - v[(y * w + x - 1) * 3 + c]);
        gy += Math.abs(v[((y + 1) * w + x) * 3 + c] - v[((y - 1) * w + x) * 3 + c]);
      }
      if (gx > 60 && gx > 2 * gy) pts.push([x, y, gx, 0]);
      else if (gy > 60 && gy > 2 * gx) pts.push([x, y, gy, 1]);
    }
    if (pts.length < 50) return 0;
    const diag = Math.ceil(Math.hypot(w, h)) + 2;
    const score = (deg) => {
      const a = (deg * Math.PI) / 180, cs = Math.cos(a), sn = Math.sin(a);
      const hx = new Float64Array(diag * 2), hy = new Float64Array(diag * 2);
      for (const [x, y, g, t] of pts) {
        if (t === 0) hx[Math.round(x * cs + y * sn) + diag] += g;
        else hy[Math.round(-x * sn + y * cs) + diag] += g;
      }
      let s = 0;
      for (let i = 0; i < hx.length; i++) s += hx[i] * hx[i] + hy[i] * hy[i];
      return s;
    };
    let best = 0, bestS = -1;
    for (let d = -maxDeg; d <= maxDeg + 1e-9; d += 0.25) {
      const s = score(d);
      if (s > bestS) { bestS = s; best = d; }
    }
    const coarse = best;
    for (let d = coarse - 0.25; d <= coarse + 0.25 + 1e-9; d += 0.05) {
      const s = score(d);
      if (s > bestS) { bestS = s; best = d; }
    }
    return best;
  }

  // ---------- Innenrahmen ----------

  function detectBorders(img, outer) {
    const cw = outer.right - outer.left, ch = outer.bottom - outer.top;
    const result = {};
    const sides = ['left', 'right', 'top', 'bottom'];
    for (const side of sides) {
      const vertical = side === 'left' || side === 'right';
      const dim = vertical ? cw : ch;
      const edge = outer[side];
      const dir = side === 'left' || side === 'top' ? 1 : -1;
      const a0 = vertical ? outer.top + ch * 0.2 : outer.left + cw * 0.2;
      const a1 = vertical ? outer.bottom - ch * 0.2 : outer.right - cw * 0.2;
      const at = (depth, s) => (vertical ? getRGB(img, edge + dir * depth, s) : getRGB(img, s, edge + dir * depth));

      const nLines = 120;
      const lines = [];
      for (let k = 0; k < nLines; k++) lines.push(a0 + (a1 - a0) * (k / (nLines - 1)));

      // Randfarbe direkt innerhalb der Außenkante
      const sStart = Math.max(2, dim * 0.004), sEnd = Math.max(sStart + 2, dim * 0.011);
      const ref = [];
      for (const s of lines) for (let t = sStart; t <= sEnd; t += Math.max(1, (sEnd - sStart) / 4)) ref.push(at(t, s));
      const borderColor = [0, 1, 2].map(c => median(ref.map(p => p[c])));
      const noise = median(ref.map(p => dist(p, borderColor)));
      const thr = Math.max(28, noise * 5);

      const minDepth = Math.max(3, Math.round(dim * 0.006));
      const maxDepth = Math.round(dim * 0.16);
      const hits = [], hitPts = [];
      for (const s of lines) {
        let run = 0;
        for (let t = minDepth; t <= maxDepth; t++) {
          if (dist(at(t, s), borderColor) > thr) {
            run++;
            if (run >= 2) { hits.push(t - 1); hitPts.push([s, edge + dir * (t - 1)]); break; }
          } else run = 0;
        }
      }

      let depth, method;
      if (hits.length >= nLines * 0.3) {
        depth = median(hits);
        method = 'color';
      } else {
        // Fallback: stärkster Gradient innerhalb des erwarteten Bereichs
        let bestT = -1, bestG = -1;
        for (let t = Math.max(minDepth, Math.round(dim * 0.015)); t <= maxDepth; t++) {
          let g = 0;
          for (const s of lines) g += dist(at(t - 1, s), at(t + 1, s));
          if (g > bestG) { bestG = g; bestT = t; }
        }
        depth = bestT;
        method = 'gradient';
      }
      // Feinjustierung: Gradientenmaximum in absoluten Bildkoordinaten (Subpixel)
      // Übergang zwischen Pixel q und q+dir, gesucht kurz vor dem ersten abweichenden Pixel
      const approx = Math.round(edge + dir * depth);
      const pix = (q, s) => (vertical ? getRGB(img, q, s) : getRGB(img, s, q));
      const ks = [-4, -3, -2, -1, 0, 1], prof = [];
      for (const k of ks) {
        const q = approx + dir * k;
        let g = 0;
        for (const s of lines) g += dist(pix(q, s), pix(q + dir, s));
        prof.push(g);
      }
      let bi = 0;
      for (let i = 1; i < prof.length; i++) if (prof[i] > prof[bi]) bi = i;
      const boundary = approx + dir * (ks[0] + subpixel(prof, bi) + 0.5);
      const width = Math.abs(boundary - edge);
      // Neigung des Innenrahmens an dieser Seite (Steigung der Übergangspunkte)
      const f = method === 'color' ? fitLine(hitPts) : null;
      result[side] = { width, method, agreement: hits.length / nLines, slope: f ? f.b : 0 };
    }
    return result;
  }

  // ---------- öffentliche API ----------

  /**
   * Zwei Punkte je Kante (bei 20 % und 80 % der Kantenlänge), für Außenkante
   * und Innenrahmen. So bleibt erhalten, wenn eine Kante schief verläuft.
   * Punkte stehen in Pixelindex-Koordinaten, sortiert nach t (oben→unten bzw. links→rechts).
   */
  function edgeLines(img, outer, borders) {
    const cw = outer.right - outer.left, ch = outer.bottom - outer.top;
    const lines = { outer: {}, inner: {} };
    for (const side of ['left', 'right', 'top', 'bottom']) {
      const vertical = side === 'left' || side === 'right';
      const dir = side === 'left' || side === 'top' ? 1 : -1;
      const a0 = vertical ? outer.top : outer.left;
      const len = vertical ? ch : cw;
      const mid = a0 + len / 2;
      const st = [a0 + len * 0.2, a0 + len * 0.8];
      const pts = outerEdgePoints(img, outer, side);
      const fo = pts ? fitLine(pts) : null;
      const slopeO = fo && Math.abs(fo.b) < 0.1 ? fo.b : 0;
      const slopeI = Math.abs(borders[side].slope) < 0.1 ? borders[side].slope : 0;
      const posO = outer[side], posI = outer[side] + dir * borders[side].width;
      const mk = (pos, slope) => st.map(t => {
        const q = pos + slope * (t - mid);
        return vertical ? { x: q, y: t } : { x: t, y: q };
      });
      lines.outer[side] = mk(posO, slopeO);
      lines.inner[side] = mk(posI, slopeI);
    }
    return lines;
  }

  /** Misst ein (bereits gerade ausgerichtetes) Bild. */
  function measure(img) {
    const outer = detectOuter(img);
    const borders = detectBorders(img, outer);
    return {
      outer: { left: outer.left, right: outer.right, top: outer.top, bottom: outer.bottom },
      inner: {
        left: outer.left + borders.left.width,
        right: outer.right - borders.right.width,
        top: outer.top + borders.top.width,
        bottom: outer.bottom - borders.bottom.width,
      },
      lines: edgeLines(img, outer, borders),
      borders,
      aspectError: outer.err,
    };
  }

  /**
   * Vollständige Analyse: misst, schätzt Schieflage, dreht bei Bedarf und misst neu.
   * Gibt das (ggf. gedrehte) Bild mit zurück, auf das sich die Koordinaten beziehen.
   */
  function analyze(img, opts) {
    const o = Object.assign({ autoDeskew: true }, opts);
    let work = img, rotation = 0;
    if (o.autoDeskew) {
      const g = globalSkew(img);
      if (Math.abs(g) > 0.1) {
        rotation = -g;
        work = rotateImage(img, rotation);
      }
    }
    let m = measure(work);
    if (o.autoDeskew) {
      // Bei starker Neigung ist die erste Kantenschätzung ungenau, daher iterieren
      for (let it = 0; it < 3; it++) {
        const skew = estimateSkew(work, m.outer);
        if (!(Math.abs(skew) > 0.1) || Math.abs(rotation - skew) > 15) break;
        rotation -= skew;
        work = rotateImage(img, rotation);
        m = measure(work);
      }
    }
    m.rotation = rotation;
    m.image = work;
    m.confidence = confidence(m);
    return m;
  }

  function confidence(m) {
    const ag = ['left', 'right', 'top', 'bottom'].map(s => m.borders[s].agreement);
    const minAg = Math.min.apply(null, ag);
    const aspectOk = clamp(1 - m.aspectError / 0.08, 0, 1);
    return clamp(0.6 * minAg + 0.4 * aspectOk, 0, 1);
  }

  return { api_debug, analyze, measure, rotateImage, estimateSkew, globalSkew, detectOuter, detectBorders, slopeToDeg, CARD_RATIO };
});
