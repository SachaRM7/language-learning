import { chromium } from 'playwright';
import assert from 'node:assert/strict';
const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH, args: ['--no-sandbox', '--use-fake-device-for-media-stream', '--use-fake-ui-for-media-stream'] });
const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
const errors = [];
page.on('pageerror', error => errors.push(error.message));
try {
  await page.goto('http://localhost:8787/#/coran');
  await page.waitForSelector('.qh-row');
  await page.evaluate(async () => {
    const { db } = await import('/js/db.js');
    for (const verse of [1, 2, 3]) await db.saveLessonProgress('quran', `114:${verse}`, { memorized: true });
  });
  await page.goto('http://localhost:8787/#/coran/114/reciter/1/3');
  const recite = page.getByRole('button', { name: 'Réciter au micro' });
  await recite.waitFor();
  await page.evaluate(async () => {
    // Reproduire la contrainte WebKit avec le micro virtuel de Chromium.
    Object.defineProperty(navigator, 'audioSession', { value: { type: 'playback' } });
    const devices = navigator.mediaDevices;
    const open = devices.getUserMedia.bind(devices);
    let denied = true;
    devices.getUserMedia = async constraints => {
      if (navigator.audioSession.type === 'playback') throw new DOMException('Playback only', 'InvalidStateError');
      if (denied) {
        denied = false;
        throw new DOMException('Permission denied', 'NotAllowedError');
      }
      return open(constraints);
    };

    // Exercer le vrai graphe audio Tilawa sans télécharger le modèle vocal.
    const { startMicrophone } = await import('/js/vendor/tilawa.js');
    document.querySelector('hifz-microphone').engine = {
      listen: startMicrophone,
      startMemorization: () => ({
        state: 'active', subscribe(fn) { window.emitRecitation = fn; }, pushAudio: async () => [], end: async () => [], dispose() {},
      }),
      dispose() {},
    };
  });
  await recite.click();
  await page.getByText('Autorise le micro dans ton navigateur pour réciter.').waitFor();
  const audioMode = () => page.evaluate(() => navigator.audioSession.type);
  assert.equal(await audioMode(), 'playback');
  await recite.click();
  const finish = page.getByRole('button', { name: 'Terminer ma récitation' });
  await finish.waitFor();
  assert.equal(await audioMode(), 'play-and-record');
  await page.waitForFunction(() => document.querySelector('hifz-microphone meter').value > -48);
  const count = page.locator('hifz-microphone [data-count]');
  const position = (state, fromAyah, fromWord, toAyah, toWord) =>
    page.evaluate(([state, fromAyah, fromWord, toAyah, toWord]) => {
      const start = { surah: 114, ayah: fromAyah, word: fromWord };
      const end = { surah: 114, ayah: toAyah, word: toWord };
      window.emitRecitation({ type: 'position', state, observed: [{ word: end, span: { start, end } }] });
    }, [state, fromAyah, fromWord, toAyah, toWord]);
  await position('acquiring', 1, 1, 1, 3);
  assert.equal(await count.textContent(), '0 / 8');
  await position('locked', 1, 1, 1, 4);
  assert.equal(await count.textContent(), '4 / 8');
  assert.equal(await page.locator('.practice-verse').first().locator('[data-located]').count(), 4);
  assert.equal(await page.locator('#hz-word-1-4').getAttribute('aria-current'), 'true');
  await position('locked', 1, 4, 2, 2);
  await position('locked', 2, 2, 3, 2);
  assert.equal(await count.textContent(), '8 / 8');
  await page.evaluate(() => {
    const location = { surah: 114, ayah: 1, word: 2 };
    window.emitRecitation({ type: 'checker', id: 'mistake', state: 'confirmed', errorClass: 'wrong_word', location });
  });
  assert.equal(await page.locator('#hz-word-1-2[data-review-word="confirmed"]').isVisible(), true);
  await page.getByRole('link', { name: /Mot à reprendre/ }).waitFor();
  assert.equal(await page.locator('#hz-word-1-2 + .practice-note').textContent(), 'Mot à reprendre');
  await finish.click();
  const retry = page.getByRole('button', { name: 'Réessayer' });
  await retry.waitFor();
  assert.match(await page.locator('hifz-microphone [role=status]').innerText(), /8 \/ 8 mots repérés\. 1 écart/);
  assert.equal(await audioMode(), 'playback');
  await retry.click();
  await finish.waitFor();
  assert.equal(await count.textContent(), '0 / 8');
  await position('locked', 1, 3, 1, 4);
  assert.equal(await count.textContent(), '2 / 8');
  assert.equal(await page.locator('#hz-word-1-1[data-located], #hz-word-1-2[data-located]').count(), 0);
  assert.equal(await page.locator('.practice-note').count(), 0);
  await page.getByRole('button', { name: 'Continuer au verset 4' }).click();
  await page.waitForSelector('#hz-next');
  assert.equal(await audioMode(), 'playback');
  await page.goto('http://localhost:8787/#/coran/1/hifz/2');
  await page.getByRole('link', { name: 'Essayer la prononciation du verset' }).click();
  const option = page.getByLabel('Vérifier ma prononciation');
  assert.equal(await option.isChecked(), false);
  await page.evaluate(async () => {
    const { startMicrophone } = await import('/js/vendor/tilawa.js');
    document.querySelector('hifz-microphone').engine = {
      listen: startMicrophone,
      startMemorization: () => ({
        state: 'active', subscribe() {}, pushAudio: async () => [], end: async () => [], dispose() {},
      }),
      dispose() {},
    };
    window.analysisRuns = 0;
    window.Worker = class {
      constructor(url) {
        if (url !== '/js/vendor/muaalem-worker.js') throw new Error('Worker inattendu');
        window.analysisRuns++;
      }
      postMessage(samples) {
        if (!(samples instanceof Float32Array) || samples.length < 8000) throw new Error('PCM manquant');
        this.onmessage({ data: { result: 'Bilan de prononciation simulé', notes: [{ word: 4, label: 'Madd · 4 temps' }] } });
      }
      terminate() {}
    };
  });
  const hide = page.getByRole('button', { name: 'Masquer' });
  await hide.click();
  assert.equal(await page.locator('#practice-text').isVisible(), false);
  await page.getByRole('button', { name: 'Afficher' }).click();
  await page.evaluate(() => {
    window.referencePlayed = [];
    HTMLMediaElement.prototype.play = function () {
      window.referencePlayed.push(this.src);
      return Promise.resolve();
    };
  });
  const listen = page.getByRole('button', { name: 'Écouter le verset' });
  await listen.click();
  await page.getByRole('button', { name: 'Arrêter l’écoute' }).waitFor();
  assert.match(await page.evaluate(() => window.referencePlayed.at(-1)), /001002/);
  for (const enabled of [false, true]) {
    await option.setChecked(enabled);
    await (enabled ? retry : recite).click();
    await finish.waitFor();
    assert.equal(await page.locator('[data-replay]').isDisabled(), true);
    assert.equal(await option.isDisabled(), true);
    if (enabled) await page.waitForFunction(() => document.querySelector('hifz-microphone').take.length >= 16000);
    await finish.click();
    await retry.waitFor();
    assert.equal(await page.evaluate(() => window.analysisRuns), Number(enabled));
  }
  await page.getByText('Bilan de prononciation simulé').waitFor();
  assert.equal(await page.locator('#hz-word-2-4 + .practice-note').textContent(), 'Madd · 4 temps');
  await page.getByRole('button', { name: 'Réécouter le verset' }).click();
  await page.getByRole('button', { name: 'Arrêter l’écoute' }).click();
  await retry.click();
  await finish.waitFor();
  assert.equal(await page.locator('[data-note]').count(), 0);
  assert.deepEqual(errors, []);
  console.log('Récitation An-Nas vérifiée avec un micro virtuel.');
} finally { await browser.close(); }
