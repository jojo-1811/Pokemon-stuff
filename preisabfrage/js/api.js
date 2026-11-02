// Kartendaten, Bilder und Cardmarket-Preise über die freie TCGdex-API
// (https://tcgdex.dev). Die Cardmarket-Preise dort stammen aus dem täglichen
// Cardmarket-Preisguide und gelten für alle Sprachen und Länder zusammen.

const API = 'https://api.tcgdex.net/v2';

let fetchImpl = (...a) => fetch(...a);
export function setFetch(fn) { fetchImpl = fn; }

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

/** Kartensuche über den Namen. Sucht deutsch und englisch, Ergebnisse ohne Doppelte. */
export async function searchCards(query, { number = '', limit = 60 } = {}) {
  const q = query.trim();
  if (!q) return [];
  const params = `name=${encodeURIComponent(q)}&pagination:itemsPerPage=${limit}`;
  const [de, en] = await Promise.all([
    getJson(`${API}/de/cards?${params}`).catch(() => []),
    getJson(`${API}/en/cards?${params}`).catch(() => []),
  ]);
  const seen = new Map();
  for (const c of [...(de || []), ...(en || [])]) {
    if (!seen.has(c.id)) seen.set(c.id, c);
  }
  let list = [...seen.values()];
  const num = normNumber(number);
  if (num) list = list.filter((c) => normNumber(c.localId) === num);
  return list.slice(0, limit);
}

function normNumber(n) {
  return String(n || '').split('/')[0].trim().replace(/^0+(?=\w)/, '').toLowerCase();
}

/**
 * Kartendetails in der gewünschten Sprache; fällt auf Englisch zurück,
 * wenn es die Karte in der Sprache bei TCGdex nicht gibt.
 * Gibt zusätzlich den englischen Namen zurück (für die Cardmarket-Suche).
 */
export async function getCard(id, locale) {
  const loc = locale || 'en';
  const [local, en] = await Promise.all([
    loc === 'en' ? null : getJson(`${API}/${loc}/cards/${encodeURIComponent(id)}`).catch(() => null),
    getJson(`${API}/en/cards/${encodeURIComponent(id)}`).catch(() => null),
  ]);
  const card = local || en;
  if (!card) return null;
  return {
    ...card,
    localeShown: local ? loc : 'en',
    nameEn: en ? en.name : card.name,
    setNameEn: en && en.set ? en.set.name : card.set && card.set.name,
    // Preise hängen nicht von der Sprache ab; nimm, was vorhanden ist
    pricing: (local && local.pricing) || (en && en.pricing) || null,
  };
}

export function imageUrl(image, quality = 'low') {
  if (!image) return null;
  return `${image}/${quality}.webp`;
}

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
