// Nachgebildete TCGdex-Antworten für Tests ohne Netz.
const img = (l, s, n) => `https://assets.tcgdex.net/${l}/sv/${s}/${n}`;
const pricing = { cardmarket: { updated: '2026-11-01T02:00:00Z', unit: 'EUR', avg: 58.1, low: 42, trend: 61.37, avg1: 55, avg7: 59.4, avg30: 60.2, 'avg-holo': null, 'trend-holo': null } };
const set151de = { id: 'sv03.5', name: 'Karmesin & Purpur – 151', cardCount: { official: 165, total: 207 } };
const set151en = { id: 'sv03.5', name: '151', cardCount: { official: 165, total: 207 } };

const cards = {
  de: {
    'sv03.5-006': { id: 'sv03.5-006', localId: '006', name: 'Glurak-ex', image: img('de', 'sv03.5', '006'), rarity: 'Doppelselten', illustrator: 'PLANETA Mochizuki', set: set151de, pricing },
    'sv03.5-199': { id: 'sv03.5-199', localId: '199', name: 'Glurak-ex', image: img('de', 'sv03.5', '199'), rarity: 'Besondere Illustration selten', set: set151de, pricing: { cardmarket: { trend: 189.9, low: 160, avg30: 185 } } },
    'sv03.5-004': { id: 'sv03.5-004', localId: '004', name: 'Glumanda', image: img('de', 'sv03.5', '004'), set: set151de, pricing: { cardmarket: { trend: 0.25, 'trend-holo': 1.1 } } },
  },
  en: {
    'sv03.5-006': { id: 'sv03.5-006', localId: '006', name: 'Charizard ex', image: img('en', 'sv03.5', '006'), set: set151en, pricing },
    'sv03.5-199': { id: 'sv03.5-199', localId: '199', name: 'Charizard ex', image: img('en', 'sv03.5', '199'), set: set151en },
    'sv03.5-004': { id: 'sv03.5-004', localId: '004', name: 'Charmander', image: img('en', 'sv03.5', '004'), set: set151en },
    'sv03.5-025': { id: 'sv03.5-025', localId: '025', name: 'Pikachu', image: img('en', 'sv03.5', '025'), set: set151en },
    'swshp-SWSH050': { id: 'swshp-SWSH050', localId: 'SWSH050', name: 'Charizard V', image: null, set: { name: 'SWSH Black Star Promos' }, pricing: null },
    'sv08.5-001': { id: 'sv08.5-001', localId: '001', name: 'Exeggcute', image: img('en', 'sv08.5', '001'), set: { id: 'sv08.5', name: 'Prismatic Evolutions' } },
  },
  'zh-cn': {
    'CSV9.5C-221': { id: 'CSV9.5C-221', localId: '221', name: '叶伊布ex', image: 'https://assets.tcgdex.net/zh-cn/CSV/CSV9.5C/221', set: { id: 'CSV9.5C', name: '太晶盛聚', cardCount: { official: 208 } } },
    'CSV9.5C-001': { id: 'CSV9.5C-001', localId: '001', name: '走路草', image: null, set: { id: 'CSV9.5C', name: '太晶盛聚' } },
  },
  ja: {
    'SV8a-212': { id: 'SV8a-212', localId: '212', name: 'ニンフィアex', image: null, set: { id: 'SV8a', name: 'テラスタルフェスex' } },
    'XY-P-282': { id: 'XY-P-282', localId: '282', name: 'とりかえっこプリーズ!', image: 'https://assets.tcgdex.net/ja/XY/XY-P/282', set: { name: 'XY-P' } },
  },
};

const sets = {
  'zh-cn': [{ id: 'CSV9.5C', name: '太晶盛聚', cardCount: { total: 259 } }, { id: 'CSV9C', name: '某系列', cardCount: { total: 100 } }],
  ja: [{ id: 'SV8a', name: 'テラスタルフェスex', cardCount: { total: 237 } }],
  de: [
    { ...set151de, logo: 'https://assets.tcgdex.net/de/sv/sv03.5/logo' },
    { id: 'sv08.5', name: 'Prismatische Entwicklungen', cardCount: { total: 180 } },
  ],
  en: [
    { id: 'swshp', name: 'SWSH Black Star Promos', cardCount: { total: 307 } },
    { ...set151en, logo: 'https://assets.tcgdex.net/en/sv/sv03.5/logo' },
    { id: 'sv08.5', name: 'Prismatic Evolutions', cardCount: { total: 180 } },
    { id: 'sv01', name: 'Scarlet & Violet', cardCount: { total: 258 } },
  ],
};

const brief = (c) => ({ id: c.id, localId: c.localId, name: c.name, image: c.image });
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });
export const calls = [];

export const MOCK = {
  cards,
  async fetch(url) {
    calls.push(url);
    const u = new URL(url);
    const [, , loc, kind, rawId] = u.pathname.split('/');
    const id = rawId && decodeURIComponent(rawId);
    if (kind === 'cards' && !id) {
      // wie TCGdex: Teilstring, Groß/Klein egal, Satzzeichen zählen mit
      const q = (u.searchParams.get('name') || '').toLowerCase();
      const list = Object.values(cards[loc] || {}).filter((c) => c.name.toLowerCase().includes(q));
      return resp(200, list.map(brief));
    }
    if (kind === 'sets' && !id) return resp(200, sets[loc] || []);
    if (kind === 'sets') {
      const s = (sets[loc] || []).find((x) => x.id === id);
      if (!s) return resp(404, {});
      const list = Object.values(cards[loc] || {}).filter((c) => c.id.startsWith(id + '-')).map(brief);
      return resp(200, { ...s, serie: { name: 'Karmesin & Purpur' }, releaseDate: '2023-09-22', cards: list });
    }
    const c = cards[loc] && cards[loc][id];
    return c ? resp(200, c) : resp(404, { error: 'not found' });
  },
};
