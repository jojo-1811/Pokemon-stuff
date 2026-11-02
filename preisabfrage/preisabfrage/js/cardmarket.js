// Cardmarket-Links und Filter-IDs.
// Cardmarket hat keine offene API mehr; die App öffnet deshalb die Angebotssuche
// direkt auf cardmarket.com mit den gewählten Filtern. Dort sind die
// Verkäuferfotos und Kommentare der einzelnen Angebote zu sehen.

// Kartensprache: Kürzel -> { Cardmarket-Sprach-ID, TCGdex-Locale, Anzeigename }
export const LANGUAGES = {
  de: { cm: 3, tcgdex: 'de', label: 'Deutsch' },
  en: { cm: 1, tcgdex: 'en', label: 'Englisch' },
  fr: { cm: 2, tcgdex: 'fr', label: 'Französisch' },
  it: { cm: 5, tcgdex: 'it', label: 'Italienisch' },
  es: { cm: 4, tcgdex: 'es', label: 'Spanisch' },
  pt: { cm: 8, tcgdex: 'pt', label: 'Portugiesisch' },
  ja: { cm: 7, tcgdex: null, label: 'Japanisch' },
};

// Herkunft der Verkäufer
export const ORIGINS = {
  de: { sellerCountry: 7, label: 'Deutschland' },
  eu: { sellerCountry: null, label: 'EU (alle Länder)' },
};

// Mindestzustand (Cardmarket-IDs). Als Liste, damit „Egal“ vorne bleibt.
export const CONDITION_LIST = [
  ['', 'Egal'],
  ['1', 'Mint'],
  ['2', 'Near Mint'],
  ['3', 'Excellent'],
  ['4', 'Good'],
  ['5', 'Light Played'],
  ['6', 'Played'],
];
export const CONDITIONS = Object.fromEntries(CONDITION_LIST);

const BASE = 'https://www.cardmarket.com/de/Pokemon';

function filterParams({ language, origin, minCondition }) {
  const p = new URLSearchParams();
  const lang = LANGUAGES[language];
  if (lang) p.set('language', String(lang.cm));
  const o = ORIGINS[origin];
  if (o && o.sellerCountry) p.set('sellerCountry', String(o.sellerCountry));
  if (minCondition) p.set('minCondition', String(minCondition));
  return p;
}

/**
 * Link zur Cardmarket-Suche mit Filtern.
 * Gesucht wird mit dem englischen Kartennamen (so heißen die Produkte auf
 * Cardmarket) plus Setname, damit das richtige Produkt oben steht.
 */
export function searchUrl({ name, setName, language, origin, minCondition }) {
  const q = [name, setName].filter(Boolean).join(' ').trim();
  const p = new URLSearchParams({ searchString: q });
  for (const [k, v] of filterParams({ language, origin, minCondition })) p.set(k, v);
  return `${BASE}/Products/Search?${p.toString()}`;
}

/** Filter als Text, damit man sie auf Cardmarket notfalls von Hand setzen kann. */
export function filterSummary({ language, origin, minCondition }) {
  const parts = [];
  if (LANGUAGES[language]) parts.push(`Sprache: ${LANGUAGES[language].label}`);
  if (ORIGINS[origin]) parts.push(`Verkäuferland: ${ORIGINS[origin].label}`);
  if (minCondition) parts.push(`Zustand ab: ${CONDITIONS[minCondition]}`);
  return parts.join(' · ');
}
