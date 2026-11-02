import { searchCards, getCard, imageUrl, parseCardmarket, headlinePrice } from './api.js';
import { LANGUAGES, ORIGINS, CONDITION_LIST, searchUrl, filterSummary } from './cardmarket.js';

const $ = (s) => document.querySelector(s);
const form = $('#search');
const results = $('#results');
const status = $('#status');
const detail = $('#detail');

const STORE = 'preisabfrage.filter';
const eur = new Intl.NumberFormat('de-DE', { style: 'currency', currency: 'EUR' });
const fmt = (v) => (v == null ? '–' : eur.format(v));

// ---------- Filter-Auswahl ----------
function fillSelect(sel, entries) {
  for (const [value, label] of entries) {
    const o = document.createElement('option');
    o.value = value; o.textContent = label;
    sel.append(o);
  }
}
fillSelect(form.language, Object.entries(LANGUAGES).map(([k, v]) => [k, v.label]));
fillSelect(form.origin, Object.entries(ORIGINS).map(([k, v]) => [k, v.label]));
fillSelect(form.minCondition, CONDITION_LIST);

function loadFilter() {
  try {
    const f = JSON.parse(localStorage.getItem(STORE) || '{}');
    for (const k of ['language', 'origin', 'minCondition']) if (f[k] != null) form[k].value = f[k];
  } catch { /* egal */ }
}
function filter() {
  return { language: form.language.value, origin: form.origin.value, minCondition: form.minCondition.value };
}
function saveFilter() {
  try { localStorage.setItem(STORE, JSON.stringify(filter())); } catch { /* egal */ }
}
loadFilter();

// ---------- Suche ----------
let searchToken = 0;

form.addEventListener('submit', async (e) => {
  e.preventDefault();
  saveFilter();
  const q = form.q.value.trim();
  if (!q) return;
  const token = ++searchToken;
  results.innerHTML = '';
  closeDetail();
  setStatus('Suche läuft …');
  try {
    const cards = await searchCards(q, { number: form.number.value });
    if (token !== searchToken) return;
    if (!cards.length) { setStatus(`Keine Karte zu „${q}“ gefunden. Deutsch oder englisch schreiben, z. B. „Glurak ex“ oder „Charizard ex“.`); return; }
    setStatus(`${cards.length} Karte${cards.length === 1 ? '' : 'n'} gefunden`);
    renderResults(cards, token);
  } catch (err) {
    if (token === searchToken) setStatus(`Fehler bei der Suche: ${err.message}`, true);
  }
});

// Filter ändern -> offene Detailansicht aktualisieren
for (const k of ['language', 'origin', 'minCondition']) {
  form[k].addEventListener('change', () => {
    saveFilter();
    if (currentId) openDetail(currentId);
  });
}

function setStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

function renderResults(cards, token) {
  const frag = document.createDocumentFragment();
  const tiles = new Map();
  for (const c of cards) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile';
    b.innerHTML = `
      <div class="thumb">${c.image ? `<img loading="lazy" alt="" src="${imageUrl(c.image)}">` : '<span>Kein Bild</span>'}</div>
      <div class="meta">
        <strong></strong>
        <span class="set">${esc(c.id)}</span>
        <span class="price">…</span>
      </div>`;
    b.querySelector('strong').textContent = c.name;
    b.addEventListener('click', () => openDetail(c.id));
    frag.append(b);
    tiles.set(c.id, b);
  }
  results.append(frag);
  // Set und Preis nachladen (max. 6 parallel)
  const queue = [...cards];
  const lang = LANGUAGES[form.language.value]?.tcgdex;
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift();
      if (token !== searchToken) return;
      try {
        const full = await getCard(c.id, lang);
        const t = tiles.get(c.id);
        if (!full || !t) continue;
        t.querySelector('.set').textContent = `${full.set?.name ?? ''} · ${full.localId}`;
        const p = headlinePrice(parseCardmarket(full.pricing));
        t.querySelector('.price').textContent = p ? `Trend ${fmt(p)}` : 'kein Preis';
      } catch {
        const t = tiles.get(c.id);
        if (t) t.querySelector('.price').textContent = '';
      }
    }
  };
  Promise.all(Array.from({ length: 6 }, worker));
}

// ---------- Detailansicht ----------
let currentId = null;

async function openDetail(id) {
  currentId = id;
  detail.hidden = false;
  detail.innerHTML = '<p class="muted">Lade Karte …</p>';
  const f = filter();
  const lang = LANGUAGES[f.language];
  let card;
  try {
    card = await getCard(id, lang?.tcgdex);
  } catch (err) {
    detail.innerHTML = `<p class="error">Fehler: ${esc(err.message)}</p>`;
    return;
  }
  if (currentId !== id) return;
  if (!card) { detail.innerHTML = '<p class="error">Karte nicht gefunden.</p>'; return; }

  const prices = parseCardmarket(card.pricing);
  const url = searchUrl({ name: card.nameEn, setName: card.setNameEn, ...f });
  const imgNote = lang && lang.tcgdex !== card.localeShown
    ? `<p class="muted small">Bild auf Englisch – auf ${lang.label} gibt es die Karte bei TCGdex nicht.</p>` : '';

  detail.innerHTML = `
    <button type="button" class="close" aria-label="Schließen">×</button>
    <div class="detail-grid">
      <div class="big">
        ${card.image ? `<a href="${imageUrl(card.image, 'high')}" target="_blank" rel="noopener"><img alt="" src="${imageUrl(card.image, 'high')}"></a>` : '<div class="noimg">Kein Bild</div>'}
        ${imgNote}
      </div>
      <div class="info">
        <h2></h2>
        <p class="muted sub"></p>
        <h3>Cardmarket-Preise</h3>
        ${priceTable(prices)}
        <p class="muted small">Preisguide von Cardmarket über TCGdex, täglich aktualisiert${prices?.updated ? `, Stand ${prices.updated.toLocaleDateString('de-DE')}` : ''}. Die Werte gelten für alle Sprachen und Länder zusammen.</p>
        <h3>Angebote, Verkäuferfotos und Kommentare</h3>
        <p class="filters"></p>
        <a class="cta" href="${url}" target="_blank" rel="noopener">Angebote auf Cardmarket öffnen ↗</a>
        <p class="muted small">Öffnet die Cardmarket-Suche mit deinen Filtern. Beim Klick auf das Produkt prüfen, ob die Filter oben noch gesetzt sind, sonst dort nachstellen.</p>
      </div>
    </div>`;
  detail.querySelector('h2').textContent = card.name + (card.name !== card.nameEn ? ` (${card.nameEn})` : '');
  detail.querySelector('.sub').textContent =
    [card.set?.name, `Nr. ${card.localId}${card.set?.cardCount?.official ? '/' + card.set.cardCount.official : ''}`, card.rarity, card.illustrator && `Illustration: ${card.illustrator}`]
      .filter(Boolean).join(' · ');
  detail.querySelector('.filters').textContent = filterSummary(f);
  detail.querySelector('.close').addEventListener('click', closeDetail);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeDetail() {
  currentId = null;
  detail.hidden = true;
  detail.innerHTML = '';
}

function priceTable(p) {
  if (!p) return '<p class="muted">Für diese Karte hat Cardmarket (noch) keine Preise.</p>';
  const cols = [];
  if (p.normal) cols.push(['Normal', p.normal]);
  if (p.holo) cols.push(['Holo / Reverse', p.holo]);
  const rows = [
    ['trend', 'Trendpreis'], ['low', 'Ab'], ['avg', 'Ø Verkaufspreis'],
    ['avg1', 'Ø 1 Tag'], ['avg7', 'Ø 7 Tage'], ['avg30', 'Ø 30 Tage'],
  ];
  return `<table class="prices">
    <thead><tr><th></th>${cols.map(([l]) => `<th>${l}</th>`).join('')}</tr></thead>
    <tbody>${rows.map(([k, l]) => `<tr><td>${l}</td>${cols.map(([, r]) => `<td>${fmt(r[k])}</td>`).join('')}</tr>`).join('')}</tbody>
  </table>`;
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}
