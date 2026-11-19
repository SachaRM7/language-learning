import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH });
try {
for (const reducedMotion of ['no-preference', 'reduce']) {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 }, reducedMotion });
  const errors = [];
  page.on('pageerror', e => errors.push(e.message));
  await page.route('**/api/me', r => r.fulfill({ json: { email: 'test@local', ai: true, sync: false } }));
  await page.route('**/api/tutor', async r => {
    await new Promise(resolve => setTimeout(resolve, 600));
    const turn = { reply_ar: 'مرحبا', reply_fr: 'Bonjour', suggestions: [], vocab: [], correction: { has_error: false } };
    await r.fulfill({ json: { turn, raw: JSON.stringify(turn) } });
  });
  await page.addInitScript(() => {
    window.__spoken = '';
    speechSynthesis.speak = u => { window.__spoken = u.text; setTimeout(() => u.onend?.(), 700); };
    speechSynthesis.cancel = () => {};
  });
  await page.goto('http://localhost:8787/#/home');
  await page.waitForSelector('[data-xp]');
  await page.evaluate(async () => {
    const { ensureAllDecks } = await import('/js/decks.js');
    await ensureAllDecks();
    const { store } = await import('/js/store.js');
    const { db } = await import('/js/db.js');
    const { dayKey } = await import('/js/activity.js');
    const yesterday = new Date(); yesterday.setDate(yesterday.getDate() - 1);
    await db.saveStats('arabic', { totalXP: 99, currentStreak: 6, lastActiveDate: dayKey(yesterday), activityLog: {} });
    const cards = ['chat', 'chien', 'soleil', 'lune'].map((back, i) => ({ id: `motion-${i}`, front: ['قط', 'كلب', 'شمس', 'قمر'][i], back, emoji: ['🐱', '🐶', '☀️', '🌙'][i] }));
    store.set('decks', [{ id: 'motion', name: 'Test', cards }]);
    store.set('quranDecksLoaded', true);
    store.set('reviewCards', cards.slice(0, 1));
    window.__cards = cards;
  });
  const go = async path => {
    await page.evaluate(path => { location.hash = path; }, path);
    await page.waitForTimeout(450);
  };
  await go('/mots/test/motion/flash');
  await page.locator('#btn-flip').click();
  assert.ok(await page.locator('#card-inner').evaluate(e => e.classList.contains('is-flipped')));
  for (let i = 0; i < 4; i++) { await page.locator('#btn-known').click(); await page.waitForTimeout(400); }
  await page.waitForSelector('.session-xp');
  await page.waitForSelector('.reward-badge');
  assert.match(await page.locator('.reward-badge').innerText(), /Niveau 2/);
  assert.match(await page.locator('.reward-badge').innerText(), /7 jours/);
  if (reducedMotion === 'reduce') assert.equal(await page.locator('.confetti-canvas').count(), 0);
  await page.screenshot({ path: `/tmp/motion-reward-${reducedMotion}.png` });

  for (const mode of ['learn', 'test', 'listen', 'image']) {
    await go(`/mots/test/motion/${mode}`);
    if (mode === 'test') await page.locator('#btn-start').click();
    for (let i = 0; i < 4; i++) {
      await page.waitForSelector('.choice-btn');
      await page.waitForTimeout(mode === 'listen' ? 350 : 50);
      const answer = await page.evaluate(mode => {
        const front = document.querySelector('.quiz__text')?.textContent;
        const emoji = document.querySelector('.image-stage__emoji')?.textContent;
        return window.__cards.find(c => mode === 'listen' ? c.front === window.__spoken : mode === 'image' ? c.emoji === emoji : c.front === front).back;
      }, mode);
      if (mode === 'listen' && i === 0) {
        assert.ok(await page.locator('.listen-orb').evaluate(e => e.classList.contains('is-playing')));
        const anim = await page.locator('.listen-orb__btn').evaluate(e => getComputedStyle(e, '::after').animationName);
        assert.equal(anim, reducedMotion === 'reduce' ? 'none' : 'learningWave');
      }
      await page.locator('.choice-btn').filter({ hasText: answer }).click();
      await page.waitForSelector('.feedback-bar.is-open');
      await page.locator('[data-feedback-continue]').last().click();
    }
    await page.waitForSelector('.session-xp');
    assert.match(await page.locator('.session-xp').innerText(), /4 XP/);
  }
  // Mode écrit et erreur : le feedback ne bloque pas la question suivante.
  await go('/mots/test/motion/test');
  await page.locator('.test-setup__toggle').click();
  assert.ok(await page.locator('#opt-written').isChecked());
  await page.locator('#btn-start').click();
  await page.locator('#written-input').fill('réponse incorrecte');
  await page.locator('#written-form button').click();
  await page.waitForSelector('.written-input.is-wrong');
  await page.locator('[data-feedback-continue]').last().click();
  await page.waitForSelector('.written-input:not(.is-wrong)');
  await go('/mots/test/motion/match');
  await page.locator('#btn-start').click();
  for (const id of ['motion-0', 'motion-1', 'motion-2', 'motion-3']) {
    await page.locator(`.match-cell[data-id="${id}"]`).first().click();
    await page.locator(`.match-cell[data-id="${id}"]`).last().click();
  }
  await page.waitForSelector('.session-xp');
  await go('/revision/session');
  await page.locator('.choice-btn').filter({ hasText: 'chat' }).click();
  await page.locator('[data-feedback-continue]').last().click();
  await page.waitForSelector('.rs-xp');

  await go('/tuteur');
  await page.locator('[data-scenario]').first().click();
  await page.waitForSelector('#tt-typing');
  assert.equal(await page.locator('#tt-typing').getAttribute('role'), 'status');
  await page.waitForSelector('#tt-thread .msg__ar');
  assert.equal(await page.locator('#tt-typing').count(), 0);
  await page.screenshot({ path: `/tmp/motion-tutor-${reducedMotion}.png` });
  await go('/home');
  assert.equal(await page.locator('.reward-badge').count(), 0);
  if (reducedMotion === 'reduce') {
    const value = await page.evaluate(async () => {
      const { animateCount } = await import('/js/ui.js');
      const el = document.querySelector('[data-xp]'); animateCount(el, 42); return el.textContent;
    });
    assert.equal(value, '42');
  }
  assert.deepEqual(errors, []);
  console.log(`PASS ${reducedMotion}: six mini-jeux, révision, récompenses, tuteur, nettoyage`);
  await page.close();
}
} finally { await browser.close(); }
