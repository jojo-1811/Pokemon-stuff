import {
  searchCards, getCard, imageUrl, logoUrl, parseCardmarket, headlinePrice,
  listSets, filterSets, getSet, filterCards, setDisplayName, LOCALE_LABEL,
} from './api.js';
import { LANGUAGES, ORIGINS, CONDITION_LIST, searchUrl, filterSummary } from './cardmarket.js';

const $ = (s) => document.querySelector(s);
const form = $('#search');
const results = $('#results');
const status = $('#status');
const detail = $('#detail');
const setInfo = $('#setinfo');
const direct = $('#direct');
const setList = $('#setlist');

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

// ---------- Sets laden (für Vorschläge im Set-Feld) ----------
let sets = [];
const setLabel = (s) => {
  if (s.nameLocal) return `${s.code || s.id} – ${s.nameLocal} (${LOCALE_LABEL[s.loc] || s.loc})`;
  const name = s.nameDe && s.nameDe !== s.nameEn ? `${s.nameDe} / ${s.nameEn}` : s.nameEn;
  return `${name} (${s.code ? s.code + ', ' : ''}${s.id})`;
};
const setsReady = listSets().then((list) => {
  sets = list;
  const frag = document.createDocumentFragment();
  for (const s of [...list].reverse()) {
    const o = document.createElement('option');
    o.value = setLabel(s);
    frag.append(o);
  }
  setList.append(frag);
}).catch(() => { /* Set-Suche dann ohne Vorschläge */ });

function resolveSet(text) {
  const t = text.trim();
  if (!t) return { none: true };
  const exact = sets.find((s) => setLabel(s) === t);
  if (exact) return { set: exact };
  const matches = filterSets(sets, t);
  if (matches.length === 1) return { set: matches[0] };
  return { matches };
}

// ---------- Suche ----------
let searchToken = 0;
let lastQuery = '';

form.addEventListener('submit', (e) => { e.preventDefault(); runSearch(); });
$('#browse-sets').addEventListener('click', async () => {
  form.set.value = '';
  await setsReady;
  showSetTiles(sets, 'Alle Sets');
});

async function runSearch() {
  saveFilter();
  const q = form.q.value.trim();
  const setText = form.set.value.trim();
  if (!q && !setText) { setStatus('Kartenname oder Set eingeben.'); return; }
  const token = ++searchToken;
  lastQuery = q;
  results.innerHTML = '';
  setInfo.hidden = true;
  closeDetail();
  renderDirect(q, setText);
  setStatus('Suche läuft …');

  try {
    if (setText) {
      await setsReady;
      const r = resolveSet(setText);
      if (token !== searchToken) return;
      if (r.matches) {
        if (!r.matches.length) { setStatus(`Kein Set zu „${setText}“ gefunden.`); return; }
        showSetTiles(r.matches, `${r.matches.length} Sets passen zu „${setText}“ – bitte eins wählen`);
        return;
      }
      form.set.value = setLabel(r.set); // z. B. „CSV9.5“ -> vollständiger Setname
      const set = await getSet(r.set.id, r.set.loc);
      if (token !== searchToken) return;
      if (!set) { setStatus('Set konnte nicht geladen werden.', true); return; }
      renderSetInfo(set);
      const cards = filterCards(set.cards, { name: q, number: form.number.value });
      if (!cards.length) { setStatus(`Keine passende Karte in ${set.name}.`); return; }
      setStatus(`${cards.length} von ${set.cards.length} Karten aus ${set.name}`);
      renderResults(cards, token);
      return;
    }

    const cards = await searchCards(q, { number: form.number.value });
    if (token !== searchToken) return;
    if (!cards.length) {
      setStatus(`TCGdex kennt keine Karte zu „${q}“. Cardmarket kann sie trotzdem haben – nutze den Link „Direkt auf Cardmarket suchen“.`);
      return;
    }
    setStatus(`${cards.length} Karte${cards.length === 1 ? '' : 'n'} gefunden`);
    renderResults(cards, token);
  } catch (err) {
    if (token === searchToken) setStatus(`Fehler bei der Suche: ${err.message}`, true);
  }
}

// Filter ändern -> Direktlink und offene Detailansicht aktualisieren
for (const k of ['language', 'origin', 'minCondition']) {
  form[k].addEventListener('change', () => {
    saveFilter();
    if (!direct.hidden) renderDirect(lastQuery, form.set.value.trim());
    if (current) openDetail(current.id, current.loc);
  });
}

function setStatus(text, error = false) {
  status.textContent = text;
  status.classList.toggle('error', error);
}

/** Cardmarket-Suche mit dem eingegebenen Text – findet auch Karten, die TCGdex nicht kennt. */
function renderDirect(q, setText) {
  if (!q) { direct.hidden = true; return; }
  const r = setText ? resolveSet(setText) : {};
  const setName = r.set ? r.set.nameEn : '';
  const url = searchUrl({ name: q, setName, ...filter() });
  direct.hidden = false;
  direct.innerHTML = `Nicht dabei? <a href="${url}" target="_blank" rel="noopener">Direkt auf Cardmarket suchen: „<span></span>“ ↗</a>`;
  direct.querySelector('span').textContent = [q, setName].filter(Boolean).join(' ');
}

// ---------- Sets anzeigen ----------
function showSetTiles(list, title) {
  ++searchToken;
  results.innerHTML = '';
  setInfo.hidden = true;
  closeDetail();
  setStatus(title);
  const frag = document.createDocumentFragment();
  for (const s of [...list].reverse()) {
    const b = document.createElement('button');
    b.type = 'button';
    b.className = 'tile settile';
    b.innerHTML = `
      <div class="logo">${s.logo ? `<img loading="lazy" alt="" src="${logoUrl(s.logo)}">` : ''}</div>
      <div class="meta"><strong></strong><span class="set"></span></div>`;
    b.querySelector('strong').textContent = setDisplayName(s);
    b.querySelector('.set').textContent = [
      s.nameDe && s.nameDe !== s.nameEn ? s.nameEn : null,
      s.code && s.code !== s.id ? s.code : null, s.id,
      s.nameLocal ? LOCALE_LABEL[s.loc] : null,
      s.cardCount?.total ? `${s.cardCount.total} Karten` : null,
    ].filter(Boolean).join(' · ');
    b.addEventListener('click', () => { form.set.value = setLabel(s); runSearch(); });
    frag.append(b);
  }
  results.append(frag);
}

function renderSetInfo(set) {
  setInfo.hidden = false;
  setInfo.innerHTML = `
    ${set.logo ? `<img alt="" src="${logoUrl(set.logo)}">` : ''}
    <div><strong></strong><span class="muted small"></span></div>
    <button type="button" class="link">Set entfernen</button>`;
  setInfo.querySelector('strong').textContent = set.name;
  setInfo.querySelector('span').textContent = [
    set.nameEn && set.name !== set.nameEn ? set.nameEn : null,
    set.loc && !['de', 'en'].includes(set.loc) ? `${set.id} · ${LOCALE_LABEL[set.loc]}` : set.id,
    set.serie?.name,
    set.cardCount?.official ? `${set.cardCount.official} Karten (+${Math.max(0, (set.cardCount.total || 0) - set.cardCount.official)} Secret)` : null,
    set.releaseDate ? `erschienen ${new Date(set.releaseDate).toLocaleDateString('de-DE')}` : null,
  ].filter(Boolean).join(' · ');
  setInfo.querySelector('button').addEventListener('click', () => {
    form.set.value = '';
    setInfo.hidden = true;
    if (form.q.value.trim()) runSearch(); else { results.innerHTML = ''; setStatus(''); }
  });
}

// ---------- Kartenkacheln ----------
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
        <span class="set"></span>
        <span class="price">…</span>
      </div>`;
    b.querySelector('strong').textContent = c.name;
    b.querySelector('.set').textContent = `${c.id}`;
    b.addEventListener('click', () => openDetail(c.id, c.loc));
    frag.append(b);
    tiles.set(c.id, b);
  }
  results.append(frag);

  // Set und Preis nachladen (max. 6 parallel, sichtbare zuerst reicht hier: Reihenfolge)
  const queue = [...cards];
  const lang = LANGUAGES[form.language.value]?.tcgdex;
  const worker = async () => {
    while (queue.length) {
      const c = queue.shift();
      if (token !== searchToken) return;
      const t = tiles.get(c.id);
      try {
        const full = await getCard(c.id, lang, c.loc);
        if (!full || !t) continue;
        t.querySelector('.set').textContent = `${full.set?.name ?? ''} · ${full.localId}`;
        const p = headlinePrice(parseCardmarket(full.pricing));
        t.querySelector('.price').textContent = p ? `Trend ${fmt(p)}` : 'kein Preis';
      } catch {
        if (t) t.querySelector('.price').textContent = '';
      }
    }
  };
  Promise.all(Array.from({ length: 6 }, worker));
}

// ---------- Detailansicht ----------
let current = null;

async function openDetail(id, loc) {
  current = { id, loc };
  detail.hidden = false;
  detail.innerHTML = '<p class="muted">Lade Karte …</p>';
  const f = filter();
  const lang = LANGUAGES[f.language];
  let card;
  try {
    card = await getCard(id, lang?.tcgdex, loc);
  } catch (err) {
    detail.innerHTML = `<p class="error">Fehler: ${esc(err.message)}</p>`;
    return;
  }
  if (!current || current.id !== id) return;
  if (!card) { detail.innerHTML = '<p class="error">Karte nicht gefunden.</p>'; return; }

  const prices = parseCardmarket(card.pricing);
  // Für Cardmarket den englischen Namen nehmen; gibt es keinen (z. B. japanische
  // Exklusivkarten), den eingegebenen Suchtext.
  const cmName = card.nameEn || lastQuery || card.name;
  const url = searchUrl({ name: cmName, setName: card.nameEn ? card.setNameEn : '', ...f });
  const imgNote = lang && lang.tcgdex !== card.localeShown
    ? `<p class="muted small">Bild auf ${LOCALE_LABEL[card.localeShown] || card.localeShown} – auf ${lang.label} gibt es die Karte bei TCGdex nicht.</p>` : '';

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
        <p class="muted small">Öffnet die Cardmarket-Suche nach „<span class="q"></span>“ mit deinen Filtern. Beim Klick auf das Produkt prüfen, ob die Filter oben noch gesetzt sind, sonst dort nachstellen.</p>
        ${card.nameEn ? '' : '<p class="muted small">Diese Karte gibt es bei TCGdex nur in ihrer Landessprache. Cardmarket führt solche Karten unter englischem Namen – findet der Link nichts, suche oben mit dem englischen Namen (z. B. „Trade Please!“ oder „Leafeon ex“) und nutze „Direkt auf Cardmarket suchen“.</p>'}
      </div>
    </div>`;
  const nameLine = card.nameEn && card.name !== card.nameEn ? `${card.name} (${card.nameEn})` : card.name;
  detail.querySelector('h2').textContent = nameLine;
  detail.querySelector('.sub').textContent =
    [card.set?.name, `Nr. ${card.localId}${card.set?.cardCount?.official ? '/' + card.set.cardCount.official : ''}`, card.rarity, card.illustrator && `Illustration: ${card.illustrator}`]
      .filter(Boolean).join(' · ');
  detail.querySelector('.filters').textContent = filterSummary(f);
  detail.querySelector('.q').textContent = [cmName, card.nameEn ? card.setNameEn : ''].filter(Boolean).join(' ');
  detail.querySelector('.close').addEventListener('click', closeDetail);
  detail.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function closeDetail() {
  current = null;
  detail.hidden = true;
  detail.innerHTML = '';
}

function priceTable(p) {
  if (!p) return '<p class="muted">Für diese Karte liefert der Cardmarket-Preisguide keine Preise. Aktuelle Angebote siehst du über den Button unten.</p>';
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
