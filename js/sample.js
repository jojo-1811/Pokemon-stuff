/*
 * sample.js — zeichnet eine generische Beispielkarte (kein echtes Kartendesign),
 * damit das Tool beim ersten Öffnen etwas zum Ausprobieren zeigt.
 * Rand: links 33, rechts 24, oben 30, unten 33 px bei 640 px Kartenbreite,
 * leicht gedreht fotografiert; der Druck sitzt zusätzlich 0,4° schief.
 */
(function (root) {
  'use strict';

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  }

  function makeSampleCard() {
    const W = 1000, H = 1300;
    const c = document.createElement('canvas');
    c.width = W; c.height = H;
    const ctx = c.getContext('2d');

    // Tischplatte
    const g = ctx.createLinearGradient(0, 0, W, H);
    g.addColorStop(0, '#3d4652'); g.addColorStop(1, '#2a313a');
    ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);

    const cw = 640, ch = Math.round(640 * 88 / 63);
    const b = { l: 33, r: 24, t: 30, bt: 33 };
    ctx.save();
    ctx.translate(W / 2, H / 2 + 10);
    ctx.rotate((1.4 * Math.PI) / 180);
    ctx.translate(-cw / 2, -ch / 2);

    // Schatten
    ctx.save();
    ctx.shadowColor = 'rgba(0,0,0,0.35)'; ctx.shadowBlur = 18; ctx.shadowOffsetY = 6;
    roundRect(ctx, 0, 0, cw, ch, 26);
    ctx.fillStyle = '#efc93a'; ctx.fill();
    ctx.restore();

    // Kartenfläche innerhalb des gelben Rands, leicht schief gedruckt (0,4°)
    const ix = b.l, iy = b.t, iw = cw - b.l - b.r, ih = ch - b.t - b.bt;
    ctx.save();
    roundRect(ctx, 0, 0, cw, ch, 26);
    ctx.clip();
    ctx.translate(ix + iw / 2, iy + ih / 2);
    ctx.rotate((0.4 * Math.PI) / 180);
    ctx.translate(-(ix + iw / 2), -(iy + ih / 2));
    ctx.fillStyle = '#9fa6ad'; ctx.fillRect(ix, iy, iw, ih); // silberner Rahmen
    const face = ctx.createLinearGradient(0, iy, 0, iy + ih);
    face.addColorStop(0, '#d7e7c4'); face.addColorStop(1, '#b9d39f');
    ctx.fillStyle = face; ctx.fillRect(ix + 4, iy + 4, iw - 8, ih - 8);

    // Namenszeile
    ctx.fillStyle = '#1d2a18';
    ctx.font = '700 30px system-ui, sans-serif';
    ctx.fillText('Beispielkarte', ix + 22, iy + 46);
    ctx.font = '700 26px system-ui, sans-serif';
    ctx.textAlign = 'right'; ctx.fillText('KP 90', ix + iw - 22, iy + 46); ctx.textAlign = 'left';

    // Bildfenster
    const ax = ix + 22, ay = iy + 66, aw = iw - 44, ah = Math.round(ih * 0.42);
    ctx.fillStyle = '#c9a43a'; ctx.fillRect(ax - 4, ay - 4, aw + 8, ah + 8);
    const sky = ctx.createLinearGradient(0, ay, 0, ay + ah);
    sky.addColorStop(0, '#f6b46b'); sky.addColorStop(1, '#f4e3b5');
    ctx.fillStyle = sky; ctx.fillRect(ax, ay, aw, ah);
    ctx.fillStyle = '#fff3c4'; ctx.beginPath(); ctx.arc(ax + aw * 0.7, ay + ah * 0.38, 46, 0, Math.PI * 2); ctx.fill();
    ctx.fillStyle = '#5f7a4a';
    ctx.beginPath(); ctx.moveTo(ax, ay + ah); ctx.lineTo(ax + aw * 0.28, ay + ah * 0.45); ctx.lineTo(ax + aw * 0.5, ay + ah * 0.75);
    ctx.lineTo(ax + aw * 0.72, ay + ah * 0.5); ctx.lineTo(ax + aw, ay + ah * 0.85); ctx.lineTo(ax + aw, ay + ah); ctx.fill();

    // Textzeilen
    ctx.fillStyle = 'rgba(29,42,24,0.55)';
    const ty = ay + ah + 40;
    [0.9, 0.75, 0.82, 0.6].forEach((f, i) => ctx.fillRect(ax + 6, ty + i * 52, (aw - 12) * f, 14));
    ctx.fillRect(ax + 6, iy + ih - 50, aw * 0.35, 10);
    ctx.restore();
    ctx.restore();

    // leichtes Bildrauschen wie bei einem Handyfoto
    const img = ctx.getImageData(0, 0, W, H), d = img.data;
    let s = 12345;
    for (let i = 0; i < d.length; i += 4) {
      s = (s * 1664525 + 1013904223) >>> 0;
      const n = ((s >>> 24) - 128) / 32;
      d[i] += n; d[i + 1] += n; d[i + 2] += n;
    }
    ctx.putImageData(img, 0, 0);
    return c;
  }

  root.CenteringSample = { makeSampleCard };
})(typeof self !== 'undefined' ? self : this);
