// node preisabfrage/test/run.mjs
import assert from 'node:assert/strict';
import { searchUrl, filterSummary } from '../js/cardmarket.js';
import {
  setFetch, searchCards, getCard, parseCardmarket, headlinePrice,
  queryVariants, listSets, filterSets, getSet, filterCards, normCode,
} from '../js/api.js';
import { MOCK } from './mock.mjs';

let pass = 0;
const test = async (name, fn) => { await fn(); pass++; console.log('ok', name); };

await test('Link Deutsch + Deutschland + NM', () => {
  const u = new URL(searchUrl({ name: 'Charizard ex', setName: '151', language: 'de', origin: 'de', minCondition: '2' }));
  assert.equal(u.origin + u.pathname, 'https://www.cardmarket.com/de/Pokemon/Products/Search');
  assert.equal(u.searchParams.get('searchString'), 'Charizard ex 151');
  assert.equal(u.searchParams.get('language'), '3');
  assert.equal(u.searchParams.get('sellerCountry'), '7');
  assert.equal(u.searchParams.get('minCondition'), '2');
});

await test('Link EU ohne Länderfilter', () => {
  const u = new URL(searchUrl({ name: 'Pikachu', language: 'en', origin: 'eu', minCondition: '' }));
  assert.equal(u.searchParams.get('language'), '1');
  assert.equal(u.searchParams.has('sellerCountry'), false);
  assert.equal(u.searchParams.has('minCondition'), false);
});

await test('Filtertext', () => {
  assert.equal(filterSummary({ language: 'de', origin: 'eu', minCondition: '' }), 'Sprache: Deutsch · Verkäuferland: EU (alle Länder)');
});

await test('Preise normal + holo', () => {
  const p = parseCardmarket({ cardmarket: { trend: 12.5, low: 9, avg30: 11, 'trend-holo': 20, 'avg30-holo': 0, updated: '2026-11-01T00:00:00Z' } });
  assert.equal(p.normal.trend, 12.5);
  assert.equal(p.holo.trend, 20);
  assert.equal(p.holo.avg30, null);
  assert.equal(p.updated.getUTCDate(), 1);
  assert.equal(headlinePrice(p), 12.5);
});

await test('Nur Holo-Preis', () => {
  const p = parseCardmarket({ cardmarket: { 'trend-holo': 4.2 } });
  assert.equal(p.normal, null);
  assert.equal(headlinePrice(p), 4.2);
});

await test('Keine Preise', () => {
  assert.equal(parseCardmarket(null), null);
  assert.equal(parseCardmarket({ cardmarket: { trend: 0 } }), null);
});

setFetch(MOCK.fetch);

await test('Suche deutsch+englisch ohne Doppelte, Nummernfilter', async () => {
  const all = await searchCards('glurak');
  assert.equal(new Set(all.map((c) => c.id)).size, all.length);
  const six = await searchCards('glurak', { number: '006/165' });
  assert.deepEqual(six.map((c) => c.id), ['sv03.5-006']);
});

await test('Karte deutsch mit englischem Namen', async () => {
  const c = await getCard('sv03.5-006', 'de');
  assert.equal(c.name, 'Glurak-ex');
  assert.equal(c.nameEn, 'Charizard ex');
  assert.equal(c.setNameEn, '151');
  assert.equal(c.localeShown, 'de');
});

await test('Fallback auf Englisch', async () => {
  const c = await getCard('swshp-SWSH050', 'de');
  assert.equal(c.localeShown, 'en');
});

await test('Suchvarianten', () => {
  assert.deepEqual(queryVariants('Trade Please!'), ['Trade Please!', 'Trade Please', 'Please']);
  assert.deepEqual(queryVariants('Mew'), ['Mew']);
});

await test('„Glurak ex“ findet „Glurak-ex“ (Bindestrich/Satzzeichen)', async () => {
  const r = await searchCards('Glurak ex');
  assert.deepEqual(r.map((c) => c.id).sort(), ['sv03.5-006', 'sv03.5-199']);
  const r2 = await searchCards('glurak-ex!!');
  assert.equal(r2.length, 2);
});

await test('Abgeschwächte Suche liefert keine fremden Karten', async () => {
  // „Trade Please!“ gibt es bei TCGdex nur japanisch -> leer statt falscher Treffer
  assert.deepEqual(await searchCards('Trade Please!'), []);
});

await test('Japanische Schrift sucht im japanischen Bestand', async () => {
  const r = await searchCards('とりかえっこ');
  assert.deepEqual(r.map((c) => [c.id, c.loc]), [['XY-P-282', 'ja']]);
  const c = await getCard('XY-P-282', 'de', 'ja');
  assert.equal(c.localeShown, 'ja');
  assert.equal(c.nameEn, null);
});

await test('Setliste deutsch+englisch zusammengeführt', async () => {
  const sets = await listSets();
  const s151 = sets.find((s) => s.id === 'sv03.5');
  assert.equal(s151.nameDe, 'Karmesin & Purpur – 151');
  assert.equal(s151.nameEn, '151');
  assert.ok(sets.find((s) => s.id === 'sv01' && s.nameDe === null));
  assert.deepEqual(filterSets(sets, 'prismatische').map((s) => s.id), ['sv08.5']);
  assert.deepEqual(filterSets(sets, 'Prismatic Evo').map((s) => s.id), ['sv08.5']);
  assert.deepEqual(filterSets(sets, 'sv03.5').map((s) => s.id), ['sv03.5']);
});

await test('Set laden: Karten aus beiden Sprachen, nach Nummer sortiert, filterbar', async () => {
  const s = await getSet('sv03.5');
  assert.deepEqual(s.cards.map((c) => c.localId), ['004', '006', '025', '199']);
  assert.equal(s.nameEn, '151');
  assert.deepEqual(filterCards(s.cards, { name: 'glurak' }).map((c) => c.localId), ['006', '199']);
  assert.deepEqual(filterCards(s.cards, { number: '25' }).map((c) => c.name), ['Pikachu']);
});

await test('Set-Codes vereinheitlichen', () => {
  assert.equal(normCode('SV09.5'), 'sv9.5');
  assert.equal(normCode('sv 9-5'), 'sv9.5');
  assert.equal(normCode('CSV9.5C'), 'csv9.5c');
});

await test('Suche per Set-Code', async () => {
  const sets = await listSets();
  assert.deepEqual(filterSets(sets, 'CSV9.5').map((s) => s.id), ['CSV9.5C']);
  assert.deepEqual(filterSets(sets, 'csv9.5c').map((s) => s.id), ['CSV9.5C']);
  assert.deepEqual(filterSets(sets, 'SV8a').map((s) => s.id), ['SV8a']);
  assert.deepEqual(filterSets(sets, 'PRE').map((s) => s.id), ['sv08.5']);
  assert.deepEqual(filterSets(sets, 'sv8.5').map((s) => s.id), ['sv08.5']);
  assert.deepEqual(filterSets(sets, 'sv3.5').map((s) => s.id), ['sv03.5']);
  const csv = sets.find((s) => s.id === 'CSV9.5C');
  assert.equal(csv.loc, 'zh-cn');
  assert.equal(csv.nameLocal, '太晶盛聚');
});

await test('Chinesisches Set laden, Karte mit Nummer', async () => {
  const s = await getSet('CSV9.5C', 'zh-cn');
  assert.deepEqual(s.cards.map((c) => c.localId), ['001', '221']);
  const [c] = filterCards(s.cards, { number: '221/208' });
  const full = await getCard(c.id, 'de', c.loc);
  assert.equal(full.localeShown, 'zh-cn');
  assert.equal(full.name, '叶伊布ex');
});

console.log(`\n${pass} Tests bestanden`);
