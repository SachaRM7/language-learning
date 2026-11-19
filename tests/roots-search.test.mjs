import test from 'node:test';
import assert from 'node:assert/strict';
import { scoreRoot, arabicLetters, normAr, rootTranslit } from '../public/js/root-search.js';

const ktb = { root: 'كتب', words: ['كَتَبَ', 'كِتَاب', 'مَكْتَبَة'], latin: 'écrire k-t-b kataba livre' };
const amn = { root: 'أمن', words: ['ءَامَنَ', 'إِيمَٰن', 'مُؤْمِن'], latin: 'believe' };
const qwl = { root: 'قول', words: ['قالَ', 'قَوْل'], latin: 'say' };

test('normalisation : voyelles, hamza, alif', () => {
  assert.equal(normAr('ٱلْكِتَٰبُ'), 'الكتب');
  assert.equal(arabicLetters('ك ت ب'), 'كتب');
  assert.equal(arabicLetters('أ - م - ن'), 'امن');
});

test('racine exacte, lettres séparées ou non, avec ou sans hamza', () => {
  for (const q of ['كتب', 'ك ت ب', 'ك-ت-ب', 'كَتَبَ']) assert.equal(scoreRoot(ktb, q), 100, q);
  for (const q of ['أمن', 'امن', 'ا م ن', 'ءمن']) assert.equal(scoreRoot(amn, q), 100, q);
});

test('une ou deux lettres : les racines qui les contiennent, début de racine en premier', () => {
  assert.equal(scoreRoot(ktb, 'ك'), 80);
  assert.equal(scoreRoot(ktb, 'ت'), 60);
  assert.equal(scoreRoot(ktb, 'ك ت'), 80);
  assert.equal(scoreRoot(ktb, 'كب'), 60);
  assert.equal(scoreRoot(ktb, 'ق'), 0);
  assert.equal(scoreRoot(qwl, 'ك'), 0);
});

test('un mot entier mène à sa racine', () => {
  assert.equal(scoreRoot(ktb, 'كتاب'), 40);
  assert.equal(scoreRoot(ktb, 'يكتبون'), 30);
  // كون est aussi « contenue » dans يكتبون, mais ses lettres sont éloignées : elle passe après كتب
  assert.ok(scoreRoot({ root: 'كون' }, 'يكتبون') < scoreRoot(ktb, 'يكتبون'));
  assert.equal(scoreRoot(amn, 'مؤمن'), 40);
});

test('recherche latine : sens et translittération', () => {
  assert.ok(scoreRoot(ktb, 'ecrire') > 0);
  assert.ok(scoreRoot(ktb, 'ktb') > 0);
  assert.ok(scoreRoot(ktb, 'k t b') > 0);
  assert.equal(scoreRoot(ktb, 'manger'), 0);
});

test('translittération des racines du Coran', () => {
  assert.equal(rootTranslit('كتب'), 'k-t-b');
  assert.equal(rootTranslit('قول'), 'q-w-l');
  assert.ok(scoreRoot({ root: 'كتب', latin: rootTranslit('كتب') }, 'ktb') > 0);
});
