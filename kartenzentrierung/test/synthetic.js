// Erzeugt synthetische Kartenbilder mit bekannten Randbreiten für Tests.
'use strict';

function rng(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

/**
 * opts:
 *  W, H          Bildgröße
 *  card          { x, y, w } Position/Breite der Karte (Höhe = w * 88/63)
 *  border        { left, right, top, bottom } Randbreite in px
 *  bg, edge      RGB-Farben für Hintergrund und Kartenrand
 *  noise         Rauschstärke
 *  frameTilt     Drehung des Innenrahmens gegenüber der Karte in Grad (schiefer Druck)
 */
function makeCard(opts) {
  const o = Object.assign(
    {
      W: 900, H: 1200, seed: 1, noise: 6,
      bg: [228, 230, 233], edge: [242, 206, 58],
      card: null, border: { left: 30, right: 30, top: 30, bottom: 30 },
    },
    Object.fromEntries(Object.entries(opts || {}).filter(([, v]) => v !== undefined))
  );
  const rand = rng(o.seed);
  const { W, H } = o;
  const card = o.card || { x: 80, y: 60, w: 640 };
  const ch = Math.round(card.w * 88 / 63);
  const data = new Uint8ClampedArray(W * H * 4);
  const r = card.w * 0.045; // Eckradius
  const b = o.border;
  const ix0 = card.x + b.left, ix1 = card.x + card.w - b.right;
  const iy0 = card.y + b.top, iy1 = card.y + ch - b.bottom;
  const tilt = ((o.frameTilt || 0) * Math.PI) / 180, tc = Math.cos(tilt), ts = Math.sin(tilt);
  const icx = (ix0 + ix1) / 2, icy = (iy0 + iy1) / 2;

  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      let c;
      const inCardRect = x >= card.x && x < card.x + card.w && y >= card.y && y < card.y + ch;
      let inCard = inCardRect;
      if (inCardRect) {
        // abgerundete Ecken
        const cx = x < card.x + r ? card.x + r : x > card.x + card.w - r ? card.x + card.w - r : x;
        const cy = y < card.y + r ? card.y + r : y > card.y + ch - r ? card.y + ch - r : y;
        if ((x - cx) ** 2 + (y - cy) ** 2 > r * r) inCard = false;
      }
      // Punkt in das (ggf. gedrehte) Koordinatensystem des Innenrahmens zurückdrehen
      const dx = x + 0.5 - icx, dy = y + 0.5 - icy;
      const fx = dx * tc + dy * ts + icx - 0.5, fy = -dx * ts + dy * tc + icy - 0.5;
      if (!inCard) c = o.bg;
      else if (fx < ix0 || fx >= ix1 || fy < iy0 || fy >= iy1) c = o.edge;
      else if (fx < ix0 + 3 || fx >= ix1 - 3 || fy < iy0 + 3 || fy >= iy1 - 3) c = [150, 120, 40]; // Rahmenlinie
      else {
        // „Artwork“: Verlauf + Blöcke
        const u = (x - ix0) / (ix1 - ix0), v = (y - iy0) / (iy1 - iy0);
        const blk = ((Math.floor(u * 7) + Math.floor(v * 9)) % 3) * 30;
        c = [60 + 120 * u + blk, 90 + 60 * v, 160 - 80 * u + blk];
      }
      const i = (y * W + x) * 4;
      for (let k = 0; k < 3; k++) data[i + k] = c[k] + (rand() - 0.5) * 2 * o.noise;
      data[i + 3] = 255;
    }
  }
  return { width: W, height: H, data };
}

module.exports = { makeCard };
