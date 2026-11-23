import { test, mock } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createEngine, loadReferenceIndex, MODEL_REGISTRY } from '@tilawa/core';
import { Messages } from '@anthropic-ai/sdk/resources/beta/messages/messages';
import { handleQuranFr, handleQuranSurah } from '../worker/quran.js';
import { decodePhonemes, assessFatiha } from '../public/js/quran/pronunciation.js';
import { ASSETS } from '../worker/assets.generated.js';
const read = file => JSON.parse(readFileSync(new URL(`../public/data/quran/${file}`, import.meta.url)));
const index = read('index.json');

test('114 sourates, occurrences exactes et bundle sans sourates', () => {
  assert.equal(index.surahs.length, 114);
  assert.equal(index.surahs.reduce((sum, s) => sum + s.verses, 0), 6236);
  for (const meta of index.surahs) {
    const surah = read(`surah-${meta.id}.json`);
    const counts = {};
    for (const v of surah.verses) for (const w of v.w) counts[w.l] = (counts[w.l] || 0) + 1;
    assert.deepEqual(meta.lemmaCounts, counts);
    assert.equal(Object.values(counts).reduce((a, b) => a + b, 0), meta.words);
    assert.equal(ASSETS[`/data/quran/surah-${meta.id}.json`], undefined);
  }
  assert.ok(ASSETS['/data/quran/index.json']);
  assert.ok(ASSETS['/data/quran/lexicon.json']);
});
function envFor(surah) {
  const writes = [];
  return { writes, ANTHROPIC_API_KEY: 'test', DB: { async batch() { return []; }, prepare(sql) {
    return { bind(...args) { return {
      async first() { return sql.includes('quran_surah') && args[0] === surah.id ? { data: JSON.stringify(surah) } : null; },
      async run() { writes.push(args); },
    }; } };
  } } };
}
test('route D1 : valide les numéros et retourne la sourate', async () => {
  const env = envFor(read('surah-2.json'));
  assert.equal((await (await handleQuranSurah(new Request('https://test/api/quran/surah?n=2'), env)).json()).verses.length, 286);
  await assert.rejects(handleQuranSurah(new Request('https://test/api/quran/surah?n=115'), env), { status: 400 });
  await assert.rejects(handleQuranSurah(new Request('https://test/api/quran/surah?n=3'), env), { status: 404 });
});
test('Al-Baqara : tranches complètes fusionnées, aucun cache partiel après échec', async () => {
  const surah = read('surah-2.json');
  const env = envFor(surah);
  let calls = 0;
  const stub = mock.method(Messages.prototype, 'create', async params => {
    calls++;
    const prompt = params.messages[0].content;
    assert.ok((prompt.match(/Verset /g) || []).length <= 40);
    const wordIds = [...prompt.matchAll(/^(\d+) \|/gm)].map(m => Number(m[1]));
    assert.ok(wordIds.length <= 650);
    const lemmaLines = prompt.split('LEMMES (lemme | racine | anglais) :\n')[1].split('\n');
    return { model: 'test', stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({
      words: wordIds.map(i => ({ i, fr: 'mot' })),
      lemmas: lemmaLines.map(line => ({ lemma: line.split(' | ')[0], fr: 'sens' })),
    }) }] };
  });
  try {
    const result = await (await handleQuranFr(new Request('https://test/api/quran/fr?surah=2', { method: 'POST' }), env)).json();
    assert.ok(calls > 1);
    assert.equal(Object.keys(result.words).length, surah.verses.flatMap(v => v.w).length);
    assert.ok(result.words['286:0']);
    assert.equal(env.writes.length, 1);
    const failureEnv = envFor(surah);
    const firstResponse = await stub.mock.calls[0].result;
    let step = 0;
    stub.mock.mockImplementation(async () => ++step === 1 ? firstResponse : { stop_reason: 'max_tokens' });
    await assert.rejects(handleQuranFr(new Request('https://test/api/quran/fr?surah=2', { method: 'POST' }), failureEnv), { code: 'ai_truncated' });
    assert.equal(failureEnv.writes.length, 0);
  } finally { stub.mock.restore(); }
});

test('prononciation 1:2 · décodage CTC, variantes permises et abstention', () => {
  const ids = [0, 6, 6, 0, 26, 30, 0, 30];
  const scores = new Float32Array(ids.length * 43);
  ids.forEach((id, i) => { scores[43 * i + id] = 1; });
  assert.equal(decodePhonemes(scores), 'حهۦۦ');

  const { ayahs } = JSON.parse(readFileSync(new URL('../node_modules/@tilawa/core/assets/ref-v2.json', import.meta.url)));
  const reference = ayahs.find(v => v.s === 1 && v.a === 2).p;
  for (const beats of [2, 4, 6]) {
    assert.match(assessFatiha(reference.replace('ۦۦ', 'ۦ'.repeat(beats))).result, /Durée du madd final permise/);
  }
  assert.match(assessFatiha(reference.replace('ح', 'ه')).result, /reconnu ه/);
  assert.match(assessFatiha(reference.replace('ۦۦ', 'ۦ')).result, /possiblement écourté/);
  assert.match(assessFatiha(reference.replace('ۦۦ', 'ۦۦۦ')).result, /madd final incertaine/);
  assert.match(assessFatiha(reference.slice(0, 8)).result, /Prise incertaine/);
  assert.match(assessFatiha('').result, /Prise incertaine/);
});

test('An-Nas · reprendre le mot confirmé dans la même récitation', () => {
  const ref = JSON.parse(readFileSync(new URL('../node_modules/@tilawa/core/assets/ref-v2.json', import.meta.url)));
  const tier = MODEL_REGISTRY.tiers.find(t => t.tier === 'lite');
  const engine = createEngine({ reference: loadReferenceIndex(ref),
    model: { manifest: tier.manifest, supported: tier.supported, backend: { name: 'test' } } });
  const session = engine.startMemorization({ surah: 114, fromAyah: 1, toAyah: 6 }, { confirm: { after: 'next-word' } });
  const verses = ref.ayahs.filter(v => v.s === 114);
  const fifth = verses[4];
  const wrong = fifth.p.slice(0, fifth.o[3]) + 'جُذُۥۥعِ' + fifth.p.slice(fifth.o[4]);
  let frame = 0;
  function recite(text, confidence = 0.99) {
    for (const p of text) {
      const token = ref.inventory.tokens.indexOf(p) + 1;
      session.pushEvidence({ inventory: ref.inventory.id, frameMs: 40,
        phonemes: [{ p, start: frame, end: frame + 1, conf: confidence }],
        posteriors: { k: 2, startFrame: frame, nFrames: 2, ids: [token, 0, 0, token], probs: [.999, .001, .99, .01] } });
      frame += 2;
    }
  }
  const events = [];
  session.subscribe(e => { if (e.type === 'checker') events.push(e); });
  recite(verses.slice(0, 4).map(v => v.p).join('') + wrong + verses[5].p);
  const mistake = session.mistakes().find(e => e.errorClass === 'wrong_word' && e.location.ayah === 5 && e.location.word === 4);
  assert.ok(mistake);
  recite(wrong + verses[5].p);
  assert.ok(session.mistakes().some(e => e.id === mistake.id));
  recite(fifth.p + verses[5].p, 0.3);
  assert.ok(session.mistakes().some(e => e.id === mistake.id));
  recite(fifth.p + verses[5].p);
  session.endEvidence();
  assert.ok(events.some(e => e.id === mistake.id && e.state === 'resolved'));
  assert.ok(!session.mistakes().some(e => e.id === mistake.id));
  session.dispose();
});
