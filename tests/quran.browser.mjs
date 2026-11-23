import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [], requests = [];
page.on('pageerror', e => errors.push(e.message));
page.on('request', r => requests.push(r.url()));
try {
  await page.goto('http://localhost:8787/#/coran');
  await page.waitForSelector('.qh-row');
  assert.equal(await page.locator('.qh-row').count(), 114);
  assert.equal(requests.filter(u => /api\/quran\/surah|surah-\d+\.json/.test(u)).length, 0);
  const stats = await page.locator('.qh-stats').innerText();
  assert.match(stats, /verset mémorisé/);
  const result = await page.evaluate(async () => {
    const q = await import('/js/quran.js');
    const decks = await q.buildQuranDecks();
    const index = await q.loadQuranIndex();
    const meta = index.surahs.find(s => s.id === 2);
    const known = new Set(Object.keys(meta.lemmaCounts).slice(0, 20));
    return { verses: index.surahs.reduce((sum, s) => sum + s.verses, 0), decks: decks.length, cards: decks.find(d => d.surah === 2).cards.length,
      expected: meta.lemmas, comp: q.comprehension(meta, known),
      weighted: Math.round(Object.entries(meta.lemmaCounts).reduce((n, [l, count]) => n + (known.has(l) ? count : 0), 0) / meta.words * 100) };
  });
  assert.equal(result.verses, 6236);
  assert.equal(result.decks, 114); assert.equal(result.cards, result.expected); assert.equal(result.comp, result.weighted);
  assert.equal(requests.filter(u => /api\/quran\/surah|surah-\d+\.json/.test(u)).length, 0);
  await page.screenshot({ path: '/tmp/quran-home.png', fullPage: false });
  await page.goto('http://localhost:8787/#/coran/2');
  await page.waitForSelector('#v-286');
  assert.equal(await page.locator('.qv').count(), 286);
  assert.match(await page.locator('.qs-hero__name').innerText(), /Baqar/i);
  await page.screenshot({ path: '/tmp/quran-2.png' });
  await page.goto('http://localhost:8787/#/coran/112/hifz');
  await page.waitForSelector('#hz-next');
  assert.match(await page.locator('.hz-head').innerText(), /Ikhlas/i);
  await page.locator('#hz-next').click();
  assert.match(await page.locator('.hz-steps .is-active').innerText(), /Masquer/);
  await page.screenshot({ path: '/tmp/quran-hifz.png' });
  await page.locator('#hz-recite').click();
  assert.equal(await page.locator('#hz-rec-action').textContent(), 'Activer le micro');
  await page.locator('#hz-rec-return').click();
  assert.match(await page.locator('.hz-steps .is-active').innerText(), /Masquer/);
  assert.equal(await page.locator('#hz-recite').count(), 1);
  assert.deepEqual(errors, []);
  for (const n of [0, 115, 'abc']) assert.equal((await page.request.get(`http://localhost:8787/api/quran/surah?n=${n}`)).status(), 400);
  console.log(JSON.stringify({ routes: ['#/coran', '#/coran/2', '#/coran/112/hifz'], stats, ...result, errors, surahRequests: requests.filter(u => /api\/quran\/surah/.test(u)) }, null, 2));
} finally { await browser.close(); }
