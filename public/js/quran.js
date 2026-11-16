// js/quran.js — Cœur du module Coran : données, gloses françaises, cartes partagées, mémorisation.
//
// Principe « tout relié » : chaque mot du Coran est rattaché à son lemme. Un lemme = UNE carte
// (id « q:<lemme> ») dans le même système de révision que le reste du vocabulaire, quel que soit
// le nombre de sourates où il apparaît. Les racines relient ces cartes à la page Racines.

import { store } from './store.js';
import { db } from './db.js';
import { createSRSEntry, getNextReviewDate } from './srs.js';
import { removeHarakats } from './utils.js';

export const QURAN_COURSE = 'quran';     // progression de mémorisation + révision des versets
export const AUDIO_VERSE = 'https://verses.quran.com/';
export const AUDIO_WORD = 'https://audio.qurancdn.com/';
const FR_CACHE = 'ha-qfr-';

const _surahs = new Map();
let _index = null;
let _lexicon = null;

// ── Données ───────────────────────────────────────────────────────

export async function loadQuranIndex() {
  if (!_index) _index = await fetch('data/quran/index.json').then(r => r.json());
  return _index;
}

export async function loadLexicon() {
  if (!_lexicon) _lexicon = await fetch('data/quran/lexicon.json').then(r => r.json());
  return _lexicon;
}

export async function loadSurah(n) {
  if (!_surahs.has(n)) {
    const s = await fetch(`/api/quran/surah?n=${n}`).then(r => { if (!r.ok) throw new Error('surah'); return r.json(); });
    _surahs.set(n, s);
  }
  return _surahs.get(n);
}

/** Ordre d'apprentissage : Al-Fatiha, puis Juz 'Amma d'An-Nas (114) vers An-Naba (78). */
export function learningOrder(surahs) {
  return [...surahs].sort((a, b) => (a.id === 1 ? -1 : b.id === 1 ? 1 : b.id - a.id));
}

// ── Gloses françaises (générées par le Worker, mises en cache) ───────

export function cachedFr(n) {
  try { return JSON.parse(localStorage.getItem(FR_CACHE + n)) || null; } catch { return null; }
}

/**
 * Récupère les gloses françaises d'une sourate. Si elles n'existent pas encore côté serveur
 * et que l'IA est disponible, les fait générer (une seule fois pour toujours).
 */
export async function fetchFr(n, { generate = true } = {}) {
  const hit = cachedFr(n);
  if (hit) return hit;
  const account = store.get('account');
  if (!account) return null;
  try {
    let res = await fetch(`api/quran/fr?surah=${n}`, { credentials: 'same-origin' });
    if (res.status === 204) {
      if (!generate || !account.ai) return null;
      res = await fetch(`api/quran/fr?surah=${n}`, { method: 'POST', credentials: 'same-origin' });
    }
    if (!res.ok) return null;
    const body = await res.json();
    const data = { words: body.words || {}, lemmas: body.lemmas || {} };
    try { localStorage.setItem(FR_CACHE + n, JSON.stringify(data)); } catch { /* quota */ }
    applyFrToDecks(n, data);
    return data;
  } catch { return null; }
}

/** Sens d'un lemme : français si une sourate l'a déjà fourni, sinon anglais. */
export function lemmaMeaning(lemma, lexicon = _lexicon) {
  for (const s of _index?.surahs || []) {
    const fr = cachedFr(s.id)?.lemmas?.[lemma];
    if (fr) return { text: fr, lang: 'fr' };
  }
  const en = lexicon?.glossEn?.[lemma];
  return en ? { text: en, lang: 'en' } : { text: '', lang: '' };
}

// ── Cartes de vocabulaire (decks « Coran ») ──────────────────────────

export const lemmaCardId = lemma => `q:${lemma}`;

export const QURAN_THEME = {
  id: 'coran', name: 'Coran', nameAr: 'القُرْآن', color: '#E8D3A2', icon: '📖', decks: [],
};

/** Construit un deck par sourate : une carte par lemme, dans l'ordre d'apparition. */
export async function buildQuranDecks() {
  const [index, lexicon] = await Promise.all([loadQuranIndex(), loadLexicon()]);
  const meaningsFr = {};
  for (const meta of index.surahs) Object.assign(meaningsFr, cachedFr(meta.id)?.lemmas || {});
  const decks = [];
  for (const meta of learningOrder(index.surahs)) {
    const fr = cachedFr(meta.id);
    const cards = Object.keys(meta.lemmaCounts).map(lemma => ({
      id: lemmaCardId(lemma),
      front: lemma,
      frontPlain: removeHarakats(lemma),
      back: fr?.lemmas?.[lemma] || meaningsFr[lemma] || lexicon.glossEn?.[lemma] || '',
      en: lexicon.glossEn?.[lemma] || '',
      translit: translitAr(lemma),
      emoji: '', image: null, audio: null,
      tags: ['coran'],
      root: lexicon.lemmas[lemma]?.[0] || null,
    }));
    decks.push({
      id: `coran-${meta.id}`,
      name: `${meta.id}. ${meta.name}`,
      nameAr: meta.nameAr,
      category: 'Coran',
      source: 'quran',
      surah: meta.id,
      tags: ['coran'],
      cards,
    });
  }
  return decks;
}

function applyFrToDecks(n, data) {
  const decks = store.get('decks');
  if (!decks) return;
  decks.forEach(d => {
    if (d.source !== 'quran') return;
    d.cards.forEach(c => {
      const lemma = c.id.slice(2);
      if (data.lemmas[lemma]) c.back = data.lemmas[lemma];
    });
  });
}

// ── Mots connus & compréhension ──────────────────────────────────────

const normalizeAr = s => removeHarakats(s || '')
  .replace(/[ٱأإآ]/g, 'ا').replace(/ى/g, 'ي').replace(/ة/g, 'ه').replace(/ـ/g, '')
  .replace(/^ال/, '').trim();

/**
 * Ensemble des lemmes « connus » : cartes Coran en boîte ≥ 3, plus les lemmes qui correspondent
 * à un mot déjà bien su ailleurs dans l'app (vocabulaire, leçons) — c'est le même mot !
 */
export async function knownLemmas(courseId) {
  const srs = await db.getSRS(courseId);
  const known = new Set();
  const appKnown = new Set();
  const decks = store.get('decks') || [];
  const cardById = new Map(decks.flatMap(d => d.cards.map(c => [c.id, c])));
  for (const e of srs) {
    if (e.box < 3) continue;
    if (e.cardId.startsWith('q:')) known.add(e.cardId.slice(2));
    else {
      const c = cardById.get(e.cardId);
      if (c) appKnown.add(normalizeAr(c.frontPlain || c.front));
    }
  }
  if (appKnown.size) {
    const lexicon = await loadLexicon();
    for (const lemma of Object.keys(lexicon.lemmas)) {
      if (appKnown.has(normalizeAr(lemma))) known.add(lemma);
    }
  }
  return known;
}

/** % des mots (occurrences) de la sourate dont le lemme est connu. */
export function comprehension(surah, known) {
  let total = 0, ok = 0;
  if (surah.lemmaCounts) {
    total = surah.words;
    for (const [lemma, count] of Object.entries(surah.lemmaCounts)) if (known.has(lemma)) ok += count;
  } else {
    surah.verses.forEach(v => v.w.forEach(w => { total++; if (w.l && known.has(w.l)) ok++; }));
  }
  return total ? Math.round((ok / total) * 100) : 0;
}

// ── Mémorisation (hifz) ──────────────────────────────────────────────

export const verseKey = (s, v) => `${s}:${v}`;

export async function memorizedVerses() {
  const all = await db.getAllLessonProgress(QURAN_COURSE);
  return new Set(all.filter(r => r.memorized).map(r => r.lessonId));
}

/**
 * Valide un verset : il entre en révision (muraja'a) et ses mots rejoignent
 * le vocabulaire en révision — sans créer de doublon s'ils y sont déjà.
 * @returns {number} nombre de nouveaux mots ajoutés
 */
export async function markVerseMemorized(courseId, surah, verse) {
  const key = verseKey(surah.id, verse.n);
  await db.saveLessonProgress(QURAN_COURSE, key, { memorized: true, at: Date.now() });

  const quranSrs = Object.fromEntries((await db.getSRS(QURAN_COURSE)).map(e => [e.cardId, e]));
  if (!quranSrs[`v:${key}`]) {
    await db.updateSRS(QURAN_COURSE, `v:${key}`, { ...createSRSEntry(QURAN_COURSE, `v:${key}`), nextReview: getNextReviewDate(1) });
  }

  const wordSrs = Object.fromEntries((await db.getSRS(courseId)).map(e => [e.cardId, e]));
  let added = 0;
  for (const lemma of new Set(verse.w.map(w => w.l).filter(Boolean))) {
    const id = lemmaCardId(lemma);
    if (wordSrs[id]) continue;
    // Le mot vient d'être étudié : première révision demain
    await db.updateSRS(courseId, id, { ...createSRSEntry(courseId, id), nextReview: getNextReviewDate(1) });
    added++;
  }
  return added;
}

export async function dueVerses() {
  const due = await db.getDueWords(QURAN_COURSE);
  return due.filter(e => e.cardId.startsWith('v:'));
}

// ── Translittération simple (lemmes vocalisés → latin) ───────────────

const CONS = {
  'ب': 'b', 'ت': 't', 'ث': 'th', 'ج': 'j', 'ح': 'ḥ', 'خ': 'kh', 'د': 'd', 'ذ': 'dh', 'ر': 'r', 'ز': 'z',
  'س': 's', 'ش': 'sh', 'ص': 'ṣ', 'ض': 'ḍ', 'ط': 'ṭ', 'ظ': 'ẓ', 'ع': 'ʿ', 'غ': 'gh', 'ف': 'f', 'ق': 'q',
  'ك': 'k', 'ل': 'l', 'م': 'm', 'ن': 'n', 'ه': 'h', 'ء': 'ʾ', 'أ': 'ʾ', 'إ': 'ʾ', 'ؤ': 'ʾ', 'ئ': 'ʾ', 'ة': 'a',
};
const VOW = { 'َ': 'a', 'ِ': 'i', 'ُ': 'u', 'ً': 'an', 'ٍ': 'in', 'ٌ': 'un' };

export function translitAr(word) {
  if (!word) return '';
  let s = word.replace(/[ٱ]/g, 'ا').replace(/[ۡ]/g, 'ْ').replace(/[ۖ-ۭ]/g, '').replace(/ـ/g, '');
  if (removeHarakats(s) === 'الله') return 'Allāh';
  let out = '';
  const prefix = '';
  const ch = [...s];
  for (let i = 0; i < ch.length; i++) {
    const c = ch[i], next = ch[i + 1], prev = out.slice(-1);
    if (VOW[c]) { out += VOW[c]; continue; }
    if (c === 'ّ') { // shadda : double la consonne, que la voyelle soit écrite avant ou après
      const m = out.match(/(sh|th|kh|dh|gh|[^aiuāīū])([aiu]?)$/);
      if (m) out = out.slice(0, out.length - m[0].length) + m[1] + m[1] + m[2];
      continue;
    }
    if (c === 'ْ') continue;
    if (c === 'ٰ') { out = prev === 'a' ? out.slice(0, -1) + 'ā' : out + 'ā'; continue; }
    if (c === 'ا' && i === 0) { out += next === 'ل' ? 'a' : 'i'; continue; } // alif initial sans voyelle
    if (c === 'ا' || c === 'ى') { out = prev === 'a' ? out.slice(0, -1) + 'ā' : out + 'ā'; continue; }
    if (c === 'آ') { out += 'ʾā'; continue; }
    if (c === 'و') { if (prev === 'u' && !VOW[next] && next !== 'ّ') { out = out.slice(0, -1) + 'ū'; } else out += 'w'; continue; }
    if (c === 'ي') { if (prev === 'i' && !VOW[next] && next !== 'ّ') { out = out.slice(0, -1) + 'ī'; } else out += 'y'; continue; }
    if (CONS[c]) { out += (i === 0 && 'أإء'.includes(c)) ? '' : CONS[c]; continue; }
  }
  return prefix + out;
}
