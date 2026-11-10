/*
 * app.js — Oberfläche: Upload, Anzeige, verschiebbare Messlinien, Ergebnis.
 *
 * Koordinaten: Alle Punkte werden in Pixeln des Arbeitsbilds gespeichert
 * (Canvas-Koordinaten, Pixel i reicht von i bis i+1). detect.js liefert
 * Pixelindex-Koordinaten, daher wird beim Übernehmen 0,5 addiert.
 *
 * Jede der acht Kanten (Außenkante und Innenrahmen, je vier Seiten) ist eine
 * Gerade durch zwei verschiebbare Punkte; siehe geometry.js.
 */
(function () {
  'use strict';
  const D = window.CenteringDetect;
  const G = window.CenteringGrading;
  const Geo = window.CenteringGeometry;
  const MAX_SIDE = 1600;      // Arbeitsbild wird auf diese Kantenlänge verkleinert
  const CARD_MM = { w: 63, h: 88 };
  const HIT_PX = 16;          // Fangradius für Linien (CSS-Pixel)
  const HIT_PT_PX = 18;       // Fangradius für Punkte (CSS-Pixel)
  const SIDES = ['left', 'right', 'top', 'bottom'];
  const RINGS = ['outer', 'inner'];

  const $ = id => document.getElementById(id);
  const el = {
    stage: $('stage'), view: $('view'), loupe: $('loupe'), badge: $('badge'), empty: $('empty'), busy: $('busy'),
    file: $('file'), auto: $('autoBtn'), rot: $('rotation'), rotOut: $('rotationOut'),
    sideTitle: $('sideTitle'), conf: $('conf'),
    lrValue: $('lrValue'), tbValue: $('tbValue'), lrMark: $('lrMark'), tbMark: $('tbMark'), lrMm: $('lrMm'), tbMm: $('tbMm'),
    lrEnds: $('lrEnds'), tbEnds: $('tbEnds'), tiltChip: $('tiltChip'), skewSvg: $('skewSvg'),
    taperBody: document.querySelector('#taper tbody'),
    lrWhere: $('lrWhere'), tbWhere: $('tbWhere'),
    lrName: $('lrName'), tbName: $('tbName'), lrEndA: $('lrEndA'), lrEndB: $('lrEndB'), tbEndA: $('tbEndA'), tbEndB: $('tbEndB'),
    typeNote: $('typeNote'),
    gradesBody: document.querySelector('#grades tbody'),
  };

  const state = {
    side: 'front',
    sides: { front: null, back: null },
    // Auswahl: { ring, edge, idx } für einen Punkt, idx = null für die ganze Linie
    selected: null,
    drag: null,
    view: { scale: 1, dpr: 1 },
    mode: 'mean',     // Wertung: 'mean' = Mittelwert, 'worst' = schlechteste Messstelle
    cardType: 'standard', // 'standard' oder 'ereader' (Ränder über Eck vergleichen)
  };
  try { if (localStorage.getItem('centering-type') === 'ereader') state.cardType = 'ereader'; } catch (e) { /* ohne Speicher */ }

  // e-Reader-Vergleich gilt nur für die Vorderseite; die Rückseite ist eine normale Kartenrückseite
  const pairingFor = side => (state.cardType === 'ereader' && side === 'front' ? 'ereader' : 'standard');

  const SIDE_NAME = { left: 'links', right: 'rechts', top: 'oben', bottom: 'unten' };
  const EDGE_NAME = { left: 'linker Rand', right: 'rechter Rand', top: 'oberer Rand', bottom: 'unterer Rand' };
  const cap = t => t.charAt(0).toUpperCase() + t.slice(1);
  /** Name einer Messstelle: auf senkrechten Rändern oben/unten, auf waagrechten links/rechts. */
  const opp = (a, b) => Geo.isVertical(a) === Geo.isVertical(b);
  const stationName = (side, i) => (Geo.isVertical(side) ? (i ? 'unten' : 'oben') : (i ? 'rechts' : 'links'));
  try { if (localStorage.getItem('centering-mode') === 'worst') state.mode = 'worst'; } catch (e) { /* ohne Speicher */ }

  // ---------- Hilfen ----------

  const num = (v, d = 1) => v.toFixed(d).replace('.', ',');
  const cssVar = name => getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  const cur = () => state.sides[state.side];

  /** Messung der Seite (null, wenn keine gültigen Linien). */
  function measureOf(s) {
    if (!s || !s.lines) return null;
    const m = Geo.measure(s.lines);
    return m.valid ? m : null;
  }
  const clonePt = p => ({ x: p.x, y: p.y });

  // ---------- Laden ----------

  function toWorkCanvas(source, sw, sh) {
    const k = Math.min(1, MAX_SIDE / Math.max(sw, sh));
    const c = document.createElement('canvas');
    c.width = Math.round(sw * k); c.height = Math.round(sh * k);
    const ctx = c.getContext('2d');
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(source, 0, 0, c.width, c.height);
    return c;
  }

  async function loadFile(file) {
    if (!file || !file.type.startsWith('image/')) {
      setStatusChip('bad', 'Keine Bilddatei');
      return;
    }
    let bmp;
    try {
      bmp = await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch (e) {
      bmp = await new Promise((res, rej) => {
        const im = new Image();
        im.onload = () => res(im);
        im.onerror = rej;
        im.src = URL.createObjectURL(file);
      });
    }
    const src = toWorkCanvas(bmp, bmp.width, bmp.height);
    setSide(state.side, { src, sample: false });
    refresh();
  }

  function setSide(side, { src, sample }) {
    state.sides[side] = { src, sample, rotation: 0, work: null, lines: null, confidence: null };
    state.selected = null;
    renderWork(state.sides[side]);
    runDetection(side);
  }

  // ---------- Erkennung ----------

  function runDetection(side) {
    const s = state.sides[side];
    if (!s) return;
    el.busy.hidden = side !== state.side;
    // Ein Frame Pause, damit der Hinweis sichtbar wird
    setTimeout(() => {
      const ctx = s.src.getContext('2d', { willReadFrequently: true });
      const data = ctx.getImageData(0, 0, s.src.width, s.src.height);
      let res;
      try {
        res = D.analyze(data);
      } catch (e) {
        console.error(e);
        res = null;
      }
      if (res) {
        const shift = ring => {
          const o = {};
          for (const side of SIDES) o[side] = ring[side].map(p => ({ x: p.x + 0.5, y: p.y + 0.5 }));
          return o;
        };
        s.rotation = res.rotation;
        s.lines = { outer: shift(res.lines.outer), inner: shift(res.lines.inner) };
        s.confidence = res.confidence;
      } else {
        defaultLines(s);
      }
      renderWork(s);
      el.busy.hidden = true;
      if (side === state.side) refresh();
      else updateDots();
    }, 30);
  }

  function defaultLines(s) {
    const w = s.src.width, h = s.src.height;
    const o = { left: w * 0.1, right: w * 0.9, top: h * 0.1, bottom: h * 0.9 };
    const bw = (o.right - o.left) * 0.045;
    s.lines = Geo.fromRects(o, { left: o.left + bw, right: o.right - bw, top: o.top + bw, bottom: o.bottom - bw });
    s.confidence = 0;
  }

  /** Arbeitsbild = Original, um s.rotation gedreht (gleiche Größe, Drehung um Bildmitte). */
  function renderWork(s) {
    const w = s.src.width, h = s.src.height;
    if (!s.work) { s.work = document.createElement('canvas'); s.work.width = w; s.work.height = h; }
    const ctx = s.work.getContext('2d');
    // Unter das gedrehte Bild das Original legen, damit keine schwarzen Ecken entstehen
    ctx.drawImage(s.src, 0, 0);
    ctx.save();
    ctx.translate(w / 2, h / 2);
    ctx.rotate((s.rotation * Math.PI) / 180);
    ctx.drawImage(s.src, -w / 2, -h / 2);
    ctx.restore();
  }

  // ---------- Zeichnen ----------

  function layoutView() {
    const s = cur();
    if (!s) return;
    const maxW = el.stage.clientWidth;
    const maxH = Math.max(320, window.innerHeight * 0.72);
    const scale = Math.min(maxW / s.work.width, maxH / s.work.height);
    const dpr = window.devicePixelRatio || 1;
    const cssW = Math.round(s.work.width * scale), cssH = Math.round(s.work.height * scale);
    el.view.style.width = cssW + 'px';
    el.view.style.height = cssH + 'px';
    el.view.width = Math.round(cssW * dpr);
    el.view.height = Math.round(cssH * dpr);
    state.view = { scale, dpr };
  }

  /** Viereck eines Rahmens aus den Schnittpunkten seiner Kanten. */
  function quad(ring) {
    const c = Geo.corners(ring);
    return c.tl && c.tr && c.br && c.bl ? [c.tl, c.tr, c.br, c.bl] : null;
  }

  function isSel(ring, edge, idx) {
    const t = state.selected;
    return !!t && t.ring === ring && t.edge === edge && (idx === undefined || t.idx === idx);
  }

  function drawOverlay(ctx, s, k, lineW) {
    const colOuter = cssVar('--outer'), colInner = cssVar('--inner');
    const qo = quad(s.lines.outer), qi = quad(s.lines.inner);

    // Randfläche leicht einfärben
    if (qo && qi) {
      ctx.save();
      ctx.globalAlpha = 0.18;
      ctx.fillStyle = colInner;
      ctx.beginPath();
      for (const q of [qo, qi]) {
        q.forEach((p, n) => (n ? ctx.lineTo(p.x * k, p.y * k) : ctx.moveTo(p.x * k, p.y * k)));
        ctx.closePath();
      }
      ctx.fill('evenodd');
      ctx.restore();
    }

    for (const ring of RINGS) {
      for (const edge of SIDES) {
        const seg = Geo.edgeSegment(s.lines[ring], edge);
        if (!seg[0] || !seg[1]) continue;
        const sel = isSel(ring, edge);
        ctx.strokeStyle = ring === 'outer' ? colOuter : colInner;
        ctx.lineWidth = sel ? lineW * 2.2 : lineW;
        ctx.beginPath();
        ctx.moveTo(seg[0].x * k, seg[0].y * k);
        ctx.lineTo(seg[1].x * k, seg[1].y * k);
        ctx.stroke();
        if (sel) {
          // Verlängerung über das ganze Bild: zeigt, wie die Kante weiterläuft
          const [a, b] = s.lines[ring][edge];
          const dx = b.x - a.x, dy = b.y - a.y, L = Math.hypot(dx, dy) || 1;
          const far = 4 * Math.max(ctx.canvas.width, ctx.canvas.height) / k;
          ctx.save();
          ctx.setLineDash([6 * lineW, 6 * lineW]);
          ctx.lineWidth = lineW * 0.8;
          ctx.globalAlpha = 0.7;
          ctx.beginPath();
          ctx.moveTo((a.x - dx / L * far) * k, (a.y - dy / L * far) * k);
          ctx.lineTo((a.x + dx / L * far) * k, (a.y + dy / L * far) * k);
          ctx.stroke();
          ctx.restore();
        }
      }
    }
  }

  function drawHandles(ctx, s, k, size) {
    for (const ring of RINGS) {
      ctx.fillStyle = cssVar(ring === 'outer' ? '--outer' : '--inner');
      for (const edge of SIDES) {
        s.lines[ring][edge].forEach((p, idx) => {
          const sel = isSel(ring, edge, idx);
          ctx.beginPath();
          ctx.arc(p.x * k, p.y * k, sel ? size * 1.5 : size, 0, Math.PI * 2);
          ctx.fill();
          ctx.lineWidth = size * 0.35; ctx.strokeStyle = '#fff'; ctx.stroke();
        });
      }
    }
  }

  function draw() {
    const s = cur();
    el.empty.hidden = !!s;
    el.view.hidden = !s;
    el.badge.hidden = !(s && s.sample);
    if (!s) return;
    layoutView();
    const { scale, dpr } = state.view;
    const ctx = el.view.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.imageSmoothingQuality = 'high';
    ctx.drawImage(s.work, 0, 0, el.view.width, el.view.height);
    if (!s.lines) return;
    const k = scale * dpr;
    drawOverlay(ctx, s, k, 1.5 * dpr);
    drawHandles(ctx, s, k, 5 * dpr);
  }

  function drawLoupe(px, py) {
    const s = cur();
    const L = el.loupe, ctx = L.getContext('2d');
    const zoom = 6;
    const size = L.width;
    const half = size / zoom / 2;
    ctx.save();
    ctx.clearRect(0, 0, size, size);
    ctx.beginPath(); ctx.arc(size / 2, size / 2, size / 2, 0, Math.PI * 2); ctx.clip();
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(s.work, px - half, py - half, half * 2, half * 2, 0, 0, size, size);
    ctx.translate(-(px - half) * zoom, -(py - half) * zoom);
    drawOverlay(ctx, s, zoom, 2);
    drawHandles(ctx, s, zoom, 4);
    ctx.restore();
    // Fadenkreuz
    ctx.strokeStyle = 'rgba(255,255,255,0.8)'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(size / 2, size / 2 - 10); ctx.lineTo(size / 2, size / 2 + 10);
    ctx.moveTo(size / 2 - 10, size / 2); ctx.lineTo(size / 2 + 10, size / 2); ctx.stroke();
    // Lupe auf die gegenüberliegende Seite legen
    const right = px < s.work.width / 2;
    L.classList.toggle('r', right); L.classList.toggle('l', !right);
    L.hidden = false;
  }

  // ---------- Ergebnis ----------

  function setStatusChip(kind, text) {
    el.conf.className = 'chip' + (kind ? ' ' + kind : '');
    el.conf.textContent = text;
  }

  function updateDots() {
    for (const side of ['front', 'back']) {
      $('dot-' + side).classList.toggle('on', !!measureOf(state.sides[side]));
    }
  }

  function renderResult() {
    const s = cur();
    el.sideTitle.textContent = state.side === 'front' ? 'Vorderseite' : 'Rückseite';
    const m = measureOf(s);

    const pairing = pairingFor(state.side);
    const pairs = Geo.PAIRINGS[pairing];
    const axisEls = [
      { name: el.lrName, endA: el.lrEndA, endB: el.lrEndB, value: el.lrValue, mark: el.lrMark, mm: el.lrMm, ends: el.lrEnds, where: el.lrWhere },
      { name: el.tbName, endA: el.tbEndA, endB: el.tbEndB, value: el.tbValue, mark: el.tbMark, mm: el.tbMm, ends: el.tbEnds, where: el.tbWhere },
    ];
    pairs.forEach(([a, b], k) => {
      axisEls[k].name.textContent = `${cap(SIDE_NAME[a])} / ${cap(SIDE_NAME[b])}`;
      axisEls[k].endA.textContent = `${SIDE_NAME[a]} breiter`;
      axisEls[k].endB.textContent = `${SIDE_NAME[b]} breiter`;
    });
    el.typeNote.hidden = state.cardType !== 'ereader';
    el.typeNote.textContent = state.side === 'front'
      ? 'Vorderseite: oben wird mit rechts verglichen, links mit unten.'
      : 'Rückseite: normaler Vergleich, links mit rechts und oben mit unten.';

    if (!m) {
      for (const x of axisEls) {
        x.value.textContent = '–';
        x.mm.textContent = !s ? 'Kein Foto' : !s.lines ? 'Wird erkannt …' : 'Innenrahmen liegt außerhalb der Kartenkante';
        x.ends.textContent = x.where.textContent = '';
        x.mark.style.left = '50%';
      }
      setStatusChip('', s ? 'prüfen' : 'leer');
      renderSkew(null);
    } else {
      const ax = Geo.axes(m, pairing, state.mode);
      const mmX = CARD_MM.w / m.cardWidthPx, mmY = CARD_MM.h / m.cardHeightPx;
      const toMm = (side, px) => px * (Geo.isVertical(side) ? mmX : mmY);
      ax.forEach((x, k) => {
        const e = axisEls[k];
        e.value.textContent = G.fmt(x.ratio);
        e.mark.style.left = x.ratio.toFixed(2) + '%';
        e.mm.textContent = `Rand ${SIDE_NAME[x.a]} ${num(toMm(x.a, x.wa), 2)} mm · ${SIDE_NAME[x.b]} ${num(toMm(x.b, x.wb), 2)} mm`;
        if (opp(x.a, x.b)) {
          // gegenüberliegende Ränder: Verhältnis an beiden Enden
          const A = m.sides[x.a].at, B = m.sides[x.b].at;
          const at = i => G.fmt((A[i] / (A[i] + B[i])) * 100);
          e.ends.textContent = `${stationName(x.a, 0)} ${at(0)} · ${stationName(x.a, 1)} ${at(1)}`;
          e.where.textContent = x.where ? `schlechteste Stelle: ${stationName(x.a, x.where[0])}` : '';
        } else {
          // Ränder über Eck: Spanne über alle Messstellen
          e.ends.textContent = `je nach Messstelle ${G.fmt(x.range[0])} bis ${G.fmt(x.range[1])}`;
          e.where.textContent = x.where
            ? `schlechteste Stelle: ${EDGE_NAME[x.a]} ${stationName(x.a, x.where[0])}, ${EDGE_NAME[x.b]} ${stationName(x.b, x.where[1])}`
            : '';
        }
      });
      if (s.manual) setStatusChip('', 'manuell angepasst');
      else if (s.confidence >= 0.75) setStatusChip('good', 'Erkennung sicher');
      else if (s.confidence >= 0.45) setStatusChip('warn', 'Linien prüfen');
      else setStatusChip('bad', 'Linien von Hand setzen');
      renderSkew(m, mmX, mmY);
    }
    renderGrades();
    updateDots();
  }

  const TAPER_WARN = 0.15, TAPER_BAD = 0.35; // mm Unterschied zwischen den Messstellen
  const TILT_WARN = 0.15, TILT_BAD = 0.4;    // Grad

  function renderSkew(m, mmX, mmY) {
    if (!m) {
      el.tiltChip.className = 'chip';
      el.tiltChip.textContent = '–';
      el.taperBody.innerHTML = '';
      el.skewSvg.innerHTML = '';
      return;
    }
    const t = m.innerTilt, at = Math.abs(t);
    el.tiltChip.className = 'chip ' + (at < TILT_WARN ? 'good' : at < TILT_BAD ? 'warn' : 'bad');
    el.tiltChip.textContent = at < TILT_WARN
      ? 'Rahmen gerade'
      : `Rahmen ${num(at, 2)}° ${t > 0 ? '↻' : '↺'} gedreht`;
    el.tiltChip.title = `Innenrahmen ${t > 0 ? 'im' : 'gegen den'} Uhrzeigersinn zur Kartenkante gedreht`;

    const names = { left: ['links', 'oben', 'unten'], right: ['rechts', 'oben', 'unten'], top: ['oben', 'links', 'rechts'], bottom: ['unten', 'links', 'rechts'] };
    el.taperBody.innerHTML = SIDES.map(side => {
      const sd = m.sides[side];
      const f = Geo.isVertical(side) ? mmX : mmY;
      const d = sd.taper * f, ad = Math.abs(d);
      const cls = ad >= TAPER_BAD ? 'bad' : ad >= TAPER_WARN ? 'warn' : '';
      const [n, a, b] = names[side];
      return `<tr><td>${n}</td><td title="${a}">${num(sd.at[0] * f, 2)}</td><td title="${b}">${num(sd.at[1] * f, 2)}</td><td class="${cls}">${d >= 0 ? '+' : '−'}${num(ad, 2)}</td></tr>`;
    }).join('');

    // Schema: Karte 63 × 88, Innenrahmen mit 8-fach überhöhter Abweichung
    const s = cur();
    const oc = Geo.corners(s.lines.outer), ic = Geo.corners(s.lines.inner);
    const e1 = { x: oc.tr.x - oc.tl.x, y: oc.tr.y - oc.tl.y }, e2 = { x: oc.bl.x - oc.tl.x, y: oc.bl.y - oc.tl.y };
    const det = e1.x * e2.y - e1.y * e2.x;
    const toMm = p => {
      const dx = p.x - oc.tl.x, dy = p.y - oc.tl.y;
      return { u: ((dx * e2.y - dy * e2.x) / det) * CARD_MM.w, v: ((e1.x * dy - e1.y * dx) / det) * CARD_MM.h };
    };
    const b = Geo.meanBorders(m);
    const ideal = {
      tl: { u: b.left * mmX, v: b.top * mmY }, tr: { u: CARD_MM.w - b.right * mmX, v: b.top * mmY },
      br: { u: CARD_MM.w - b.right * mmX, v: CARD_MM.h - b.bottom * mmY }, bl: { u: b.left * mmX, v: CARD_MM.h - b.bottom * mmY },
    };
    const X = 8;
    const pts = ['tl', 'tr', 'br', 'bl'].map(k => {
      const a = toMm(ic[k]), i = ideal[k];
      return `${(i.u + (a.u - i.u) * X).toFixed(2)},${(i.v + (a.v - i.v) * X).toFixed(2)}`;
    }).join(' ');
    const idealPts = ['tl', 'tr', 'br', 'bl'].map(k => `${ideal[k].u.toFixed(2)},${ideal[k].v.toFixed(2)}`).join(' ');
    el.skewSvg.innerHTML =
      `<rect class="card" x="0" y="0" width="63" height="88" rx="3"/>` +
      `<polygon class="ideal" points="${idealPts}"/>` +
      `<polygon class="frame" points="${pts}"/>`;
  }

  function renderGrades() {
    const input = {};
    for (const side of ['front', 'back']) {
      const m = measureOf(state.sides[side]);
      if (m) input[side] = Geo.gradingBorders(Geo.axes(m, pairingFor(side), state.mode));
    }
    const res = G.evaluate(input);
    const rows = [];
    for (const key of Object.keys(G.STANDARDS)) {
      const c = res.companies[key];
      const cell = side => {
        const g = c[side];
        if (!g) return `<td class="na">–</td>`;
        const better = g.better ? `<span class="sub">${g.better.label} ab ${g.better.limit}/${100 - g.better.limit}</span>` : '';
        const lim = c.limiting === side && input.front && input.back ? ' lim' : '';
        return `<td><span class="g${lim}">${g.label}</span>${better}</td>`;
      };
      const total = c.overall
        ? `<td class="total"><span class="g">${c.overall}</span><span class="sub">${c.limiting === 'front' ? 'durch Vorderseite' : 'durch Rückseite'}${!input.back ? ', Rückseite fehlt' : ''}</span></td>`
        : `<td class="na">–</td>`;
      rows.push(`<tr><td>${c.name}${c.sub ? '<span class="sub">Subgrade</span>' : ''}</td>${cell('front')}${cell('back')}${total}</tr>`);
    }
    el.gradesBody.innerHTML = rows.join('');
  }

  function refresh() {
    const s = cur();
    el.rot.value = s ? s.rotation : 0;
    el.rot.disabled = !s;
    el.auto.disabled = !s;
    el.rotOut.textContent = num(s ? s.rotation : 0, 2) + '°';
    for (const b of document.querySelectorAll('[data-side]')) {
      b.setAttribute('aria-selected', String(b.dataset.side === state.side));
    }
    draw();
    renderResult();
  }

  // ---------- Interaktion ----------

  function toImage(ev) {
    const r = el.view.getBoundingClientRect();
    const { scale } = state.view;
    return { x: (ev.clientX - r.left) / scale, y: (ev.clientY - r.top) / scale };
  }

  /** Nächster Punkt, sonst nächste Linie im Fangradius. */
  function hitTest(p) {
    const s = cur();
    if (!s || !s.lines) return null;
    const tolPt = HIT_PT_PX / state.view.scale, tol = HIT_PX / state.view.scale;
    let best = null;
    for (const ring of RINGS) for (const edge of SIDES) {
      s.lines[ring][edge].forEach((q, idx) => {
        const d = Math.hypot(q.x - p.x, q.y - p.y);
        if (d <= tolPt && (!best || d < best.d)) best = { ring, edge, idx, d };
      });
    }
    if (best) return best;
    for (const ring of ['inner', 'outer']) for (const edge of SIDES) {
      const seg = Geo.edgeSegment(s.lines[ring], edge);
      if (!seg[0] || !seg[1]) continue;
      const d = distToSegment(p, seg[0], seg[1]);
      if (d <= tol && (!best || d < best.d)) best = { ring, edge, idx: null, d };
    }
    return best;
  }

  function distToSegment(p, a, b) {
    const dx = b.x - a.x, dy = b.y - a.y;
    const L2 = dx * dx + dy * dy || 1;
    const t = Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / L2));
    return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
  }

  /** Verschiebt den ausgewählten Punkt bzw. die ganze Linie um (dx, dy). */
  function moveSelection(base, dx, dy) {
    const s = cur();
    const { ring, edge, idx } = state.selected;
    const W = s.work.width, H = s.work.height;
    const pts = s.lines[ring][edge];
    const targets = idx === null ? [0, 1] : [idx];
    // Linien nur quer zur Kante verschieben, Punkte frei
    if (idx === null) {
      if (Geo.isVertical(edge)) dy = 0; else dx = 0;
    }
    for (const i of targets) {
      pts[i] = {
        x: Math.max(0, Math.min(W, base[i].x + dx)),
        y: Math.max(0, Math.min(H, base[i].y + dy)),
      };
    }
    s.manual = true;
  }

  function selectedPoint() {
    const s = cur();
    const { ring, edge, idx } = state.selected;
    const pts = s.lines[ring][edge];
    if (idx !== null) return pts[idx];
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }

  el.view.addEventListener('pointerdown', ev => {
    const p = toImage(ev);
    const hit = hitTest(p);
    state.selected = hit ? { ring: hit.ring, edge: hit.edge, idx: hit.idx } : null;
    if (hit) {
      const s = cur();
      state.drag = { start: p, base: s.lines[hit.ring][hit.edge].map(clonePt) };
      el.view.setPointerCapture(ev.pointerId);
      el.view.classList.add('grab');
      const q = selectedPoint();
      drawLoupe(q.x, q.y);
    }
    el.view.focus({ preventScroll: true });
    draw();
  });

  el.view.addEventListener('pointermove', ev => {
    if (!state.drag) {
      el.view.style.cursor = hitTest(toImage(ev)) ? 'grab' : 'crosshair';
      return;
    }
    const p = toImage(ev);
    moveSelection(state.drag.base, p.x - state.drag.start.x, p.y - state.drag.start.y);
    draw();
    const q = state.selected.idx === null ? p : selectedPoint();
    if (state.selected.idx === null) {
      // Lupe auf die Linie legen
      const sp = selectedPoint();
      if (Geo.isVertical(state.selected.edge)) q.x = sp.x; else q.y = sp.y;
    }
    drawLoupe(q.x, q.y);
    renderResult();
  });

  const endDrag = () => {
    state.drag = null;
    el.view.classList.remove('grab');
    el.loupe.hidden = true;
  };
  el.view.addEventListener('pointerup', endDrag);
  el.view.addEventListener('pointercancel', endDrag);

  el.view.addEventListener('keydown', ev => {
    const s = cur();
    if (!s || !s.lines) return;
    const order = [];
    for (const ring of RINGS) for (const edge of SIDES) for (const idx of [0, 1]) order.push({ ring, edge, idx });
    if (ev.key === 'n' || ev.key === 'N') {
      // nächsten Punkt auswählen
      const t = state.selected;
      const i = t ? order.findIndex(o => o.ring === t.ring && o.edge === t.edge && o.idx === (t.idx === null ? 0 : t.idx)) : -1;
      state.selected = Object.assign({}, order[(i + 1) % order.length]);
      draw();
      ev.preventDefault();
      return;
    }
    if (ev.key === 'Escape') { state.selected = null; draw(); return; }
    if (!state.selected) return;
    const step = ev.shiftKey ? 3 : 0.25;
    let dx = 0, dy = 0;
    if (ev.key === 'ArrowLeft') dx = -step;
    if (ev.key === 'ArrowRight') dx = step;
    if (ev.key === 'ArrowUp') dy = -step;
    if (ev.key === 'ArrowDown') dy = step;
    if (!dx && !dy) return;
    ev.preventDefault();
    const { ring, edge } = state.selected;
    moveSelection(s.lines[ring][edge].map(clonePt), dx, dy);
    draw();
    renderResult();
  });

  // Kartentyp umschalten: Standard oder e-Reader
  for (const b of document.querySelectorAll('[data-type]')) {
    b.addEventListener('click', () => {
      state.cardType = b.dataset.type;
      try { localStorage.setItem('centering-type', state.cardType); } catch (e) { /* ohne Speicher */ }
      syncTypeButtons();
      renderResult();
    });
  }
  function syncTypeButtons() {
    for (const b of document.querySelectorAll('[data-type]')) b.setAttribute('aria-pressed', String(b.dataset.type === state.cardType));
  }
  syncTypeButtons();

  // Wertung umschalten: Mittelwert oder schlechteste Messstelle
  for (const b of document.querySelectorAll('[data-mode]')) {
    b.addEventListener('click', () => {
      state.mode = b.dataset.mode;
      try { localStorage.setItem('centering-mode', state.mode); } catch (e) { /* ohne Speicher */ }
      syncModeButtons();
      renderResult();
    });
  }
  function syncModeButtons() {
    for (const b of document.querySelectorAll('[data-mode]')) b.setAttribute('aria-pressed', String(b.dataset.mode === state.mode));
  }
  syncModeButtons();

  // Drehung von Hand: Linien bleiben, Bild dreht sich darunter
  el.rot.addEventListener('input', () => {
    const s = cur();
    if (!s) return;
    s.rotation = parseFloat(el.rot.value);
    s.manual = true;
    el.rotOut.textContent = num(s.rotation, 2) + '°';
    renderWork(s);
    draw();
    renderResult();
  });

  el.auto.addEventListener('click', () => {
    const s = cur();
    if (!s) return;
    s.manual = false;
    s.rotation = 0;
    runDetection(state.side);
  });

  el.file.addEventListener('change', () => {
    if (el.file.files[0]) loadFile(el.file.files[0]);
    el.file.value = '';
  });

  for (const b of document.querySelectorAll('[data-side]')) {
    b.addEventListener('click', () => {
      state.side = b.dataset.side;
      state.selected = null;
      refresh();
    });
  }

  // Drag & Drop
  ['dragenter', 'dragover'].forEach(t => el.stage.addEventListener(t, ev => {
    ev.preventDefault();
    el.stage.classList.add('dragover');
  }));
  ['dragleave', 'drop'].forEach(t => el.stage.addEventListener(t, ev => {
    ev.preventDefault();
    el.stage.classList.remove('dragover');
  }));
  el.stage.addEventListener('drop', ev => {
    const f = ev.dataTransfer && ev.dataTransfer.files[0];
    if (f) loadFile(f);
  });

  // Einfügen aus der Zwischenablage (Strg+V)
  window.addEventListener('paste', ev => {
    const item = [...(ev.clipboardData ? ev.clipboardData.items : [])].find(i => i.type.startsWith('image/'));
    if (item) loadFile(item.getAsFile());
  });

  let resizeT;
  window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(draw, 80); });
  // Theme-Wechsel → Linienfarben neu zeichnen
  if (window.matchMedia) window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', draw);

  // ---------- Start mit Beispielkarte ----------

  setSide('front', { src: window.CenteringSample.makeSampleCard(), sample: true });
  refresh();
})();
