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
export async function searchCards(query, { number = '', limit = 120 } = {}) {
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
    if (list.length) return list.slice(0, limit);
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

/**
 * Alle Sets: englische/deutsche zusammengeführt, dazu japanische, chinesische
 * und koreanische. Jedes Set: id, loc (Sprache bei TCGdex), nameEn, nameDe,
 * nameLocal (Name in der Set-Sprache), code (aufgedrucktes Kürzel, falls bekannt).
 */
export async function listSets() {
  const lists = await Promise.all(SET_LOCALES.map((l) => getJson(`${API}/${l}/sets`).catch(() => [])));
  const byLoc = Object.fromEntries(SET_LOCALES.map((l, i) => [l, lists[i] || []]));
  const codeById = Object.fromEntries(Object.entries(EN_CODES).map(([c, id]) => [id, c]));
  const byId = new Map();
  let order = 0;
  for (const s of byLoc.en) {
    byId.set(s.id, { ...s, loc: 'en', nameEn: s.name, nameDe: null, nameLocal: null, code: codeById[s.id] || s.abbreviation?.official || null, order: order++ });
  }
  for (const s of byLoc.de) {
    const e = byId.get(s.id);
    if (e) { e.nameDe = s.name; if (!e.logo) e.logo = s.logo; }
    else byId.set(s.id, { ...s, loc: 'de', nameEn: s.name, nameDe: s.name, nameLocal: null, code: null, order: order++ });
  }
  for (const l of ASIAN_LOCALES) {
    for (const s of byLoc[l]) {
      const key = `${l}:${s.id}`;
      if (byId.has(s.id) && byId.get(s.id).loc === l) continue;
      // Asiatische IDs sind das aufgedruckte Kürzel (z. B. SV8a, CSV9.5C)
      byId.set(byId.has(s.id) ? key : s.id, { ...s, loc: l, nameEn: null, nameDe: null, nameLocal: s.name, code: s.id, order: order++ });
    }
  }
  return [...byId.values()].sort((a, b) => a.order - b.order);
}

export const LOCALE_LABEL = { en: 'Englisch', de: 'Deutsch', ja: 'Japanisch', 'zh-cn': 'Chinesisch (vereinfacht)', 'zh-tw': 'Chinesisch (traditionell)', ko: 'Koreanisch' };

/** Anzeigename eines Sets. */
export function setDisplayName(s) {
  return s.nameDe || s.nameEn || s.nameLocal || s.id;
}

/**
 * Sets, die zum Suchtext passen: Name (deutsch/englisch/Landessprache),
 * TCGdex-ID oder aufgedruckter Code. Ein Code wie „CSV9.5“ passt auch auf
 * „CSV9.5C“. Genaue Code-Treffer stehen vorne.
 */
export function filterSets(sets, text) {
  const words = norm(text).split(' ').filter(Boolean);
  if (!words.length) return sets;
  const c = normCode(text);
  const exact = [], prefix = [], byName = [];
  for (const s of sets) {
    const codes = [s.id, s.code].filter(Boolean).map(normCode);
    if (c && codes.includes(c)) { exact.push(s); continue; }
    if (c.length >= 2 && /\d/.test(c) && codes.some((x) => x.startsWith(c))) { prefix.push(s); continue; }
    const hay = norm(`${s.nameDe || ''} ${s.nameEn || ''} ${s.nameLocal || ''} ${s.id} ${s.code || ''}`);
    if (words.every((w) => hay.includes(w))) byName.push(s);
  }
  if (exact.length) return exact;
  if (prefix.length) return prefix;
  return byName;
}

/**
 * Ein Set mit allen Karten. Englische/deutsche Sets: Karten aus beiden
 * Sprachen zusammengeführt. Asiatische Sets: aus ihrer eigenen Sprache.
 */
export async function getSet(id, loc) {
  const enc = encodeURIComponent(id);
  if (loc && ASIAN_LOCALES.includes(loc)) {
    const s = await getJson(`${API}/${loc}/sets/${enc}`).catch(() => null);
    if (!s) return null;
    const cards = (s.cards || []).map((c) => ({ ...c, loc })).sort((a, b) => cmpNumber(a.localId, b.localId));
    return { ...s, loc, nameEn: null, cards };
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
  return { ...s, loc: de ? 'de' : 'en', nameEn: en ? en.name : s.name, cards };
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
