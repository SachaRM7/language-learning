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
  await page.evaluate(() => {
    const location = { surah: 114, ayah: 1, word: 2 };
    window.emitRecitation({ type: 'position', state: 'locked', observed: [{ word: location }] });
    window.emitRecitation({ type: 'checker', id: 'mistake', state: 'confirmed', errorClass: 'wrong_word', location });
  });
  assert.equal(await page.locator('#hz-word-1-2[data-review-word="confirmed"]').isVisible(), true);
  await page.getByRole('link', { name: /Mot à reprendre/ }).waitFor();
  await finish.click();
  await recite.waitFor();
  assert.match(await page.locator('hifz-microphone [role=status]').innerText(), /1 écart/);
  assert.equal(await audioMode(), 'playback');
  await recite.click();
  await finish.waitFor();
  await page.getByRole('button', { name: 'Continuer au verset 4' }).click();
  await page.waitForSelector('#hz-next');
  assert.equal(await audioMode(), 'playback');
  assert.deepEqual(errors, []);
  console.log('Récitation An-Nas vérifiée avec un micro virtuel.');
} finally { await browser.close(); }
