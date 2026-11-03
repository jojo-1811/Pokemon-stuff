// Kartendaten, Bilder und Cardmarket-Preise über die freie TCGdex-API
// (https://tcgdex.dev). Die Cardmarket-Preise dort stammen aus dem täglichen
// Cardmarket-Preisguide und gelten für alle Sprachen und Länder zusammen.

const API = 'https://api.tcgdex.net/v2';

let fetchImpl = (...a) => fetch(...a);
export function setFetch(fn) { fetchImpl = fn; cache.clear(); }

const cache = new Map();

async function getJson(url) {
  if (cache.has(url)) return cache.get(url);
  const p = (async () => {
    const res = await fetchImpl(url);
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`TCGdex antwortet mit ${res.status}`);
    return res.json();
  })();
  cache.set(url, p);
  try { return await p; } catch (e) { cache.delete(url); throw e; }
}

// ---------- Hilfen ----------

const hasCJK = (s) => /[぀-ヿ㐀-鿿가-힯]/.test(s);

/** Für Vergleiche: Kleinbuchstaben, ohne Akzente und Satzzeichen. */
export function norm(s) {
  return String(s || '')
    .normalize('NFKD').replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

export function normNumber(n) {
  return String(n || '').split('/')[0].trim().replace(/^0+(?=\w)/, '').toLowerCase();
}

/** Varianten des Suchbegriffs: wie eingegeben, ohne Satzzeichen, längstes Wort. */
export function queryVariants(q) {
  const raw = q.trim();
  const plain = raw.replace(/[^\p{L}\p{N}\s'-]+/gu, ' ').replace(/\s+/g, ' ').trim();
  const longest = plain.split(' ').sort((a, b) => b.length - a.length)[0] || '';
  return [...new Set([raw, plain, longest.length >= 4 ? longest : ''].filter(Boolean))];
}

// ---------- Kartensuche ----------

/**
 * Kartensuche über den Namen. Sucht deutsch und englisch (bei asiatischer
 * Schrift japanisch, chinesisch und koreanisch). Findet die genaue Eingabe nichts, wird ohne
 * Satzzeichen und zuletzt mit dem längsten Wort gesucht; dann wird lokal
 * nachgefiltert, damit nur passende Karten übrig bleiben.
 * Jeder Treffer bekommt `loc` (in welcher Sprache er gefunden wurde).
 */
export async function searchCards(query, { number = '', limit = 200 } = {}) {
  const q = query.trim();
  if (!q) return [];
  const locales = hasCJK(q) ? ASIAN_LOCALES : ['de', 'en'];
  const variants = queryVariants(q);
  const wanted = norm(q).split(' ').filter(Boolean);

  for (let i = 0; i < variants.length; i++) {
    const v = variants[i];
    const params = `name=${encodeURIComponent(v)}&pagination:itemsPerPage=250`;
    const lists = await Promise.all(locales.map((loc) =>
      getJson(`${API}/${loc}/cards?${params}`).then((l) => (l || []).map((c) => ({ ...c, loc })), () => [])));
    let list = dedupe(lists.flat());
    // Bei abgeschwächter Suche: alle eingegebenen Wörter müssen im Namen vorkommen
    if (i > 0) list = list.filter((c) => { const n = norm(c.name); return wanted.every((w) => n.includes(w)); });
    const num = normNumber(number);
    if (num) list = list.filter((c) => normNumber(c.localId) === num);
    if (list.length) { const out = list.slice(0, limit); out.total = list.length; return out; }
  }
  return [];
}

function dedupe(cards) {
  const seen = new Map();
  for (const c of cards) if (!seen.has(c.id)) seen.set(c.id, c);
  return [...seen.values()];
}

// ---------- Sets ----------

/** Sprachen, aus denen Sets geladen werden. Asiatische Sets gibt es bei TCGdex
 *  nur in ihrer eigenen Sprache (eigene Set-IDs wie SV8a oder CSV9.5C). */
export const ASIAN_LOCALES = ['ja', 'zh-cn', 'zh-tw', 'ko'];
const SET_LOCALES = ['en', 'de', ...ASIAN_LOCALES];

/** Aufgedruckte Kürzel englischer Sets -> TCGdex-ID (Karmesin & Purpur). */
export const EN_CODES = {
  SVI: 'sv01', PAL: 'sv02', OBF: 'sv03', MEW: 'sv03.5', PAR: 'sv04', PAF: 'sv04.5',
  TEF: 'sv05', TWM: 'sv06', SFA: 'sv06.5', SCR: 'sv07', SSP: 'sv08', PRE: 'sv08.5',
  JTG: 'sv09', DRI: 'sv10', SVP: 'svp',
};

/**
 * Set-Code vereinheitlichen: Kleinbuchstaben, ohne Leer-/Bindestriche,
 * führende Nullen in Zahlen weg. „SV09.5“, „sv9-5“, „sv 9.5“ -> „sv9.5“.
 */
export function normCode(s) {
  return String(s || '').toLowerCase()
    .replace(/[\s_]+/g, '')
    .replace(/(\d)-(\d)/g, '$1.$2')
    .replace(/-/g, '')
    .replace(/(^|[^\d.])0+(?=\d)/g, '$1');
}

/** Englische Namen bekannter asiatischer Sets (TCGdex führt sie nur in der Landessprache). */
export const ASIAN_ALIASES = {
  SV1a: 'Triplet Beat', SV2a: 'Pokémon Card 151', SV3a: 'Raging Surf', SV4a: 'Shiny Treasure ex',
  SV5a: 'Crimson Haze', SV6a: 'Night Wanderer', SV7a: 'Paradise Dragona', SV8a: 'Terastal Festival ex',
  SV9a: 'Heat Wave Arena', SV10: 'The Glory of Team Rocket', SV11B: 'Black Bolt', SV11W: 'White Flare',
  'CSV9.5C': 'Terastal Gathering',
};

/** Sets aus TCG Pocket (nur digital) – haben keine Cardmarket-Preise. */
const isPocketSet = (id) => /^[AB]\d+[a-z]?$/.test(id) || /^P-[AB]$/.test(id);

/**
 * Alle Sets: englische/deutsche zusammengeführt, dazu japanische, chinesische
 * und koreanische. Asiatische Sets mit gleicher ID (z. B. SV8a auf Japanisch,
 * Koreanisch, Chinesisch) werden zu einem Eintrag mit mehreren Sprachen
 * zusammengelegt. Jedes Set: id, loc, locs (asiatisch), nameEn, nameDe,
 * nameLocal, alias (englischer Name asiatischer Sets), code.
 */
export async function listSets() {
  const lists = await Promise.all(SET_LOCALES.map((l) => getJson(`${API}/${l}/sets`).catch(() => [])));
  const byLoc = Object.fromEntries(SET_LOCALES.map((l, i) => [l, (lists[i] || []).filter((s) => !isPocketSet(s.id))]));
  const codeById = Object.fromEntries(Object.entries(EN_CODES).map(([c, id]) => [id, c]));
  const intl = new Map();
  let order = 0;
  for (const s of byLoc.en) {
    intl.set(s.id, { ...s, loc: 'en', nameEn: s.name, nameDe: null, nameLocal: null, code: codeById[s.id] || null, order: order++ });
  }
  for (const s of byLoc.de) {
    const e = intl.get(s.id);
    if (e) { e.nameDe = s.name; if (!e.logo) e.logo = s.logo; }
    else intl.set(s.id, { ...s, loc: 'de', nameEn: s.name, nameDe: s.name, nameLocal: null, code: null, order: order++ });
  }
  const asian = new Map();
  for (const l of ASIAN_LOCALES) {
    for (const s of byLoc[l]) {
      const e = asian.get(s.id);
      if (e) { e.locs.push(l); e.names[l] = s.name; if (!e.logo) e.logo = s.logo; continue; }
      asian.set(s.id, {
        ...s, asian: true, loc: l, locs: [l], names: { [l]: s.name },
        nameEn: null, nameDe: null, nameLocal: s.name, alias: ASIAN_ALIASES[s.id] || null,
        code: s.id, order: order++,
      });
    }
  }
  return [...intl.values(), ...asian.values()].sort((a, b) => a.order - b.order);
}

export const LOCALE_LABEL = { en: 'Englisch', de: 'Deutsch', ja: 'Japanisch', 'zh-cn': 'Chinesisch (vereinfacht)', 'zh-tw': 'Chinesisch (traditionell)', ko: 'Koreanisch' };

/** Anzeigename eines Sets. */
export function setDisplayName(s) {
  return s.nameDe || s.nameEn || (s.alias ? `${s.alias} (${s.nameLocal})` : s.nameLocal) || s.id;
}

/**
 * Sets, die zum Suchtext passen. Reihenfolge der Prüfung, die erste mit
 * Treffern gewinnt:
 *   1. Code genau (TCGdex-ID oder Kürzel: sv08.5, SV8.5, PRE, SV8a, CSV9.5C)
 *   2. Name genau (deutsch, englisch, englischer Alias, Landessprache) – „151“
 *   3. Code-Anfang (CSV9.5 -> CSV9.5C)
 *   4. alle Wörter im Namen enthalten (deutsche/englische Sets vor asiatischen)
 */
export function filterSets(sets, text) {
  const words = norm(text).split(' ').filter(Boolean);
  if (!words.length) return sets;
  const c = normCode(text);
  const n = norm(text);
  const names = (s) => [s.nameDe, s.nameEn, s.alias, ...Object.values(s.names || {}), s.nameLocal].filter(Boolean).map(norm);
  const codes = (s) => [s.id, s.code].filter(Boolean).map(normCode);

  const exactCode = sets.filter((s) => codes(s).includes(c));
  if (exactCode.length) return exactCode;
  const exactName = sets.filter((s) => names(s).includes(n));
  if (exactName.length) return exactName;
  if (c.length >= 2 && /\d/.test(c)) {
    const prefix = sets.filter((s) => codes(s).some((x) => x.startsWith(c)));
    if (prefix.length) return prefix;
  }
  const byName = sets.filter((s) => {
    const hay = norm(`${names(s).join(' ')} ${s.id} ${s.code || ''}`);
    return words.every((w) => hay.includes(w));
  });
  return [...byName.filter((s) => !s.asian), ...byName.filter((s) => s.asian)];
}

/**
 * Ein Set mit allen Karten. Englische/deutsche Sets: Karten aus beiden
 * Sprachen zusammengeführt. Asiatische Sets: die erste Sprache, in der
 * TCGdex Karten hat (gewünschte Sprache zuerst). `empty: true`, wenn TCGdex
 * für das Set noch keine Karten erfasst hat.
 */
export async function getSet(id, loc, { locs = [], prefer } = {}) {
  const enc = encodeURIComponent(id);
  if (loc && ASIAN_LOCALES.includes(loc)) {
    const order = [...new Set([prefer, ...locs, loc, ...ASIAN_LOCALES])].filter((l) => l && ASIAN_LOCALES.includes(l));
    let first = null;
    for (const l of order) {
      const s = await getJson(`${API}/${l}/sets/${enc}`).catch(() => null);
      if (!s) continue;
      if (!first) first = { s, l };
      if (s.cards && s.cards.length) {
        const cards = s.cards.map((c) => ({ ...c, loc: l })).sort((a, b) => cmpNumber(a.localId, b.localId));
        return { ...s, loc: l, nameEn: ASIAN_ALIASES[id] || null, cards };
      }
    }
    if (!first) return null;
    return { ...first.s, loc: first.l, nameEn: ASIAN_ALIASES[id] || null, cards: [], empty: true };
  }
  const [de, en] = await Promise.all([
    getJson(`${API}/de/sets/${enc}`).catch(() => null),
    getJson(`${API}/en/sets/${enc}`).catch(() => null),
  ]);
  const s = de || en;
  if (!s) return null;
  const cards = dedupe([
    ...((de && de.cards) || []).map((c) => ({ ...c, loc: 'de' })),
    ...((en && en.cards) || []).map((c) => ({ ...c, loc: 'en' })),
  ]).sort((a, b) => cmpNumber(a.localId, b.localId));
  return { ...s, loc: de ? 'de' : 'en', nameEn: en ? en.name : s.name, cards, empty: cards.length === 0 };
}

function cmpNumber(a, b) {
  const na = parseInt(a, 10), nb = parseInt(b, 10);
  if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
  return String(a).localeCompare(String(b), 'de', { numeric: true });
}

/** Karten eines Sets lokal nach Name und/oder Nummer filtern. */
export function filterCards(cards, { name = '', number = '' } = {}) {
  const words = norm(name).split(' ').filter(Boolean);
  const num = normNumber(number);
  return cards.filter((c) => {
    if (num && normNumber(c.localId) !== num) return false;
    if (words.length) { const n = norm(c.name); if (!words.every((w) => n.includes(w))) return false; }
    return true;
  });
}

// ---------- Kartendetails ----------

/**
 * Kartendetails in der gewünschten Sprache; fällt auf Englisch und danach
 * auf die Sprache zurück, in der die Karte gefunden wurde (z. B. Japanisch).
 * Gibt zusätzlich den englischen Namen zurück (für die Cardmarket-Suche).
 */
export async function getCard(id, locale, foundIn) {
  const loc = locale || 'en';
  const enc = encodeURIComponent(id);
  const [local, en] = await Promise.all([
    loc === 'en' ? null : getJson(`${API}/${loc}/cards/${enc}`).catch(() => null),
    getJson(`${API}/en/cards/${enc}`).catch(() => null),
  ]);
  let card = local || en;
  let shown = local ? loc : 'en';
  if (!card && foundIn && foundIn !== loc && foundIn !== 'en') {
    card = await getJson(`${API}/${foundIn}/cards/${enc}`).catch(() => null);
    shown = foundIn;
  }
  if (!card) return null;
  return {
    ...card,
    localeShown: shown,
    nameEn: en ? en.name : null,
    setNameEn: en && en.set ? en.set.name : null,
    // Preise hängen nicht von der Sprache ab; nimm, was vorhanden ist
    pricing: (local && local.pricing) || (en && en.pricing) || card.pricing || null,
  };
}

export function imageUrl(image, quality = 'low') {
  if (!image) return null;
  return `${image}/${quality}.webp`;
}

export function logoUrl(logo) {
  return logo ? `${logo}.webp` : null;
}

// ---------- Preise ----------

/** Cardmarket-Preise aus TCGdex in eine einheitliche Form bringen. */
export function parseCardmarket(pricing) {
  const cm = pricing && pricing.cardmarket;
  if (!cm) return null;
  const row = (suffix) => {
    const g = (k) => num(cm[k + suffix]);
    const r = { trend: g('trend'), low: g('low'), avg: g('avg'), avg1: g('avg1'), avg7: g('avg7'), avg30: g('avg30') };
    return Object.values(r).some((v) => v != null) ? r : null;
  };
  const normal = row('');
  const holo = row('-holo');
  if (!normal && !holo) return null;
  return { normal, holo, updated: parseDate(cm.updated) };
}

function num(v) {
  const n = typeof v === 'string' ? parseFloat(v) : v;
  return typeof n === 'number' && isFinite(n) && n > 0 ? n : null;
}

function parseDate(v) {
  if (v == null || v === '') return null;
  let d;
  if (typeof v === 'number') d = new Date(v < 1e12 ? v * 1000 : v);
  else d = new Date(v);
  return isNaN(d.getTime()) ? null : d;
}

/** Bester einzelner Preis für die Übersicht (Trend, sonst Ø 30 Tage). */
export function headlinePrice(parsed) {
  if (!parsed) return null;
  for (const r of [parsed.normal, parsed.holo]) {
    if (r && (r.trend || r.avg30)) return r.trend || r.avg30;
  }
  return null;
}
