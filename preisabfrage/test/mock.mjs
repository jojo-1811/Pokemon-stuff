// Nachgebildete TCGdex-Antworten für Tests ohne Netz.
const img = (l, s, n) => `https://assets.tcgdex.net/${l}/sv/${s}/${n}`;
const pricing = { cardmarket: { updated: '2026-11-01T02:00:00Z', unit: 'EUR', avg: 58.1, low: 42, trend: 61.37, avg1: 55, avg7: 59.4, avg30: 60.2, 'avg-holo': null, 'trend-holo': null } };

const cards = {
  de: {
    'sv03.5-006': { id: 'sv03.5-006', localId: '006', name: 'Glurak-ex', image: img('de', 'sv03.5', '006'), rarity: 'Doppelselten', illustrator: 'PLANETA Mochizuki', set: { name: 'Karmesin & Purpur – 151', cardCount: { official: 165 } }, pricing },
    'sv03.5-199': { id: 'sv03.5-199', localId: '199', name: 'Glurak-ex', image: img('de', 'sv03.5', '199'), rarity: 'Besondere Illustration selten', set: { name: 'Karmesin & Purpur – 151', cardCount: { official: 165 } }, pricing: { cardmarket: { trend: 189.9, low: 160, avg30: 185 } } },
    'sv03.5-004': { id: 'sv03.5-004', localId: '004', name: 'Glumanda', image: img('de', 'sv03.5', '004'), set: { name: 'Karmesin & Purpur – 151', cardCount: { official: 165 } }, pricing: { cardmarket: { trend: 0.25, 'trend-holo': 1.1 } } },
  },
  en: {
    'sv03.5-006': { id: 'sv03.5-006', localId: '006', name: 'Charizard ex', image: img('en', 'sv03.5', '006'), set: { name: '151', cardCount: { official: 165 } }, pricing },
    'sv03.5-199': { id: 'sv03.5-199', localId: '199', name: 'Charizard ex', image: img('en', 'sv03.5', '199'), set: { name: '151', cardCount: { official: 165 } } },
    'sv03.5-004': { id: 'sv03.5-004', localId: '004', name: 'Charmander', image: img('en', 'sv03.5', '004'), set: { name: '151', cardCount: { official: 165 } } },
    'swshp-SWSH050': { id: 'swshp-SWSH050', localId: 'SWSH050', name: 'Charizard V', image: null, set: { name: 'SWSH Black Star Promos' }, pricing: null },
  },
};

const brief = (c) => ({ id: c.id, localId: c.localId, name: c.name, image: c.image });
const resp = (status, body) => ({ ok: status < 400, status, json: async () => body });

export const MOCK = {
  cards,
  async fetch(url) {
    const u = new URL(url);
    const [, , loc, kind, id] = u.pathname.split('/');
    if (kind === 'cards' && !id) {
      const q = (u.searchParams.get('name') || '').toLowerCase();
      const list = Object.values(cards[loc] || {}).filter((c) => c.name.toLowerCase().includes(q));
      return resp(200, list.map(brief));
    }
    const c = cards[loc] && cards[loc][decodeURIComponent(id)];
    return c ? resp(200, c) : resp(404, { error: 'not found' });
  },
};
