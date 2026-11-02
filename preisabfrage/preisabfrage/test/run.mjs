// node preisabfrage/test/run.mjs
import assert from 'node:assert/strict';
import { searchUrl, filterSummary } from '../js/cardmarket.js';
import { setFetch, searchCards, getCard, parseCardmarket, headlinePrice } from '../js/api.js';
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

console.log(`\n${pass} Tests bestanden`);
