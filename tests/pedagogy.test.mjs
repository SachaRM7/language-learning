// Tests du moteur de compréhension : maîtrise, ordonnanceur, données pilotes.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { computeMasteryProfile, getEffectiveScore } from '../public/js/pedagogy/mastery.js';
import { buildSessionPlan, evaluatePassageReadiness, extractPassageNotionIds, tokenNotionIds } from '../public/js/pedagogy/scheduler.js';

const lib = JSON.parse(readFileSync(new URL('../public/data/pedagogy/library.json', import.meta.url)));
const { catalog, passages, drills } = lib;
const P = id => passages.find(p => p.id === id);
let n = 0;
const ev = (notionId, o = {}) => ({
  id: `t${n++}`, timestamp: new Date(Date.UTC(2026, 0, 1, 0, 0, n)).toISOString(), notionId,
  dimension: 'read_recognition', vocalization: 'full', scaffolding: 'no_help', sourceModule: 'flashcard', isSuccess: true, ...o,
});
const NOW = '2026-01-02T00:00:00.000Z';
const plan = (passage, evidences = [], overrides = {}) => buildSessionPlan({
  passage, library: passages, catalog, mastery: computeMasteryProfile(evidences, catalog, overrides),
  recentEvidences: evidences, nowIso: NOW,
});

test('données pilotes cohérentes : notions connues, Coran = texte exact des données', () => {
  for (const p of passages) {
    for (const t of p.tokens) {
      for (const id of tokenNotionIds(t)) assert.ok(catalog[id], `${p.id} : notion inconnue ${id}`);
      const punct = t.surfaceVocalized.slice(t.segments.map(s => s.surface).join('').length);
      assert.match(punct, /^[،.؟!:]?$/, `${p.id} : segments ≠ mot (${t.surfaceVocalized})`);
    }
    for (const id of p.transferPassageIds) assert.ok(P(id), `${p.id} → ${id}`);
    if (p.corpus === 'quran') {
      assert.equal(p.isImmutableSource, true);
      const surah = JSON.parse(readFileSync(new URL(`../public/data/quran/surah-${p.surah}.json`, import.meta.url)));
      for (const t of p.tokens) {
        const [s, v, j] = t.quranRef;
        assert.equal(s, p.surah);
        assert.equal(t.surfaceVocalized, surah.verses.find(x => x.n === v).w[j].t);
      }
    }
  }
  // Les phrases d'entraînement ne reprennent jamais un passage coranique
  const quranText = passages.filter(p => p.corpus === 'quran').map(p => p.tokens.map(t => t.surfaceVocalized).join(' '));
  for (const d of drills) assert.ok(!quranText.some(q => q.includes(d.arabicVocalized) || d.arabicVocalized.includes(q)));
});

test('une réussite avec toutes les aides ne prouve jamais l’autonomie', () => {
  const list = Array.from({ length: 12 }, () => ev('lex:kitab', { scaffolding: 'full_help' }));
  const m = computeMasteryProfile(list, catalog);
  assert.ok(m['lex:kitab'].dimensions.read_recognition.score <= 0.55);
  // La lecture sans voyelles est estimée à part
  assert.ok(getEffectiveScore(m['lex:kitab'], 'read_recognition', 'unvocalized') < 0.35);
});

test('les corrections de l’utilisateur priment', () => {
  const m = computeMasteryProfile([], catalog, { 'syn:idafa': { form_comprehension: 'known' } });
  assert.equal(getEffectiveScore(m['syn:idafa'], 'form_comprehension', 'full'), 0.95);
});

test('blocage sur un pronom suffixe : travaillé avant la relecture, puis réemployé ailleurs', () => {
  const passage = P('conv:library-request-01');
  const failed = ev('morph:pron_3ms', { dimension: 'form_comprehension', sourceModule: 'diagnostic', passageId: passage.id, isSuccess: false });
  const { steps } = plan(passage, [failed]);
  const practiceIdx = steps.findIndex(s => s.stepType === 'practice' && s.targetNotionIds.includes('morph:pron_3ms'));
  const rereadIdx = steps.findIndex(s => s.stepType === 'reread');
  assert.ok(practiceIdx > 0 && practiceIdx < rereadIdx, 'le pronom est entraîné avant la relecture');
  assert.equal(steps[practiceIdx].targetNotionIds[0], 'morph:pron_3ms', 'priorité au blocage diagnostiqué');
  const transfer = steps.find(s => s.stepType === 'transfer');
  assert.ok(transfer && transfer.passageId !== passage.id);
  assert.ok(extractPassageNotionIds(P(transfer.passageId)).includes('morph:pron_3ms'));
  // Le repérage ne repose pas la question déjà échouée
  const diag = steps.find(s => s.stepType === 'diagnose');
  assert.ok(!diag || !diag.targetNotionIds.includes('morph:pron_3ms'));
});

test('mot maîtrisé à l’écrit : bascule vers l’écoute', () => {
  const passage = P('conv:library-request-01');
  const lexemes = extractPassageNotionIds(passage).filter(id => catalog[id].category === 'lexeme');
  const others = extractPassageNotionIds(passage).filter(id => catalog[id].category !== 'lexeme');
  const evidences = [
    ...lexemes.flatMap(id => [ev(id), ev(id), ev(id)]),
    ...others.flatMap(id => [0, 1, 2].map(() => ev(id, { dimension: 'form_comprehension' }))),
    ...others.filter(id => catalog[id].category === 'syntax').flatMap(id => [0, 1, 2].map(() => ev(id, { dimension: 'active_production' }))),
  ];
  const { steps } = plan(passage, evidences);
  const listening = steps.find(s => s.stepType === 'practice' && s.targetModule === 'listening');
  assert.ok(listening, 'une étape d’écoute est proposée');
  assert.ok(listening.targetNotionIds.every(id => lexemes.includes(id)));
  assert.match(listening.rationaleFr, /à l’écoute/);
});

test('extrait coranique : jamais de réemploi du texte, exemples distincts annoncés', () => {
  const passage = P('quran:106:3-4');
  const { steps } = plan(passage, []);
  const practice = steps.filter(s => s.stepType === 'practice');
  assert.ok(practice.length > 0);
  for (const s of practice) {
    assert.notEqual(s.targetModule, 'conversation');
    assert.equal(s.passageId, undefined);
    assert.match(s.rationaleFr, /exemples pédagogiques distincts du texte cité/);
  }
  // Notions corrigées par rapport à la proposition initiale
  const segs = passage.tokens.flatMap(t => t.segments.map(s => s.notionId));
  assert.ok(segs.includes('morph:conj_fa') && segs.includes('morph:lam_amr') && segs.includes('morph:pron_3mp') && segs.includes('morph:prep_min'));
  assert.ok(!segs.includes('morph:prep_fi'));
});

test('accessibilité d’un texte : statuts, sans pourcentage', () => {
  const passage = P('quran:112:1-4');
  const r0 = evaluatePassageReadiness(passage, {}, catalog);
  assert.equal(r0.status, 'prepare_first');
  assert.doesNotMatch(r0.guidanceFr, /%/);
  const ids = extractPassageNotionIds(passage);
  const all = ids.flatMap(id => [0, 1, 2].map(() => ev(id, { dimension: catalog[id].category === 'lexeme' ? 'read_recognition' : 'form_comprehension' })));
  assert.equal(evaluatePassageReadiness(passage, computeMasteryProfile(all, catalog), catalog).status, 'ready_now');
});
